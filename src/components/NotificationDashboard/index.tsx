'use client'

import React, { useCallback, useEffect, useState } from 'react'

import type { NotificationSettingsData } from '../../types.js'
import { ConnectedView } from './ConnectedView.js'
import { DisconnectedView } from './DisconnectedView.js'
import styles from './NotificationDashboard.module.css'
import { useHandshake } from './useHandshake.js'

/**
 * The main orchestrator component for the Notification Settings dashboard.
 * Replaces the default Payload Global edit view for `notification-settings`.
 *
 * Responsibilities:
 * 1. Fetch the current settings from the Payload REST API
 * 2. Run the OAuth handshake hook (detect & save callback params)
 * 3. Render either `DisconnectedView` or `ConnectedView` based on state
 */
export function NotificationDashboard() {
  const [settings, setSettings] = useState<NotificationSettingsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // ── Fetch settings from the Payload REST API ─────────────
  const fetchSettings = useCallback(() => {
    setIsLoading(true)

    fetch('/api/globals/notification-settings', {
      credentials: 'include',
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Settings fetch failed: ${res.status}`)
        return res.json() as Promise<NotificationSettingsData>
      })
      .then((data) => {
        setSettings(data)
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error(
          '[notifications] could not load settings:',
          err instanceof Error ? err.message : err,
        )
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // ── Handle OAuth handshake callback ──────────────────────
  const handleKeysReceived = useCallback(
    (_apiKey: string, _tenantId: string) => {
      // Re-fetch settings to get the freshly-saved state.
      fetchSettings()
    },
    [fetchSettings],
  )

  const { isProcessing: isHandshaking, error: handshakeError } = useHandshake({
    onKeysReceived: handleKeysReceived,
  })

  // ── Disconnect handler ────────────────────────────────────
  const handleDisconnect = useCallback(() => {
    fetchSettings()
  }, [fetchSettings])

  // ── Render ────────────────────────────────────────────────
  const isConnected = Boolean(settings?.saasApiKey)

  return (
    <div className={styles.dashboard}>
      {/* ── Loading State ───────────────────────────────── */}
      {isLoading && (
        <div className={styles.loadingContainer}>
          <p>Loading notification settings…</p>
        </div>
      )}

      {/* ── Handshake in-progress banner ────────────────── */}
      {isHandshaking && (
        <div className={styles.handshakeBanner}>
          Connecting your account…
        </div>
      )}

      {/* ── Handshake error banner ──────────────────────── */}
      {handshakeError && (
        <div className={styles.errorBanner}>
          <p>Connection failed: {handshakeError}</p>
        </div>
      )}

      {/* ── Main Content ────────────────────────────────── */}
      {!isLoading && !isHandshaking && (
        <>
          {isConnected && settings?.saasApiKey && settings?.tenantId ? (
            <ConnectedView
              apiKey={settings.saasApiKey}
              tenantId={settings.tenantId}
              onDisconnect={handleDisconnect}
            />
          ) : (
            <DisconnectedView />
          )}
        </>
      )}
    </div>
  )
}
