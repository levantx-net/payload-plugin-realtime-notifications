'use client'

import React, { useEffect, useState } from 'react'
import { NotificationProvider, useNotifications } from '../exports/react.js'

/**
 * An internal component that actually listens to the channel 
 * (requires the NotificationProvider to wrap it).
 */
function ToastListener() {
  const { messages } = useNotifications<{ message?: string; title?: string }>({
    // Listen to the global admin-alert endpoint broadcasts, or generic 'posts'
    channel: 'posts', 
  })

  const [toast, setToast] = useState<{ show: boolean; title: string }>({ show: false, title: '' })

  useEffect(() => {
    if (messages.length > 0) {
      const latestMsg = messages[messages.length - 1]
      if (latestMsg?.data) {
        setToast({ show: true, title: latestMsg.data.title || latestMsg.data.message || 'New Alert Received' })
      }
    }
  }, [messages])

  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => setToast({ show: false, title: '' }), 4000)
      return () => clearTimeout(timer)
    }
  }, [toast.show])

  if (!toast.show) return null

  return (
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
        zIndex: 99999, // Ensure it's above Payload's native UI
        borderLeft: '4px solid #10b981',
      }}
    >
      <span style={{ fontSize: '1.5rem' }}>🔔</span>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Real-Time Alert</div>
        <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>{toast.title}</div>
      </div>
    </div>
  )
}

/**
 * Drop-in component for Payload's `admin.components.afterNav`.
 * 
 * Note: In a production environment, you should dynamically pass the `NotificationClientConfig`
 * here instead of hardcoding it, or wrap your entire Payload `RootLayout` in the provider.
 * For this drop-in, it assumes a local or standard Sockudo instance.
 */
export function AdminLiveToast(): React.ReactNode {
  return (
    <NotificationProvider
      config={{
        appKey: 'app-key', // Adjust as needed
        wsHost: 'localhost',
        wsPort: 6001,
        forceTLS: false,
        disableStats: true,
        enabledTransports: ['ws', 'wss'],
      }}
    >
      <ToastListener />
    </NotificationProvider>
  )
}
