import type { CollectionAfterChangeHook } from 'payload'

import { dispatchEvent } from '../dispatcher/dispatchEvent.js'
import type { CollectionHookConfig, HookFactoryOptions } from '../types.js'

/**
 * Resolves the operation label for event naming.
 */
function resolveOperationLabel(operation: 'create' | 'update'): string {
  return operation === 'create' ? 'created' : 'updated'
}

/**
 * Resolves the event name using a custom function or the default pattern.
 */
function resolveEventName(
  slug: string,
  operation: 'create' | 'update',
  config?: CollectionHookConfig,
): string {
  if (config?.eventName) {
    try {
      return config.eventName({ collection: slug, operation })
    } catch {
      // Fall through to default if custom naming fails.
    }
  }
  return `${slug}.${resolveOperationLabel(operation)}`
}

/**
 * Factory function that creates a Payload `afterChange` collection hook.
 *
 * The returned hook calls `dispatchEvent` with the configured options.
 * It respects the `condition`, `transform`, and `eventName` config.
 *
 * **Zero-blocking guarantee**: All condition/transform errors are caught
 * silently. The hook always returns `doc` without throwing.
 *
 * @example
 * ```ts
 * import { createAfterChangeHook } from 'payload-plugin-realtime-notifications'
 *
 * const collection: CollectionConfig = {
 *   slug: 'orders',
 *   hooks: {
 *     afterChange: [
 *       createAfterChangeHook({
 *         slug: 'orders',
 *         config: {
 *           events: ['create'],
 *           condition: ({ doc }) => doc.status === 'paid',
 *           transform: ({ doc }) => ({ orderId: doc.id }),
 *         },
 *       }),
 *     ],
 *   },
 *   fields: [],
 * }
 * ```
 */
export function createAfterChangeHook(
  options: HookFactoryOptions,
): CollectionAfterChangeHook {
  const { slug, config, saasGatewayUrl } = options

  return ({ doc, operation, req }) => {
    try {
      const op = operation as 'create' | 'update'

      // ── Event filter ────────────────────────────────────
      if (config?.events && !config.events.includes(op)) {
        return doc
      }

      const docData = doc as Record<string, unknown>

      // ── Condition guard ─────────────────────────────────
      if (config?.condition) {
        try {
          const shouldDispatch = config.condition({
            doc: docData,
            operation: op,
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
            operation: op,
            collection: slug,
          })
        } catch {
          // Transform threw — fall back to full document.
          data = docData
        }
      }

      // ── Event name ──────────────────────────────────────
      const eventName = resolveEventName(slug, op, config)

      // ── Dispatch (fire-and-forget) ──────────────────────
      dispatchEvent(
        req.payload,
        {
          event: eventName,
          collection: slug,
          operation: op,
          data,
        },
        { saasGatewayUrl },
      )
    } catch {
      // Outer catch — guarantees the hook never throws.
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn(`[notifications] afterChange hook error for "${slug}"`)
      }
    }

    return doc
  }
}
