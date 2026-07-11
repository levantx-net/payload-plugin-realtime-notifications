'use client'

import { useEffect, useState } from 'react'
import { useNotificationContext } from './NotificationProvider.js'

export interface PresenceMember<T = Record<string, unknown>> {
  id: string
  info: T
}

export interface UsePresenceReturn<T = Record<string, unknown>> {
  /** Map of user IDs to their custom info payload. */
  members: Record<string, T>
  /** The local client's user ID. */
  myId: string | null
  /** The total number of members in the channel. */
  count: number
  /** Whether the hook is actively subscribed. */
  isSubscribed: boolean
}

/**
 * Subscribe to a presence channel to track online users.
 * The channel name MUST begin with `presence-`.
 * 
 * @example
 * ```tsx
 * const { members, count, myId } = usePresence('presence-chat-room')
 * 
 * return <div>Online Users: {count}</div>
 * ```
 */
export function usePresence<T = Record<string, unknown>>(
  channel: string,
  enabled: boolean = true,
): UsePresenceReturn<T> {
  const { client } = useNotificationContext()

  const [members, setMembers] = useState<Record<string, T>>({})
  const [myId, setMyId] = useState<string | null>(null)
  const [isSubscribed, setIsSubscribed] = useState(false)

  useEffect(() => {
    if (!client || !enabled || !channel.startsWith('presence-')) {
      setIsSubscribed(false)
      return
    }

    // `pusher-js` returns a `PresenceChannel` instance if prefixed with `presence-`
    const pusherChannel = client.subscribe(channel) as any
    setIsSubscribed(true)

    const handleSubscriptionSucceeded = (membersObj: any) => {
      if (!membersObj) return
      setMyId(membersObj.myID)
      // `membersObj.members` is a dictionary: { "user_1": { "name": "Alice" }, ... }
      setMembers({ ...membersObj.members })
    }

    const handleMemberAdded = (member: any) => {
      setMembers((prev) => ({
        ...prev,
        [member.id]: member.info,
      }))
    }

    const handleMemberRemoved = (member: any) => {
      setMembers((prev) => {
        const next = { ...prev }
        delete next[member.id]
        return next
      })
    }

    pusherChannel.bind('pusher:subscription_succeeded', handleSubscriptionSucceeded)
    pusherChannel.bind('pusher:member_added', handleMemberAdded)
    pusherChannel.bind('pusher:member_removed', handleMemberRemoved)

    return () => {
      pusherChannel.unbind('pusher:subscription_succeeded', handleSubscriptionSucceeded)
      pusherChannel.unbind('pusher:member_added', handleMemberAdded)
      pusherChannel.unbind('pusher:member_removed', handleMemberRemoved)
      client.unsubscribe(channel)
      setIsSubscribed(false)
    }
  }, [client, channel, enabled])

  return {
    members,
    myId,
    count: Object.keys(members).length,
    isSubscribed,
  }
}
