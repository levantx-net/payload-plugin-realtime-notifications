'use client'

import React from 'react'

import type { PricingTier } from '../../types.js'
import styles from './NotificationDashboard.module.css'

/**
 * Default SaaS connection URL. The `callback_url` param tells the
 * SaaS gateway where to redirect after a successful subscription.
 */
const DEFAULT_SAAS_CONNECT_URL = 'https://app.yoursaas.com/connect'


interface DisconnectedViewProps {
  /** Override for the SaaS connection URL (from plugin options). */
  saasConnectUrl?: string
}

/**
 * Marketing view shown when no `saasApiKey` exists in the settings.
 * Displays pricing tiers and a "Connect & Subscribe" button that
 * redirects to the SaaS OAuth flow.
 */
export function DisconnectedView({ saasConnectUrl }: DisconnectedViewProps) {
  const [selectedTier, setSelectedTier] = React.useState<string>('Free')
  const [pricingTiers, setPricingTiers] = React.useState<PricingTier[]>([])
  const [isLoadingTiers, setIsLoadingTiers] = React.useState(true)

  React.useEffect(() => {
    // TODO: Replace this with a real API fetch to the SaaS portal once it's deployed.
    // e.g., fetch('https://api.yoursaas.com/v1/pricing').then(res => res.json())
    import('./pricing.json')
      .then((mod) => {
        setPricingTiers(mod.default as PricingTier[])
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[notifications] Failed to load pricing tiers:', err)
      })
      .finally(() => {
        setIsLoadingTiers(false)
      })
  }, [])

  const handleConnect = () => {
    const connectBase = saasConnectUrl ?? DEFAULT_SAAS_CONNECT_URL
    const callbackUrl = window.location.href.split('?')[0] // Strip any existing query params
    const connectUrl = `${connectBase}?callback_url=${encodeURIComponent(callbackUrl)}&plan=${selectedTier.toLowerCase()}`

    window.location.href = connectUrl
  }

  return (
    <div className={styles.disconnected}>
      <div className={styles.disconnectedHeader}>
        <h2 className={styles.disconnectedTitle}>Real-Time Notifications</h2>
        <p className={styles.disconnectedDescription}>
          Add real-time WebSocket events and push notifications to your CMS. Connect to our managed
          service to get started in minutes.
        </p>
      </div>

      <div className={styles.pricingGrid}>
        {isLoadingTiers ? (
          <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
            Loading subscription tiers...
          </p>
        ) : (
          pricingTiers.map((tier) => {
            const isSelected = selectedTier === tier.name

          return (
            <div
              key={tier.name}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedTier(tier.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelectedTier(tier.name)
                }
              }}
              style={{
                cursor: 'pointer',
                outline: isSelected ? '2px solid #2563eb' : 'none',
                position: 'relative',
              }}
              className={`${styles.pricingCard} ${tier.recommended ? styles['pricingCard--recommended'] : ''}`}
            >
              {isSelected && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-10px',
                    right: '-10px',
                    background: '#2563eb',
                    color: 'white',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                  }}
                >
                  Selected
                </span>
              )}
              {tier.recommended && !isSelected && (
                <span className={styles.pricingBadge}>Recommended</span>
              )}
              <h3 className={styles.pricingName}>{tier.name}</h3>
              <p className={styles.pricingPrice}>{tier.price}</p>
              <ul className={styles.pricingFeatures}>
                {tier.features.map((feature) => (
                  <li key={feature} className={styles.pricingFeature}>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )
        })
      )}
      </div>

      <button
        type="button"
        className={styles.connectButton}
        onClick={handleConnect}
        style={{ marginTop: '1rem', background: selectedTier === 'Free' ? '#10b981' : '#2563eb' }}
      >
        {selectedTier === 'Free'
          ? 'Connect & Start for Free'
          : `Connect & Subscribe to ${selectedTier}`}
      </button>

      <p className={styles.disconnectedFooter}>
        Already self-hosting? Change the <strong>Delivery Mode</strong> to Self-Hosted to configure
        your own Sockudo or Apprise instance.
      </p>
    </div>
  )
}
