'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNotificationContext } from './NotificationProvider.js'

export interface UseTypingIndicatorReturn {
  /** Map of user IDs/names currently typing to the timestamp they last typed. */
  typingUsers: Record<string, number>
  /** `true` if at least one other user is typing. */
  isTyping: boolean
  /** Call this function whenever the local user types a key. It automatically throttles the broadcasts. */
  triggerTyping: () => void
}

/**
 * Tracks and broadcasts "User is typing..." events.
 * 
 * IMPORTANT: Client events can ONLY be sent on `private-` or `presence-` channels.
 * Ensure your channel string starts with one of those prefixes.
 * 
 * @example
 * ```tsx
 * const { isTyping, triggerTyping, typingUsers } = useTypingIndicator('presence-chat', 'Alice')
 * 
 * return (
 *   <div>
 *     <input onChange={triggerTyping} />
 *     {isTyping && <span>Someone is typing...</span>}
 *   </div>
 * )
 * ```
 */
export function useTypingIndicator(
  channel: string,
  localIdentifier: string = 'Anonymous',
  enabled: boolean = true,
): UseTypingIndicatorReturn {
  const { client } = useNotificationContext()
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({})
  
  // Ref for cleanup interval
  const cleanupIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSentRef = useRef<number>(0)

  useEffect(() => {
    if (!client || !enabled) return

    const pusherChannel = client.subscribe(channel) as any

    const handleTyping = (data: { user: string }) => {
      if (data.user === localIdentifier) return // ignore our own events

      setTypingUsers((prev) => ({
        ...prev,
        [data.user]: Date.now(),
      }))
    }

    pusherChannel.bind('client-typing', handleTyping)

    // Cleanup stale typing indicators every 1.5 seconds
    cleanupIntervalRef.current = setInterval(() => {
      const now = Date.now()
      setTypingUsers((prev) => {
        let changed = false
        const next = { ...prev }
        for (const [user, timestamp] of Object.entries(next)) {
          // If haven't typed in 2 seconds, remove them
          if (now - timestamp > 2000) {
            delete next[user]
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, 1500)

    return () => {
      pusherChannel.unbind('client-typing', handleTyping)
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current)
      }
    }
  }, [client, channel, enabled, localIdentifier])

  const triggerTyping = useCallback(() => {
    if (!client || !enabled) return

    const now = Date.now()
    // Throttle client events to max 1 per second
    if (now - lastSentRef.current < 1000) return

    const pusherChannel = client.subscribe(channel) as any
    // trigger() only exists on presence/private channels in Pusher
    if (typeof pusherChannel.trigger === 'function') {
      pusherChannel.trigger('client-typing', { user: localIdentifier })
      lastSentRef.current = now
    }
  }, [client, channel, enabled, localIdentifier])

  return {
    typingUsers,
    isTyping: Object.keys(typingUsers).length > 0,
    triggerTyping,
  }
}
