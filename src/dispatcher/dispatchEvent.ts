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
export function resolveTarget(
  settings: NotificationSettingsData,
  gatewayOverride?: string,
): DispatchTarget | null {
  if (settings.mode === 'saas') {
    if (!settings.saasApiKey) return null

    const baseUrl = gatewayOverride ?? DEFAULT_SAAS_GATEWAY_URL

    return {
      url: `${baseUrl.replace(/\/+$/, '')}/dispatch`,
      headers: {
        Authorization: `Bearer ${settings.saasApiKey}`,
        'Content-Type': 'application/json',
      },
    }
  }

  // self-hosted — prefer sockudoUrl, fall back to appriseUrl
  const url = settings.sockudoUrl ?? settings.appriseUrl
  if (!url) return null

  return {
    url: url.replace(/\/+$/, ''),
    headers: {
      'Content-Type': 'application/json',
    },
  }
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

        const target = resolveTarget(settings, options?.saasGatewayUrl)
        if (!target) return

        // ── Fire-and-forget fetch ───────────────────────────
        // The void + .catch ensures no unhandled rejection.
        void fetch(target.url, {
          method: 'POST',
          headers: target.headers,
          body: JSON.stringify(eventWithTimestamp),
        }).catch((fetchError: unknown) => {
          // Network failure — swallow silently in production.
          // In development, log a single-line warning so devs
          // know notifications aren't reaching the target.
          if (process.env.NODE_ENV === 'development') {
            // eslint-disable-next-line no-console
            console.warn(
              `[notifications] dispatch failed for "${eventWithTimestamp.event}":`,
              fetchError instanceof Error ? fetchError.message : fetchError,
            )
          }
        })
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
