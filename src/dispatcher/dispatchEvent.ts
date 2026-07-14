import crypto from 'crypto'
import type { Payload } from 'payload'

import type { DispatchTarget, NotificationEvent, NotificationSettingsData } from '../types.js'

/** Default SaaS gateway endpoint. */
const DEFAULT_SAAS_GATEWAY_URL = 'https://api.yoursaas.com/v1'

// ---------------------------------------------------------------------------
// Signature Helper for Self-Hosted Pusher-Compatible WebSockets (Sockudo, Soketi, etc.)
// ---------------------------------------------------------------------------

function signPusherRequest({
  appKey,
  appSecret,
  host,
  protocol,
  path,
  body,
}: {
  appKey: string
  appSecret: string
  host: string
  protocol: string
  path: string
  body: string
}): string {
  const bodyMd5 = crypto.createHash('md5').update(body).digest('hex')
  const authTimestamp = Math.floor(Date.now() / 1000).toString()

  const queryParams = {
    auth_key: appKey,
    auth_timestamp: authTimestamp,
    auth_version: '1.0',
    body_md5: bodyMd5,
  }

  // Sort query parameters alphabetically by key
  const sortedKeys = Object.keys(queryParams).sort() as Array<keyof typeof queryParams>
  const queryString = sortedKeys
    .map((key) => `${key}=${queryParams[key]}`)
    .join('&')

  const signString = `POST\n${path}\n${queryString}`
  const signature = crypto.createHmac('sha256', appSecret).update(signString).digest('hex')

  return `${protocol}://${host}${path}?${queryString}&auth_signature=${signature}`
}

// ---------------------------------------------------------------------------
// Target Resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the concrete HTTP endpoint and auth headers from the
 * persisted `NotificationSettings` Global document.
 *
 * Returns `null` when the configuration is incomplete (e.g. self-hosted
 * mode but no `sockudoUrl`), which causes the dispatcher to silently
 * skip the event — graceful degradation.
 *
 * @internal
 */
export function resolveTargets(
  settings: NotificationSettingsData,
  event: NotificationEvent,
  gatewayOverride?: string,
): DispatchTarget[] {
  const targets: DispatchTarget[] = []

  if (settings.mode === 'saas') {
    if (settings.saasApiKey) {
      const baseUrl = gatewayOverride ?? DEFAULT_SAAS_GATEWAY_URL
      targets.push({
        url: `${baseUrl.replace(/\/+$/, '')}/dispatch`,
        headers: {
          Authorization: `Bearer ${settings.saasApiKey}`,
          'Content-Type': 'application/json',
        },
        // SaaS Gateway expects the raw event payload
        body: JSON.stringify(event),
      })
    }
    return targets
  }

  // ---- Self-Hosted: Pusher-Compatible WebSockets (Sockudo, Soketi, etc.) ----
  if (settings.wsHost) {
    if (
      settings.wsAppId &&
      settings.wsAppKey &&
      settings.wsAppSecret
    ) {
      const rawHost = settings.wsHost.replace(/^https?:\/\//, '').replace(/\/+$/, '')
      const protocol =
        settings.wsHost.startsWith('https') || settings.wsPort === 443 ? 'https' : 'http'
      const port = settings.wsPort ? `:${settings.wsPort}` : ''

      const path = `/apps/${settings.wsAppId}/events`

      // Pusher HTTP API requires stringified data
      const pusherBody = JSON.stringify({
        name: event.event,
        channels: [event.collection],
        data: JSON.stringify({
          ...event.data,
          timestamp: event.timestamp,
        }),
      })

      const finalUrl = signPusherRequest({
        appKey: settings.wsAppKey,
        appSecret: settings.wsAppSecret,
        host: `${rawHost}${port}`,
        protocol,
        path,
        body: pusherBody,
      })

      targets.push({
        url: finalUrl,
        headers: {
          'Content-Type': 'application/json',
        },
        body: pusherBody,
      })
    } else {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn(
          '[notifications] WebSocket server is partially configured, but missing App ID, App Key, or App Secret. Skipping WebSocket dispatch.',
        )
      }
    }
  }

  // ---- Self-Hosted: Apprise ----
  if (settings.appriseUrl) {
    const baseUrl = settings.appriseUrl.replace(/\/+$/, '')
    const configKey = settings.appriseConfigKey || 'apprise'
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    
    if (settings.appriseBearerToken) {
      headers['Authorization'] = `Bearer ${settings.appriseBearerToken}`
    }

    // Apprise expects a specific JSON shape for push notifications
    const appriseBody: Record<string, any> = {
      title: event.event,
      body: JSON.stringify(event.data),
    }

    if (settings.appriseTags) {
      appriseBody.tags = settings.appriseTags
    }

    targets.push({
      url: `${baseUrl}/notify/${configKey}`,
      headers,
      body: JSON.stringify(appriseBody),
    })
  }

  return targets
}

// ---------------------------------------------------------------------------
// Central Dispatcher
// ---------------------------------------------------------------------------

/**
 * Dispatches a notification event to the configured target.
 *
 * **Design guarantees:**
 * 1. The entire function body is wrapped in `try/catch` — it never throws.
 * 2. The `fetch()` call is **not awaited** — it is fire-and-forget.
 * 3. If notifications are disabled or misconfigured, it returns immediately.
 *
 * This ensures that Payload's `afterChange` / `afterDelete` hooks never
 * hang or crash, regardless of the notification service's availability.
 *
 * @param payload  - The Payload instance (used to read the Global).
 * @param event    - The notification event to dispatch.
 * @param options  - Optional overrides (e.g. custom gateway URL).
 */
export function dispatchEvent(
  payload: Payload,
  event: NotificationEvent,
  options?: { saasGatewayUrl?: string },
): void {
  try {
    // Stamp the event with a timestamp if not already provided.
    const eventWithTimestamp: NotificationEvent = {
      ...event,
      timestamp: event.timestamp ?? Date.now(),
    }

    // Read settings, resolve target, and fire — all in a single
    // promise chain that is intentionally NOT awaited.
    void payload
      .findGlobal({ slug: 'notification-settings' })
      .then((rawSettings) => {
        const settings = rawSettings as unknown as NotificationSettingsData
        // ── Zero-blocking gate ──────────────────────────────
        if (!settings.enabled) return

        const targets = resolveTargets(settings, eventWithTimestamp, options?.saasGatewayUrl)
        if (targets.length === 0) return

        // ── Fire-and-forget fetches ───────────────────────────
        for (const target of targets) {
          void fetch(target.url, {
            method: 'POST',
            headers: target.headers,
            body: target.body,
          })
            .then(async (res) => {
              if (!res.ok) {
                if (process.env.NODE_ENV === 'development') {
                  const errorBody = await res.text().catch(() => 'No response body')
                  // eslint-disable-next-line no-console
                  console.warn(
                    `[notifications] dispatch returned status ${res.status} for target ${target.url.split('?')[0]}. Response: ${errorBody}`,
                  )
                }
              }
            })
            .catch((fetchError: unknown) => {
              // Network failure — swallow silently in production.
              if (process.env.NODE_ENV === 'development') {
                // eslint-disable-next-line no-console
                console.warn(
                  `[notifications] dispatch network failure for target ${target.url.split('?')[0]}:`,
                  fetchError instanceof Error ? fetchError.message : fetchError,
                )
              }
            })
        }
      })
      .catch((settingsError: unknown) => {
        // Global read failure (e.g. DB not ready, plugin disabled).
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.warn(
            '[notifications] could not read notification-settings:',
            settingsError instanceof Error ? settingsError.message : settingsError,
          )
        }
      })
  } catch (outerError: unknown) {
    // Absolute last-resort catch — should never be reached, but
    // guarantees the CMS never crashes due to this plugin.
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[notifications] unexpected dispatcher error:', outerError)
    }
  }
}
