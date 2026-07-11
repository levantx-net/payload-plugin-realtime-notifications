'use client'

import { useNotificationContext } from './NotificationProvider.js'
import type { ConnectionStatus } from './types.js'

/**
 * Returns the current WebSocket connection status.
 *
 * Must be used within a `<NotificationProvider>`.
 *
 * Use this to:
 * - Show connection indicators in the UI
 * - Trigger HTTP polling fallbacks when disconnected
 * - Conditionally render real-time features
 *
 * @example
 * ```tsx
 * const status = useConnectionStatus()
 *
 * // Show a connection indicator
 * <span>{status === 'connected' ? '🟢 Live' : '🔴 Offline'}</span>
 *
 * // Trigger polling fallback with SWR
 * const { data } = useSWR(
 *   status !== 'connected' ? '/api/orders/recent' : null,
 *   fetcher,
 *   { refreshInterval: 5000 },
 * )
 * ```
 */
export function useConnectionStatus(): ConnectionStatus {
  const { status } = useNotificationContext()
  return status
}
