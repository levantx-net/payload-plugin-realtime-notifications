'use client'

import React from 'react'

import type { PricingTier } from '../../types.js'
import styles from './NotificationDashboard.module.css'

/**
 * Default SaaS connection URL. The `callback_url` param tells the
 * SaaS gateway where to redirect after a successful subscription.
 */
const DEFAULT_SAAS_CONNECT_URL = 'https://app.yoursaas.com/connect'

/**
 * Pricing tiers displayed when the user has not yet connected.
 * These are static for now — Phase 3's SaaS gateway could serve
 * them dynamically in the future.
 */
const PRICING_TIERS: PricingTier[] = [
  {
    name: 'Free',
    price: '$0/mo',
    features: [
      '100 WebSocket events/mo',
      '10 push notifications/mo',
      'Community support',
      '1 project',
    ],
  },
  {
    name: 'Starter',
    price: '$9/mo',
    features: [
      '10,000 WebSocket events/mo',
      '1,000 push notifications/mo',
      'Email support',
      '1 project',
    ],
  },
  {
    name: 'Growth',
    price: '$29/mo',
    features: [
      '100,000 WebSocket events/mo',
      '10,000 push notifications/mo',
      'Priority support',
      'Unlimited projects',
      'Custom event channels',
    ],
    recommended: true,
  },
]

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
  const handleConnect = () => {
    const connectBase = saasConnectUrl ?? DEFAULT_SAAS_CONNECT_URL
    const callbackUrl = window.location.href.split('?')[0] // Strip any existing query params
    const connectUrl = `${connectBase}?callback_url=${encodeURIComponent(callbackUrl)}`

    window.location.href = connectUrl
  }

  return (
    <div className={styles.disconnected}>
      <div className={styles.disconnectedHeader}>
        <h2 className={styles.disconnectedTitle}>Real-Time Notifications</h2>
        <p className={styles.disconnectedDescription}>
          Add real-time WebSocket events and push notifications to your CMS.
          Connect to our managed service to get started in minutes.
        </p>
      </div>

      <div className={styles.pricingGrid}>
        {PRICING_TIERS.map((tier) => (
          <div
            key={tier.name}
            className={`${styles.pricingCard} ${tier.recommended ? styles['pricingCard--recommended'] : ''}`}
          >
            {tier.recommended && (
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
        ))}
      </div>

      <button
        type="button"
        className={styles.connectButton}
        onClick={handleConnect}
      >
        Connect &amp; Start for Free
      </button>

      <p className={styles.disconnectedFooter}>
        Already self-hosting? Change the <strong>Delivery Mode</strong> to Self-Hosted
        to configure your own Sockudo or Apprise instance.
      </p>
    </div>
  )
}
