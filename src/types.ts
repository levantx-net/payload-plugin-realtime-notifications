import type { CollectionSlug } from 'payload'

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

/**
 * Determines how notifications are dispatched.
 * - `saas`         — Events are sent to the managed SaaS gateway.
 * - `self-hosted`  — Events are sent directly to a user-managed
 *                     Sockudo / Apprise instance.
 */
export type NotificationMode = 'saas' | 'self-hosted'

// ---------------------------------------------------------------------------
// Plugin Options (consumer-facing)
// ---------------------------------------------------------------------------

/**
 * Options accepted by the `notificationsPlugin()` factory function.
 * Passed by the consumer inside their `payload.config.ts`.
 */
export interface PluginOptions {
  /**
   * Collections that should have notification hooks attached.
   * Map a collection slug to `true` to opt it in.
   *
   * @example
   * ```ts
   * collections: { posts: true, orders: true }
   * ```
   */
  collections?: Partial<Record<CollectionSlug, true>>

  /**
   * Kill-switch. When `true` the plugin still injects its Global schema
   * (to keep the DB schema consistent for migrations) but skips all
   * runtime behaviour — hooks, endpoints, and admin components.
   *
   * @default false
   */
  disabled?: boolean

  /**
   * Override the default SaaS gateway URL.
   * Only relevant when `mode` is `'saas'`.
   *
   * @default 'https://api.yoursaas.com/v1'
   */
  saasGatewayUrl?: string
}

// ---------------------------------------------------------------------------
// NotificationSettings Global (database shape)
// ---------------------------------------------------------------------------

/**
 * Mirrors the fields stored in the `notification-settings` Global.
 * This is the shape returned by `payload.findGlobal({ slug: 'notification-settings' })`.
 */
export interface NotificationSettingsData {
  /** Master on/off toggle. When `false`, `dispatchEvent` is a no-op. */
  enabled: boolean

  /** Delivery mode — SaaS gateway or self-hosted infrastructure. */
  mode: NotificationMode

  /** API key issued by the SaaS gateway after the OAuth handshake. */
  saasApiKey?: string

  /** Tenant identifier issued alongside the API key. */
  tenantId?: string

  /** Base URL of the user's self-hosted Sockudo WebSocket server. */
  sockudoUrl?: string

  /** Base URL of the user's self-hosted Apprise notification server. */
  appriseUrl?: string
}

// ---------------------------------------------------------------------------
// Notification Event (dispatcher contract)
// ---------------------------------------------------------------------------

/**
 * The payload passed to `dispatchEvent()`.
 * Intentionally uses a plain `string` for `event` rather than an enum
 * so consumers can define arbitrary event names per-collection.
 */
export interface NotificationEvent {
  /**
   * A dot-namespaced event name, e.g. `'posts.created'`, `'orders.updated'`.
   */
  event: string

  /**
   * The collection slug that triggered the event.
   */
  collection: CollectionSlug

  /**
   * The operation that occurred.
   */
  operation: 'create' | 'update' | 'delete'

  /**
   * The document data. Kept as `Record<string, unknown>` to avoid
   * coupling the plugin to any specific collection shape.
   */
  data: Record<string, unknown>

  /**
   * Optional timestamp. Defaults to `Date.now()` inside the dispatcher.
   */
  timestamp?: number
}

// ---------------------------------------------------------------------------
// Dispatch Target (internal — resolved by the dispatcher)
// ---------------------------------------------------------------------------

/**
 * Resolved endpoint configuration derived from `NotificationSettingsData`.
 * Used internally by `dispatchEvent` — not exposed to consumers.
 *
 * @internal
 */
export interface DispatchTarget {
  /** Fully-qualified URL to POST the event to. */
  url: string

  /** HTTP headers (e.g. `Authorization: Bearer <key>`). */
  headers: Record<string, string>
}
