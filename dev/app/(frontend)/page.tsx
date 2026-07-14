'use client'

import { useEffect, useRef, useState } from 'react'

import { useConnectionStatus, useNotifications, usePresence, useTypingIndicator, LiveIndicator } from 'payload-plugin-realtime-notifications/react'

export default function LiveFeedPage() {
  const status = useConnectionStatus()
  const [localUser] = useState(() => 'User_' + Math.floor(Math.random() * 10000))

  const { members, count: presenceCount, myId } = usePresence<{ email: string }>('presence-chat-room')
  const { isTyping, typingUsers, triggerTyping } = useTypingIndicator('presence-chat-room', localUser)

  // Existing Posts feed
  const { messages: postMessages, clearMessages: clearPostMessages } = useNotifications<{
    id: string | number
    title: string
    timestamp: string
  }>({
    channel: 'posts',
    events: ['feed.post.published'],
  })

  // NEW: Presence Chat Room Subscription
  const { messages: chatMessages, clearMessages: clearChatMessages } = useNotifications<{
    message: string
    timestamp: string
  }>({
    channel: 'presence-chat-room',
  })

  const [toast, setToast] = useState<{ show: boolean; title: string }>({ show: false, title: '' })
  const prevLengthRef = useRef(postMessages.length)

  const [userCount, setUserCount] = useState<number>(0)
  const [activeChannels, setActiveChannels] = useState<Record<string, any>>({})

  const [alertMessage, setAlertMessage] = useState<string>('')
  const [isSendingAlert, setIsSendingAlert] = useState<boolean>(false)
  const [alertStatus, setAlertStatus] = useState<{
    type: 'success' | 'error' | null
    message: string
  }>({ type: null, message: '' })

  // 1. Fetch active listeners and active channels lobby
  useEffect(() => {
    const fetchStats = () => {
      // Fetch user count for 'posts'
      fetch('/api/ws/connections')
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('No live connections'))))
        .then((data) => setUserCount(data.count ?? 0))
        .catch((err) => console.log(err))

      // Fetch all active channels
      fetch('/api/ws/channels')
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('No live connections'))))
        .then((data) => setActiveChannels(data.channels ?? {}))
        .catch((err) => console.log(err))
    }

    if (status === 'connected') {
      // Small delay to ensure the current tab's channel subscription registers on the WebSocket server
      const delayTimeout = setTimeout(fetchStats, 500)
      const interval = setInterval(fetchStats, 5000)

      return () => {
        clearTimeout(delayTimeout)
        clearInterval(interval)
      }
    } else {
      setUserCount(0)
    }
  }, [status])

  // 2. Broadcast message to Admin & Chat Room
  const sendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!alertMessage.trim()) return

    setIsSendingAlert(true)
    setAlertStatus({ type: null, message: '' })
    try {
      const res = await fetch('/api/admin-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Target the presence channel!
        body: JSON.stringify({ message: alertMessage, collection: 'presence-chat-room' }),
      })

      if (res.ok) {
        setAlertMessage('')
        setAlertStatus({ type: 'success', message: 'Broadcast sent to Admin & Chat Room!' })
      } else {
        setAlertStatus({ type: 'error', message: 'Failed to send broadcast.' })
      }
    } catch {
      setAlertStatus({ type: 'error', message: 'Network error sending broadcast.' })
    } finally {
      setIsSendingAlert(false)
      setTimeout(() => setAlertStatus({ type: null, message: '' }), 4000)
    }
  }

  // Handle post notifications audio/toast
  useEffect(() => {
    if (postMessages.length > prevLengthRef.current) {
      const latestMsg = postMessages[postMessages.length - 1]
      if (latestMsg?.data?.title) {
        const audio = new Audio('/sounds/ringtone.mp3')
        audio.play().catch(() => {})
        setToast({ show: true, title: latestMsg.data.title })
      }
    }
    prevLengthRef.current = postMessages.length
  }, [postMessages])

  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => setToast({ show: false, title: '' }), 4000)
      return () => clearTimeout(timer)
    }
  }, [toast.show])

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <header
        style={{ borderBottom: '1px solid #eaeaea', paddingBottom: '1rem', marginBottom: '2rem' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0 }}>Real-Time Features Demo</h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <LiveIndicator label={`Status: ${status.toUpperCase()}`} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>Global Listeners:</span>
              <span
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '999px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  backgroundColor: '#dbeafe',
                  color: '#1e40af',
                }}
              >
                {userCount}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '2rem',
          marginBottom: '2rem',
        }}
      >
        {/* ── Active Channels Lobby ── */}
        <div
          style={{
            padding: '1.5rem',
            backgroundColor: '#f9fafb',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.125rem' }}>
            {' '}
            <span role="img" aria-label="Active Channels Directory">
              📡
            </span>{' '}
            Active Channels Directory
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#4b5563', marginBottom: '1rem' }}>
            Powered by <code>/api/ws/channels</code>
          </p>

          {Object.keys(activeChannels).length === 0 ? (
            <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>No active channels found.</div>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {Object.keys(activeChannels).map((ch) => (
                <li
                  key={ch}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.5rem',
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.25rem',
                  }}
                >
                  <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{ch}</span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      backgroundColor: '#e5e7eb',
                      padding: '0.1rem 0.5rem',
                      borderRadius: '999px',
                    }}
                  >
                    Active
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3 style={{ marginTop: '2rem', marginBottom: '1rem', fontSize: '1.125rem' }}>
            <span role="img" aria-label="Who's Online">
              👥
            </span>{' '}
            Who's Online ({presenceCount})
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#4b5563', marginBottom: '1rem' }}>
            Powered by <code>usePresence</code>
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Object.entries(members).map(([userId, userInfo]) => (
              <li key={userId} style={{ fontSize: '0.875rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                <span style={{ fontWeight: userId === myId ? 600 : 400 }}>
                  {userInfo?.email || userId} {userId === myId && '(You)'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Broadcast Message ── */}
        <div
          style={{
            padding: '1.5rem',
            backgroundColor: '#f3f4f6',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.125rem' }}>
            <span role="img" aria-label="Broadcast & Alert">
              💬
            </span>
            Broadcast & Alert
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#4b5563', marginTop: 0, marginBottom: '1rem' }}>
            Sends to Admin Apprise AND the <code>presence-chat-room</code> channel.
          </p>
          <form onSubmit={sendBroadcast} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder={`Type message here as ${localUser}...`}
              value={alertMessage}
              onChange={(e) => {
                setAlertMessage(e.target.value)
                triggerTyping()
              }}
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
              }}
              required
            />
            <button
              type="submit"
              disabled={isSendingAlert}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.875rem',
                opacity: isSendingAlert ? 0.7 : 1,
              }}
            >
              {isSendingAlert ? 'Sending...' : 'Send'}
            </button>
          </form>

          {isTyping && (
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem', fontStyle: 'italic' }}>
              {Object.keys(typingUsers).join(', ')} {Object.keys(typingUsers).length === 1 ? 'is' : 'are'} typing...
            </div>
          )}

          {alertStatus.type && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                backgroundColor: alertStatus.type === 'success' ? '#dcfce7' : '#fee2e2',
                color: alertStatus.type === 'success' ? '#166534' : '#991b1b',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>{alertStatus.type === 'success' ? '✅' : '❌'}</span>
              {alertStatus.message}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* ── Presence Chat Room Feed ── */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h2>Live Chat Feed</h2>
            {chatMessages.length > 0 && (
              <button
                onClick={clearChatMessages}
                style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer' }}
                type="button"
              >
                Clear
              </button>
            )}
          </div>
          {chatMessages.length === 0 ? (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                backgroundColor: '#f9fafb',
                borderRadius: '0.5rem',
                color: '#6b7280',
                fontSize: '0.875rem',
              }}
            >
              Waiting for chat messages...
            </div>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {chatMessages.map((msg, idx) => (
                <li
                  key={idx}
                  style={{
                    padding: '1rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    backgroundColor: '#eff6ff',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    {new Date(msg.data.timestamp).toLocaleTimeString()}
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 500 }}>{msg.data.message}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── CMS Posts Feed ── */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h2>CMS Posts Feed</h2>
            {postMessages.length > 0 && (
              <button
                onClick={clearPostMessages}
                style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer' }}
                type="button"
              >
                Clear
              </button>
            )}
          </div>
          {postMessages.length === 0 ? (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                backgroundColor: '#f9fafb',
                borderRadius: '0.5rem',
                color: '#6b7280',
                fontSize: '0.875rem',
              }}
            >
              Waiting for new posts from Admin...
            </div>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {postMessages.map((msg, idx) => (
                <li
                  key={idx}
                  style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
                >
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    {new Date(msg.data.timestamp).toLocaleTimeString()}
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 500 }}>{msg.data.title}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {toast.show && (
        <div
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            backgroundColor: '#1f2937',
            color: '#ffffff',
            padding: '1rem 1.5rem',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            zIndex: 9999,
            borderLeft: '4px solid #10b981',
            maxWidth: '350px',
          }}
        >
          <span style={{ fontSize: '1.5rem' }} role="img" aria-label="New Post Published!">
            🔔
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>New Post Published!</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>{toast.title}</div>
          </div>
        </div>
      )}
    </div>
  )
}
