import type { Payload } from 'payload'

import type { DispatchTarget, NotificationEvent, NotificationSettingsData } from '../types.js'

/** Default SaaS gateway endpoint. */
const DEFAULT_SAAS_GATEWAY_URL = 'https://api.yoursaas.com/v1'

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

  // ---- Self-Hosted: Soketi/Sockudo ----
  if (settings.soketiHost) {
    // Note: To fully support Soketi REST API from the CMS without a proxy,
    // this target requires Pusher HMAC-SHA256 signing. 
    // For now, we dispatch to the raw host as a placeholder.
    const protocol = settings.soketiHost.startsWith('http') ? '' : 'http://'
    const port = settings.soketiPort ? `:${settings.soketiPort}` : ''
    targets.push({
      url: `${protocol}${settings.soketiHost}${port}`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })
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
      body: JSON.stringify(event.payload),
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
          }).catch((fetchError: unknown) => {
            // Network failure — swallow silently in production.
            if (process.env.NODE_ENV === 'development') {
              // eslint-disable-next-line no-console
              console.warn(
                `[notifications] dispatch failed for target ${target.url}:`,
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
