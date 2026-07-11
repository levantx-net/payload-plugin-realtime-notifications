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
   *
   * - Pass `true` for default behaviour (all operations, no filtering).
   * - Pass a `CollectionHookConfig` object for fine-grained control.
   *
   * @example
   * ```ts
   * collections: {
   *   posts: true,
   *   orders: {
   *     events: ['create', 'update'],
   *     condition: ({ doc }) => doc.status === 'paid',
   *     transform: ({ doc }) => ({ orderId: doc.id, total: doc.total }),
   *   },
   * }
   * ```
   */
  collections?: Partial<Record<CollectionSlug, CollectionHookEntry>>

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

// ---------------------------------------------------------------------------
// Phase 2 — Dashboard Types
// ---------------------------------------------------------------------------

/**
 * Response shape from `GET {saasGatewayUrl}/tenant/usage`.
 * Represents the current billing period's usage counters.
 */
export interface UsageData {
  /** Plan name, e.g. "Starter", "Growth". */
  plan: string

  /** Number of WebSocket events dispatched this billing period. */
  websocketCount: number

  /** Maximum WebSocket events allowed by the current plan. */
  websocketLimit: number

  /** Number of push notifications sent this billing period. */
  pushCount: number

  /** Maximum push notifications allowed by the current plan. */
  pushLimit: number
}

/**
 * Display data for a pricing tier card in the DisconnectedView.
 */
export interface PricingTier {
  /** Tier name, e.g. "Starter", "Growth". */
  name: string

  /** Monthly price string, e.g. "$9/mo". */
  price: string

  /** Feature bullet points. */
  features: string[]

  /** Whether this tier is visually highlighted as recommended. */
  recommended?: boolean
}

/**
 * The query parameters appended to the callback URL after a
 * successful OAuth handshake with the SaaS gateway.
 *
 * @internal
 */
export interface HandshakeParams {
  saas_api_key: string
  tenant_id: string
}

// ---------------------------------------------------------------------------
// Phase 3 — Generic Hook Types
// ---------------------------------------------------------------------------

/**
 * Arguments passed to a hook condition predicate.
 */
export interface HookConditionArgs {
  /** The document being created, updated, or deleted. */
  doc: Record<string, unknown>
  /** The operation that triggered the hook. */
  operation: 'create' | 'update' | 'delete'
  /** The collection slug. */
  collection: string
}

/**
 * Arguments passed to a data transform function.
 */
export interface DataTransformArgs {
  /** The full document. */
  doc: Record<string, unknown>
  /** The operation that triggered the hook. */
  operation: 'create' | 'update' | 'delete'
  /** The collection slug. */
  collection: string
}

/**
 * Arguments passed to a custom event name function.
 */
export interface EventNameArgs {
  /** The collection slug. */
  collection: string
  /** The operation that triggered the hook. */
  operation: 'create' | 'update' | 'delete'
}

/**
 * Rich per-collection configuration for notification hooks.
 *
 * All fields are optional — omitting a field uses the default behaviour.
 */
export interface CollectionHookConfig {
  /**
   * Which operations should trigger notifications.
   * Defaults to all: `['create', 'update', 'delete']`.
   */
  events?: Array<'create' | 'update' | 'delete'>

  /**
   * Predicate function. Return `true` to dispatch, `false` to skip.
   * Evaluated *before* the dispatch call.
   *
   * If the predicate throws, the event is silently skipped.
   */
  condition?: (args: HookConditionArgs) => boolean

  /**
   * Transform the document data before it is included in the
   * notification event payload. Useful for stripping sensitive
   * fields or reshaping the data.
   *
   * If the transformer throws, the full document is sent as fallback.
   */
  transform?: (args: DataTransformArgs) => Record<string, unknown>

  /**
   * Custom event name function. Overrides the default
   * `{slug}.{created|updated|deleted}` pattern.
   */
  eventName?: (args: EventNameArgs) => string
}

/**
 * Union type for per-collection hook configuration.
 * - `true` — default behaviour (all operations, no filtering).
 * - `CollectionHookConfig` — fine-grained control.
 */
export type CollectionHookEntry = true | CollectionHookConfig

/**
 * Options accepted by the hook factory functions.
 * Used by `createAfterChangeHook` and `createAfterDeleteHook`.
 */
export interface HookFactoryOptions {
  /** The collection slug this hook is attached to. */
  slug: string

  /** Per-collection hook configuration. Defaults to `{}` (all defaults). */
  config?: CollectionHookConfig

  /** Override for the SaaS gateway URL. */
  saasGatewayUrl?: string
}

