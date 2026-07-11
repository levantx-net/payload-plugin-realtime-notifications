import type { CollectionSlug, Config } from 'payload'

import { dispatchEvent } from './dispatcher/dispatchEvent.js'
import { NotificationSettings } from './globals/NotificationSettings.js'
import type { PluginOptions } from './types.js'

// ---------------------------------------------------------------------------
// Re-exports — public API surface
// ---------------------------------------------------------------------------

export { dispatchEvent } from './dispatcher/dispatchEvent.js'
export { resolveTarget } from './dispatcher/dispatchEvent.js'
export type {
  DispatchTarget,
  NotificationEvent,
  NotificationMode,
  NotificationSettingsData,
  PluginOptions,
} from './types.js'

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
 *       collections: { posts: true, orders: true },
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

    // ── Collection hooks (Phase 3 will expand this) ───────────
    if (pluginOptions.collections && config.collections) {
      for (const slug of Object.keys(pluginOptions.collections)) {
        const collection = config.collections.find((c) => c.slug === slug)
        if (!collection) continue

        if (!collection.hooks) {
          collection.hooks = {}
        }

        // -- afterChange hook --
        if (!collection.hooks.afterChange) {
          collection.hooks.afterChange = []
        }
        collection.hooks.afterChange.push(({ doc, operation, req }) => {
          const eventName = `${slug}.${operation === 'create' ? 'created' : 'updated'}`

          dispatchEvent(req.payload, {
            event: eventName,
            collection: slug as CollectionSlug,
            operation: operation as 'create' | 'update',
            data: doc as Record<string, unknown>,
          }, {
            saasGatewayUrl: pluginOptions.saasGatewayUrl,
          })

          return doc
        })

        // -- afterDelete hook --
        if (!collection.hooks.afterDelete) {
          collection.hooks.afterDelete = []
        }
        collection.hooks.afterDelete.push(({ doc, req }) => {
          const eventName = `${slug}.deleted`

          dispatchEvent(req.payload, {
            event: eventName,
            collection: slug as CollectionSlug,
            operation: 'delete',
            data: doc as Record<string, unknown>,
          }, {
            saasGatewayUrl: pluginOptions.saasGatewayUrl,
          })

          return doc
        })
      }
    }

    return config
  }
