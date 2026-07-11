'use client'

import React, { useCallback, useEffect, useState } from 'react'

import type { UsageData } from '../../types.js'
import styles from './NotificationDashboard.module.css'
import { UsageBar } from './UsageBar.js'

const DEFAULT_SAAS_GATEWAY_URL = 'https://api.yoursaas.com/v1'

interface ConnectedViewProps {
  /** The stored SaaS API key. */
  apiKey: string
  /** The stored tenant ID. */
  tenantId: string
  /** Override for the SaaS gateway URL. */
  saasGatewayUrl?: string
  /** Called when the user disconnects (clears saved keys). */
  onDisconnect: () => void
}

/**
 * Dashboard view shown when the user has a valid `saasApiKey`.
 * Fetches live usage metrics from the SaaS gateway and provides
 * a billing portal shortcut.
 */
export function ConnectedView({
  apiKey,
  tenantId,
  saasGatewayUrl,
  onDisconnect,
}: ConnectedViewProps) {
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [isLoadingUsage, setIsLoadingUsage] = useState(true)
  const [usageError, setUsageError] = useState<string | null>(null)
  const [isBillingLoading, setIsBillingLoading] = useState(false)

  const gatewayBase = (saasGatewayUrl ?? DEFAULT_SAAS_GATEWAY_URL).replace(/\/+$/, '')

  // ── Fetch usage data on mount ──────────────────────────────
  const fetchUsage = useCallback(() => {
    setIsLoadingUsage(true)
    setUsageError(null)

    fetch(`${gatewayBase}/tenant/usage`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Usage fetch failed: ${res.status}`)
        return res.json() as Promise<UsageData>
      })
      .then((data) => {
        setUsage(data)
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to fetch usage data'
        setUsageError(message)
      })
      .finally(() => {
        setIsLoadingUsage(false)
      })
  }, [gatewayBase, apiKey])

  useEffect(() => {
    fetchUsage()
  }, [fetchUsage])

  // ── Manage Billing → Stripe Portal Session ─────────────────
  const handleManageBilling = () => {
    setIsBillingLoading(true)

    fetch(`${gatewayBase}/tenant/portal-session`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Portal session failed: ${res.status}`)
        return res.json() as Promise<{ url: string }>
      })
      .then((data) => {
        window.location.href = data.url
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to open billing portal'
        // eslint-disable-next-line no-console
        console.error('[notifications] billing portal error:', message)
        alert(`Could not open billing portal: ${message}`)
      })
      .finally(() => {
        setIsBillingLoading(false)
      })
  }

  // ── Disconnect ─────────────────────────────────────────────
  const handleDisconnect = () => {
    if (!window.confirm('Are you sure you want to disconnect from the managed service? Your API key will be removed.')) {
      return
    }

    fetch('/api/globals/notification-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        saasApiKey: '',
        tenantId: '',
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Disconnect failed: ${res.status}`)
        onDisconnect()
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to disconnect'
        // eslint-disable-next-line no-console
        console.error('[notifications] disconnect error:', message)
      })
  }

  return (
    <div className={styles.connected}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div className={styles.connectedHeader}>
        <div>
          <h2 className={styles.connectedTitle}>Notifications Connected</h2>
          <p className={styles.connectedMeta}>
            Tenant: <code>{tenantId}</code>
          </p>
        </div>
        <span className={styles.statusBadge}>● Connected</span>
      </div>

      {/* ── Usage Metrics ──────────────────────────────────── */}
      <div className={styles.usageSection}>
        <h3 className={styles.usageSectionTitle}>
          Active Service: {usage?.plan ? `${usage.plan} Tier` : 'Loading...'}
        </h3>
        
        <p style={{ margin: '0.5rem 0 1rem', fontSize: '0.875rem', color: '#6b7280' }}>
          Usage so far this period:
        </p>

        {isLoadingUsage && (
          <p className={styles.loadingText}>Loading usage data…</p>
        )}

        {usageError && (
          <div className={styles.errorBanner}>
            <p>{usageError}</p>
            <button type="button" onClick={fetchUsage} className={styles.retryButton}>
              Retry
            </button>
          </div>
        )}

        {usage && !isLoadingUsage && (
          <div className={styles.usageBars}>
            <UsageBar
              label="WebSocket Events"
              current={usage.websocketCount}
              limit={usage.websocketLimit}
            />
            <UsageBar
              label="Push Notifications"
              current={usage.pushCount}
              limit={usage.pushLimit}
            />
          </div>
        )}
      </div>

      {/* ── Actions ────────────────────────────────────────── */}
      <div className={styles.connectedActions}>
        <button
          type="button"
          className={styles.billingButton}
          onClick={handleManageBilling}
          disabled={isBillingLoading}
        >
          {isBillingLoading ? 'Opening…' : 'Manage Billing'}
        </button>
        <button
          type="button"
          className={styles.disconnectButton}
          onClick={handleDisconnect}
        >
          Disconnect
        </button>
      </div>
    </div>
  )
}
