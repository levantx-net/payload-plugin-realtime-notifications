'use client'

import * as PusherModule from 'pusher-js'
import React, { createContext, use, useEffect, useMemo, useRef, useState } from 'react'

import type { ConnectionStatus, NotificationClientConfig } from './types.js'

// ---------------------------------------------------------------------------
// Pusher Client Type & Constructor
// ---------------------------------------------------------------------------

/**
 * Minimal interface for the Pusher client covering the API surface
 * this plugin uses. Avoids deep subpath imports into pusher-js internals
 * which break under NodeNext module resolution.
 */
interface PusherChannel {
  bind: (event: string, callback: (...args: any[]) => void) => void
  unbind: (event: string, callback: (...args: any[]) => void) => void
  bind_global: (callback: (...args: any[]) => void) => void
  unbind_global: (callback: (...args: any[]) => void) => void
}

interface PusherConnection {
  bind: (event: string, callback: (...args: any[]) => void) => void
}

interface PusherClient {
  connection: PusherConnection
  subscribe: (channel: string) => PusherChannel
  unsubscribe: (channel: string) => void
  disconnect: () => void
}

// pusher-js exports `export { default } from './types/src/core/pusher'`.
// Under ESM/NodeNext, the actual class may be nested at `.default`.
const PusherConstructor = (
  'default' in PusherModule ? (PusherModule as Record<string, unknown>).default : PusherModule
) as new (key: string, opts: Record<string, unknown>) => PusherClient

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface NotificationContextValue {
  /** The Pusher client instance, or `null` if not yet initialized. */
  client: PusherClient | null
  /** Current WebSocket connection status. */
  status: ConnectionStatus
}

const NotificationContext = createContext<NotificationContextValue>({
  client: null,
  status: 'disconnected',
})

/**
 * Access the notification context directly.
 * Prefer `useNotifications` and `useConnectionStatus` for most use cases.
 *
 * @internal
 */
export function useNotificationContext(): NotificationContextValue {
  return use(NotificationContext)
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface NotificationProviderProps {
  /** Pusher/Sockudo connection configuration. */
  config: NotificationClientConfig
  children: React.ReactNode
}

/**
 * Provides a Pusher client instance to the component tree.
 *
 * Manages the full client lifecycle:
 * - Creates the Pusher client on mount
 * - Monitors connection state changes
 * - Disconnects cleanly on unmount
 *
 * @example
 * ```tsx
 * // Self-hosted Sockudo
 * <NotificationProvider config={{
 *   appKey: 'my-app-key',
 *   wsHost: 'ws.example.com',
 *   forceTLS: true,
 * }}>
 *   <App />
 * </NotificationProvider>
 *
 * // Managed SaaS
 * <NotificationProvider config={{
 *   appKey: 'saas-provided-key',
 *   cluster: 'eu',
 * }}>
 *   <App />
 * </NotificationProvider>
 * ```
 */
export function NotificationProvider({ config, children }: NotificationProviderProps) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const clientRef = useRef<PusherClient | null>(null)

  // Memoize the config to avoid re-creating the client on every render.
  // We serialize to JSON for a stable comparison.
  const configKey = useMemo(() => JSON.stringify(config), [config])

  useEffect(() => {
    let pusher: PusherClient

    try {
      pusher = new PusherConstructor(config.appKey, {
        cluster: config.cluster ?? 'mt1',
        wsHost: config.wsHost,
        wsPort: config.wsPort,
        wssPort: config.wssPort,
        forceTLS: config.forceTLS ?? true,
        enabledTransports: config.enabledTransports ?? ['ws', 'wss'],
        disableStats: config.disableStats ?? false,
        // Pusher logging
        ...(config.enableLogging ? { enableLogging: true } : {}),
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        '[notifications] Failed to create Pusher client. Is pusher-js installed?',
        err instanceof Error ? err.message : err,
      )
      setStatus('error')
      return
    }

    clientRef.current = pusher

    // ── Connection state listeners ──────────────────────────
    pusher.connection.bind('connected', () => {
      setStatus('connected')
    })

    pusher.connection.bind('connecting', () => {
      setStatus('connecting')
    })

    pusher.connection.bind('disconnected', () => {
      setStatus('disconnected')
    })

    pusher.connection.bind('failed', () => {
      setStatus('error')
    })

    pusher.connection.bind('unavailable', () => {
      setStatus('error')
    })

    // ── Cleanup ─────────────────────────────────────────────
    return () => {
      pusher.disconnect()
      clientRef.current = null
      setStatus('disconnected')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey])

  const contextValue = useMemo<NotificationContextValue>(
    () => ({
      client: clientRef.current,
      status,
    }),
    // clientRef.current changes are tracked via the configKey effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, configKey],
  )

  return <NotificationContext value={contextValue}>{children}</NotificationContext>
}
