'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useNotificationContext } from './NotificationProvider.js'
import type { NotificationMessage, UseNotificationsOptions } from './types.js'

interface UseNotificationsReturn<T> {
  /** All received messages (newest last). */
  messages: NotificationMessage<T>[]

  /** The most recently received message, or `null`. */
  lastMessage: NotificationMessage<T> | null

  /** Clear the accumulated messages array. */
  clearMessages: () => void

  /** Whether the hook is actively subscribed to the channel. */
  isSubscribed: boolean
}

/**
 * Subscribe to real-time notification events on a Pusher/Sockudo channel.
 *
 * Must be used within a `<NotificationProvider>`.
 *
 * @example
 * ```tsx
 * // Listen to specific events
 * const { messages, lastMessage } = useNotifications({
 *   channel: 'orders',
 *   events: ['orders.created', 'orders.updated'],
 * })
 *
 * // Listen to ALL events on a channel
 * const { messages } = useNotifications({ channel: 'global' })
 *
 * // Conditionally subscribe
 * const { messages } = useNotifications({
 *   channel: 'orders',
 *   enabled: user.isAdmin,
 * })
 * ```
 */
export function useNotifications<T = Record<string, unknown>>(
  options: UseNotificationsOptions,
): UseNotificationsReturn<T> {
  const { channel, events, enabled = true } = options
  const { client } = useNotificationContext()

  const [messages, setMessages] = useState<NotificationMessage<T>[]>([])
  const [isSubscribed, setIsSubscribed] = useState(false)

  // Use a ref for the events array to avoid re-subscribing on every render
  // when the consumer passes an inline array literal.
  const eventsRef = useRef(events)
  eventsRef.current = events

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  useEffect(() => {
    if (!client || !enabled) {
      setIsSubscribed(false)
      return
    }

    const pusherChannel = client.subscribe(channel)
    setIsSubscribed(true)

    /**
     * Handler for incoming events.
     * Wraps the raw data in a `NotificationMessage` and appends to state.
     */
    const handleEvent = (eventName: string) => (data: unknown) => {
      const message: NotificationMessage<T> = {
        event: eventName,
        data: (typeof data === 'object' && data !== null ? data : { raw: data }) as T,
        receivedAt: Date.now(),
      }

      setMessages((prev) => [...prev, message])
    }

    // ── Bind to specific events or all events ─────────────
    const boundHandlers: Array<{ event: string; handler: (data: unknown) => void }> = []

    const currentEvents = eventsRef.current
    if (currentEvents && currentEvents.length > 0) {
      // Listen to specific named events.
      for (const eventName of currentEvents) {
        const handler = handleEvent(eventName)
        pusherChannel.bind(eventName, handler)
        boundHandlers.push({ event: eventName, handler })
      }
    } else {
      // Listen to ALL events on the channel using bind_global.
      const globalHandler = (eventName: string, data: unknown) => {
        // Skip Pusher internal events (prefixed with `pusher:` or `pusher_internal:`)
        if (eventName.startsWith('pusher:') || eventName.startsWith('pusher_internal:')) {
          return
        }
        handleEvent(eventName)(data)
      }
      pusherChannel.bind_global(globalHandler)

      // Store a special entry so we can unbind on cleanup.
      boundHandlers.push({
        event: '__global__',
        handler: globalHandler as unknown as (data: unknown) => void,
      })
    }

    // ── Cleanup ─────────────────────────────────────────────
    return () => {
      for (const { event, handler } of boundHandlers) {
        if (event === '__global__') {
          pusherChannel.unbind_global(handler as unknown as (...args: unknown[]) => void)
        } else {
          pusherChannel.unbind(event, handler)
        }
      }
      client.unsubscribe(channel)
      setIsSubscribed(false)
    }
  }, [client, channel, enabled])

  const lastMessage = messages.length > 0 ? messages[messages.length - 1]! : null

  return {
    messages,
    lastMessage,
    clearMessages,
    isSubscribed,
  }
}
