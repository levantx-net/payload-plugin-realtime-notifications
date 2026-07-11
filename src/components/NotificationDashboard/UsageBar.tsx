'use client'

import React from 'react'

import styles from './NotificationDashboard.module.css'

interface UsageBarProps {
  /** Label displayed above the bar, e.g. "WebSocket Events". */
  label: string
  /** Current usage count. */
  current: number
  /** Maximum allowed by the plan. */
  limit: number
}

/**
 * A labeled progress bar with color-coded thresholds:
 * - Green  (< 75% usage)
 * - Amber  (75–89% usage)
 * - Red    (≥ 90% usage)
 */
export function UsageBar({ label, current, limit }: UsageBarProps) {
  const percentage = limit > 0 ? Math.min((current / limit) * 100, 100) : 0
  const formattedCurrent = current.toLocaleString()
  const formattedLimit = limit.toLocaleString()

  let severity: 'green' | 'amber' | 'red' = 'green'
  if (percentage >= 90) {
    severity = 'red'
  } else if (percentage >= 75) {
    severity = 'amber'
  }

  return (
    <div className={styles.usageBarContainer}>
      <div className={styles.usageBarHeader}>
        <span className={styles.usageBarLabel}>{label}</span>
        <span className={styles.usageBarCount}>
          {formattedCurrent} / {formattedLimit}
        </span>
      </div>
      <div className={styles.usageBarTrack}>
        <div
          className={`${styles.usageBarFill} ${styles[`usageBarFill--${severity}`]}`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-label={`${label}: ${formattedCurrent} of ${formattedLimit} used`}
        />
      </div>
      <span className={styles.usageBarPercentage}>{percentage.toFixed(1)}%</span>
    </div>
  )
}
