'use client'

import React from 'react'
import { useConnectionStatus } from './useConnectionStatus.js'

export interface LiveIndicatorProps {
  /** Optional custom text to show alongside the dot. */
  label?: string
  /** Whether to show the text label. Defaults to true. */
  showLabel?: boolean
}

/**
 * A tiny glowing green/yellow/red dot that developers can drop into 
 * their Navbars to show WebSocket health to their users.
 */
export function LiveIndicator({ label, showLabel = true }: LiveIndicatorProps) {
  const status = useConnectionStatus()

  const getColor = () => {
    switch (status) {
      case 'connected': return '#10b981' // Green
      case 'connecting': return '#f59e0b' // Yellow
      case 'error': return '#ef4444' // Red
      case 'disconnected':
      default: return '#6b7280' // Gray
    }
  }

  const defaultLabel = status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'sans-serif' }}>
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: getColor(),
          boxShadow: status === 'connected' ? `0 0 8px ${getColor()}` : 'none',
          transition: 'all 0.3s ease',
        }}
      />
      {showLabel && (
        <span style={{ fontSize: '0.875rem', color: '#4b5563', fontWeight: 500 }}>
          {label ?? defaultLabel}
        </span>
      )}
    </div>
  )
}
