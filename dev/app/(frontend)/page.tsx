'use client'

import { useEffect, useRef, useState } from 'react'

import { useConnectionStatus, useNotifications } from 'payload-plugin-realtime-notifications/react'

export default function LiveFeedPage() {
  const status = useConnectionStatus()
  const { messages, clearMessages } = useNotifications<{
    id: string | number
    title: string
    timestamp: string
  }>({
    channel: 'posts',
    events: ['feed.post.published'],
  })

  const [toast, setToast] = useState<{ show: boolean; title: string }>({ show: false, title: '' })
  const prevLengthRef = useRef(messages.length)

  // New features state
  const [userCount, setUserCount] = useState<number>(0)
  const [alertMessage, setAlertMessage] = useState<string>('')
  const [isSendingAlert, setIsSendingAlert] = useState<boolean>(false)
  const [alertStatus, setAlertStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' })
  // 1. Fetch active users on mount and poll every 5s
  useEffect(() => {
    const fetchConnections = () => {
      fetch('/api/soketi/connections')
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data: { count?: number }) => {
          setUserCount(data.count ?? 0)
        })
        .catch(() => {
          // Silent fallback
        })
    }

    fetchConnections()
    const interval = setInterval(fetchConnections, 5000)
    return () => clearInterval(interval)
  }, [])

  // 2. Send custom alert message to admin endpoint
  const sendAdminAlert = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!alertMessage.trim()) return

    setIsSendingAlert(true)
    setAlertStatus({ type: null, message: '' })
    try {
      const res = await fetch('/api/admin-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: alertMessage }),
      })

      if (res.ok) {
        setAlertMessage('')
        setAlertStatus({ type: 'success', message: 'Alert successfully sent to Admin!' })
      } else {
        setAlertStatus({ type: 'error', message: 'Failed to send alert.' })
      }
    } catch {
      setAlertStatus({ type: 'error', message: 'Network error sending alert.' })
    } finally {
      setIsSendingAlert(false)
      // Auto hide status after 4 seconds
      setTimeout(() => setAlertStatus({ type: null, message: '' }), 4000)
    }
  }

  useEffect(() => {
    // Check if a new message has arrived
    if (messages.length > prevLengthRef.current) {
      const latestMsg = messages[messages.length - 1]
      if (latestMsg?.data?.title) {
        // Play the ringtone audio
        const audio = new Audio('/sounds/ringtone.mp3')
        audio.play().catch(() => {
          // Browsers block autoplay/audio until the user interacts with the page
          // eslint-disable-next-line no-console
          console.warn(
            '[notifications] Ringtone blocked. Click anywhere on the page first to allow audio.',
          )
        })

        // Show the toast notification
        setToast({ show: true, title: latestMsg.data.title })
      }
    }
    prevLengthRef.current = messages.length
  }, [messages])

  // Auto-hide toast after 4 seconds
  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => {
        setToast({ show: false, title: '' })
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [toast.show])

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <header
        style={{ borderBottom: '1px solid #eaeaea', paddingBottom: '1rem', marginBottom: '2rem' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0 }}>Live Post Feed</h1>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            {/* Connection Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>Status:</span>
              <span
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '999px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  backgroundColor:
                    status === 'connected'
                      ? '#dcfce7'
                      : status === 'connecting'
                        ? '#fef08a'
                        : '#fee2e2',
                  color:
                    status === 'connected'
                      ? '#166534'
                      : status === 'connecting'
                        ? '#854d0e'
                        : '#991b1b',
                }}
              >
                {status.toUpperCase()}
              </span>
            </div>

            {/* Active Connection Count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>Active Listeners:</span>
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

      <main>
        {/* Send Alert to Admin Box */}
        <div
          style={{
            padding: '1.5rem',
            backgroundColor: '#f3f4f6',
            borderRadius: '0.5rem',
            marginBottom: '2rem',
            border: '1px solid #e5e7eb',
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.125rem' }}>
            Send Alert to Admin
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#4b5563', marginTop: 0, marginBottom: '1rem' }}>
            Type a message below to broadcast a real-time event directly to the Admin's Apprise / Soketi dispatch systems.
          </p>
          <form onSubmit={sendAdminAlert} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="e.g. Critical: Database query latency is high!"
              value={alertMessage}
              onChange={(e) => setAlertMessage(e.target.value)}
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
              {isSendingAlert ? 'Sending...' : 'Send Alert'}
            </button>
          </form>

          {/* Inline Status Message */}
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
                animation: 'slideIn 0.3s ease-out',
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>
                {alertStatus.type === 'success' ? '✅' : '❌'}
              </span>
              {alertStatus.message}
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h2>Recent Activity ({messages.length})</h2>
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#f3f4f6',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
              }}
              type="button"
            >
              Clear Feed
            </button>
          )}
        </div>

        {messages.length === 0 ? (
          <div
            style={{
              padding: '3rem',
              textAlign: 'center',
              backgroundColor: '#f9fafb',
              borderRadius: '0.5rem',
            }}
          >
            <p style={{ color: '#6b7280' }}>Waiting for new posts...</p>
            <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
              (Try creating a post and setting its status to "Published" in the admin panel)
            </p>
          </div>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            {messages.map((msg, idx) => (
              <li
                key={idx}
                style={{
                  padding: '1.5rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                  animation: 'slideIn 0.3s ease-out forwards',
                }}
              >
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  {new Date(msg.data.timestamp).toLocaleTimeString()}
                </div>
                <div style={{ fontSize: '1.125rem', fontWeight: 500 }}>{msg.data.title}</div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* ── Floating Toast Notification ── */}
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
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            zIndex: 9999,
            borderLeft: '4px solid #10b981',
            animation: 'slideIn 0.3s ease-out',
            maxWidth: '350px',
          }}
        >
          <span style={{ fontSize: '1.5rem' }} role="img" aria-label="notification bell">
            🔔
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>New Post Published!</div>
            <div
              style={{
                fontSize: '0.75rem',
                opacity: 0.9,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {toast.title}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
