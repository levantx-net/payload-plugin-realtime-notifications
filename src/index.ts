import type { Config } from 'payload'

import { NotificationSettings } from './globals/NotificationSettings.js'
import { createAfterChangeHook } from './hooks/createAfterChangeHook.js'
import { createAfterDeleteHook } from './hooks/createAfterDeleteHook.js'
import type { CollectionHookConfig, PluginOptions } from './types.js'

// ---------------------------------------------------------------------------
// Re-exports — public API surface
// ---------------------------------------------------------------------------

export { dispatchEvent } from './dispatcher/dispatchEvent.js'
export { resolveTarget } from './dispatcher/dispatchEvent.js'
export { createAfterChangeHook } from './hooks/createAfterChangeHook.js'
export { createAfterDeleteHook } from './hooks/createAfterDeleteHook.js'
export type {
  CollectionHookConfig,
  CollectionHookEntry,
  DataTransformArgs,
  DispatchTarget,
  EventNameArgs,
  HookConditionArgs,
  HookFactoryOptions,
  NotificationEvent,
  NotificationMode,
  NotificationSettingsData,
  PluginOptions,
} from './types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes a collection hook entry into a `CollectionHookConfig`.
 * - `true` becomes `{}` (all defaults).
 * - An object is passed through as-is.
 */
function normalizeHookEntry(entry: true | CollectionHookConfig): CollectionHookConfig {
  return entry === true ? {} : entry
}

// ---------------------------------------------------------------------------
// Plugin Factory
// ---------------------------------------------------------------------------

/**
 * Payload CMS plugin that adds real-time notification dispatching.
 *
 * The plugin is **stateless** — it is an event publisher, not a
 * connection manager. All dispatch calls are fire-and-forget and
 * wrapped in `try/catch` to guarantee zero-blocking behaviour.
 *
 * @example
 * ```ts
 * // payload.config.ts
 * import { notificationsPlugin } from 'payload-plugin-realtime-notifications'
 *
 * export default buildConfig({
 *   plugins: [
 *     notificationsPlugin({
 *       collections: {
 *         posts: true,
 *         orders: {
 *           events: ['create', 'update'],
 *           condition: ({ doc }) => doc.status === 'paid',
 *         },
 *       },
 *     }),
 *   ],
 * })
 * ```
 */
export const notificationsPlugin =
  (pluginOptions: PluginOptions) =>
  (config: Config): Config => {
    // ── Ensure arrays exist ───────────────────────────────────
    if (!config.globals) {
      config.globals = []
    }

    // ── Inject the NotificationSettings Global ────────────────
    // Always inject — even when disabled — so the DB schema stays
    // consistent for migrations.
    config.globals.push(NotificationSettings)

    // ── Early exit if disabled ────────────────────────────────
    // Schema is already injected above, so the database remains
    // consistent. We just skip all runtime behaviour.
    if (pluginOptions.disabled) {
      return config
    }

    // ── Admin UI setup ────────────────────────────────────────
    if (!config.admin) {
      config.admin = {}
    }

    // Store the gateway URL override (if any) on the config so
    // hooks can access it at runtime without re-reading plugin options.
    // We use Payload's `custom` bag for this.
    if (!config.custom) {
      config.custom = {}
    }
    config.custom.notificationsPluginOptions = {
      saasGatewayUrl: pluginOptions.saasGatewayUrl,
    }

    // ── Collection hooks ──────────────────────────────────────
    if (pluginOptions.collections && config.collections) {
      for (const [slug, entry] of Object.entries(pluginOptions.collections)) {
        if (!entry) continue

        const collection = config.collections.find((c) => c.slug === slug)
        if (!collection) continue

        const hookConfig = normalizeHookEntry(entry)

        if (!collection.hooks) {
          collection.hooks = {}
        }

        // -- afterChange hook (create + update) --
        const shouldHookChange =
          !hookConfig.events ||
          hookConfig.events.includes('create') ||
          hookConfig.events.includes('update')

        if (shouldHookChange) {
          if (!collection.hooks.afterChange) {
            collection.hooks.afterChange = []
          }
          collection.hooks.afterChange.push(
            createAfterChangeHook({
              slug,
              config: hookConfig,
              saasGatewayUrl: pluginOptions.saasGatewayUrl,
            }),
          )
        }

        // -- afterDelete hook --
        const shouldHookDelete =
          !hookConfig.events || hookConfig.events.includes('delete')

        if (shouldHookDelete) {
          if (!collection.hooks.afterDelete) {
            collection.hooks.afterDelete = []
          }
          collection.hooks.afterDelete.push(
            createAfterDeleteHook({
              slug,
              config: hookConfig,
              saasGatewayUrl: pluginOptions.saasGatewayUrl,
            }),
          )
        }
      }
    }

    // ── Auto-Enrollment (Free Tier out-of-the-box) ───────────
    const existingOnInit = config.onInit
    config.onInit = async (payload) => {
      // 1. Run the consumer's original onInit first
      if (existingOnInit) {
        await existingOnInit(payload)
      }

      // 2. Check if we need to auto-enroll
      try {
        const settings = await payload.findGlobal({ slug: 'notification-settings' })
        
        // If no key exists and it hasn't been explicitly configured yet
        if (!settings?.saasApiKey && settings?.mode !== 'self-hosted') {
          const baseUrl = pluginOptions.saasGatewayUrl ?? 'https://api.yoursaas.com/v1'
          
          try {
            // Hit the SaaS Gateway to generate free-tier credentials
            const res = await fetch(`${baseUrl}/auto-enroll`, { method: 'POST' })
            if (res.ok) {
              const data = (await res.json()) as { saasApiKey: string; tenantId: string }
              
              // Automatically save and activate the settings
              await payload.updateGlobal({
                slug: 'notification-settings',
                data: {
                  enabled: true,
                  mode: 'saas',
                  saasApiKey: data.saasApiKey,
                  tenantId: data.tenantId,
                },
              })
              
              payload.logger.info(
                '[notifications] Automatically enrolled in the Free Tier. Real-time events are now active!',
              )
            }
          } catch (err) {
            // Silently fail if offline or gateway is unreachable
            payload.logger.warn('[notifications] Could not auto-enroll in free tier (network issue).')
          }
        }
      } catch (err) {
        // Ignore errors if the database or collection isn't ready
      }
    }

    return config
  }
