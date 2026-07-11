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
        <h1>Live Post Feed</h1>
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
      </header>

      <main>
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
