// ---------------------------------------------------------------------------
// Frontend Real-Time Client Types
//
// These types are used by the consumer's frontend app (Next.js, React).
// They have ZERO dependency on Payload — only React and pusher-js.
// ---------------------------------------------------------------------------

/**
 * Configuration for the `NotificationProvider`.
 * Maps closely to Pusher client options, with sensible defaults
 * for Sockudo (self-hosted) compatibility.
 */
export interface NotificationClientConfig {
  /**
   * The Pusher/Sockudo application key.
   * For SaaS mode, this is provided by the managed service.
   * For self-hosted, this is configured in your Sockudo instance.
   */
  appKey: string

  /**
   * Pusher cluster (e.g. `'eu'`, `'us2'`).
   * Not required for self-hosted Sockudo instances.
   *
   * @default 'mt1'
   */
  cluster?: string

  /**
   * WebSocket host for self-hosted Sockudo instances.
   * When set, overrides the default Pusher host.
   *
   * @example 'ws.example.com'
   */
  wsHost?: string

  /**
   * WebSocket port (non-TLS).
   * @default 80
   */
  wsPort?: number

  /**
   * WebSocket secure port (TLS).
   * @default 443
   */
  wssPort?: number

  /**
   * Force TLS for WebSocket connections.
   * @default true
   */
  forceTLS?: boolean

  /**
   * Restrict the transports Pusher will use.
   * Defaults to `['ws', 'wss']` for WebSocket-only.
   */
  enabledTransports?: Array<'ws' | 'wss'>

  /**
   * Disable sending stats to Pusher's logging servers.
   * Highly recommended when using self-hosted WebSockets like Sockudo.
   * @default false
   */
  disableStats?: boolean

  /**
   * Enable Pusher client logging for debugging.
   * @default false
   */
  enableLogging?: boolean

  /**
   * Endpoint for authenticating private- and presence- channels.
   * Example: '/api/ws/auth'
   */
  authEndpoint?: string
}

/**
 * WebSocket connection state.
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

/**
 * Generic wrapper for a received notification message.
 * `T` is the shape of the event data payload.
 */
export interface NotificationMessage<T = Record<string, unknown>> {
  /** The event name, e.g. `'orders.created'`. */
  event: string

  /** The parsed event data payload. */
  data: T

  /** Timestamp when the message was received by the client. */
  receivedAt: number
}

/**
 * Options for the `useNotifications` hook.
 */
export interface UseNotificationsOptions {
  /**
   * The channel name to subscribe to.
   * @example 'orders'
   */
  channel: string

  /**
   * Event names to listen for on the channel.
   * If omitted, listens for ALL events on the channel.
   *
   * @example ['orders.created', 'orders.updated']
   */
  events?: string[]

  /**
   * Whether the subscription is enabled.
   * Set to `false` to temporarily pause without unmounting.
   *
   * @default true
   */
  enabled?: boolean
}
