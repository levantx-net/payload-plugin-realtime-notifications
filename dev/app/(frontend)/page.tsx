'use client'

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
    </div>
  )
}
