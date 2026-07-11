import type { CollectionAfterDeleteHook } from 'payload'

import { dispatchEvent } from '../dispatcher/dispatchEvent.js'
import type { CollectionHookConfig, HookFactoryOptions } from '../types.js'

/**
 * Resolves the event name using a custom function or the default pattern.
 */
function resolveEventName(
  slug: string,
  config?: CollectionHookConfig,
): string {
  if (config?.eventName) {
    try {
      return config.eventName({ collection: slug, operation: 'delete' })
    } catch {
      // Fall through to default if custom naming fails.
    }
  }
  return `${slug}.deleted`
}

/**
 * Factory function that creates a Payload `afterDelete` collection hook.
 *
 * The returned hook calls `dispatchEvent` with the configured options.
 * It respects the `condition`, `transform`, and `eventName` config.
 *
 * **Zero-blocking guarantee**: All condition/transform errors are caught
 * silently. The hook always returns `doc` without throwing.
 *
 * @example
 * ```ts
 * import { createAfterDeleteHook } from 'payload-plugin-realtime-notifications'
 *
 * const collection: CollectionConfig = {
 *   slug: 'orders',
 *   hooks: {
 *     afterDelete: [
 *       createAfterDeleteHook({
 *         slug: 'orders',
 *         config: {
 *           condition: ({ doc }) => doc.status !== 'draft',
 *         },
 *       }),
 *     ],
 *   },
 *   fields: [],
 * }
 * ```
 */
export function createAfterDeleteHook(
  options: HookFactoryOptions,
): CollectionAfterDeleteHook {
  const { slug, config, saasGatewayUrl } = options

  return ({ doc, req }) => {
    try {
      // ── Event filter ────────────────────────────────────
      if (config?.events && !config.events.includes('delete')) {
        return doc
      }

      const docData = doc as Record<string, unknown>

      // ── Condition guard ─────────────────────────────────
      if (config?.condition) {
        try {
          const shouldDispatch = config.condition({
            doc: docData,
            operation: 'delete',
            collection: slug,
          })
          if (!shouldDispatch) return doc
        } catch {
          // Condition threw — skip dispatch (fail-safe).
          return doc
        }
      }

      // ── Data transform ──────────────────────────────────
      let data: Record<string, unknown> = docData
      if (config?.transform) {
        try {
          data = config.transform({
            doc: docData,
            operation: 'delete',
            collection: slug,
          })
        } catch {
          // Transform threw — fall back to full document.
          data = docData
        }
      }

      // ── Event name ──────────────────────────────────────
      const eventName = resolveEventName(slug, config)

      // ── Dispatch (fire-and-forget) ──────────────────────
      dispatchEvent(
        req.payload,
        {
          event: eventName,
          collection: slug,
          operation: 'delete',
          data,
        },
        { saasGatewayUrl },
      )
    } catch {
      // Outer catch — guarantees the hook never throws.
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn(`[notifications] afterDelete hook error for "${slug}"`)
      }
    }

    return doc
  }
}
