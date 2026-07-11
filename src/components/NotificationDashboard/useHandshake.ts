'use client'

import { useSearchParams } from 'next/navigation.js'
import { useCallback, useEffect, useRef, useState } from 'react'

const HANDSHAKE_KEY_PARAM = 'saas_api_key'
const HANDSHAKE_TENANT_PARAM = 'tenant_id'

interface UseHandshakeOptions {
  /**
   * Called after the handshake keys have been successfully saved
   * to the database. Use this to refresh the settings state.
   */
  onKeysReceived: (apiKey: string, tenantId: string) => void
}

interface UseHandshakeReturn {
  /** `true` while the handshake save is in-flight. */
  isProcessing: boolean
  /** Error message if the handshake save failed. */
  error: string | null
}

/**
 * Custom hook that handles the OAuth callback handshake.
 *
 * When the SaaS gateway redirects back to the CMS with
 * `?saas_api_key=...&tenant_id=...` in the URL, this hook:
 *
 * 1. **Immediately** strips the keys from the URL via `replaceState`
 * 2. Saves the keys to the `notification-settings` Global
 * 3. Calls `onKeysReceived` so the parent can refresh its state
 *
 * The hook is idempotent — it only runs once per mount, and uses
 * a ref guard to prevent double-execution in React Strict Mode.
 */
export function useHandshake({ onKeysReceived }: UseHandshakeOptions): UseHandshakeReturn {
  const searchParams = useSearchParams()
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasRun = useRef(false)

  const stableOnKeysReceived = useCallback(onKeysReceived, [onKeysReceived])

  useEffect(() => {
    // Guard: only run once, even in React Strict Mode.
    if (hasRun.current) return

    const apiKey = searchParams.get(HANDSHAKE_KEY_PARAM)
    const tenantId = searchParams.get(HANDSHAKE_TENANT_PARAM)

    // No handshake params in URL — nothing to do.
    if (!apiKey || !tenantId) return

    // Mark as run immediately to prevent double-execution.
    hasRun.current = true

    // ── SECURITY: Strip keys from the URL bar IMMEDIATELY ──────
    // This runs synchronously before any async work. Even if the
    // save fails, the keys will no longer be visible in the URL.
    const cleanUrl = new URL(window.location.href)
    cleanUrl.searchParams.delete(HANDSHAKE_KEY_PARAM)
    cleanUrl.searchParams.delete(HANDSHAKE_TENANT_PARAM)
    window.history.replaceState({}, '', cleanUrl.toString())

    // ── Save keys to the database ──────────────────────────────
    setIsProcessing(true)
    setError(null)

    fetch('/api/globals/notification-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        mode: 'saas',
        saasApiKey: apiKey,
        tenantId: tenantId,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to save settings: ${response.status}`)
        }
        stableOnKeysReceived(apiKey, tenantId)
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Unknown error saving handshake keys'
        setError(message)
        // eslint-disable-next-line no-console
        console.error('[notifications] handshake save failed:', message)
      })
      .finally(() => {
        setIsProcessing(false)
      })
  }, [searchParams, stableOnKeysReceived])

  return { isProcessing, error }
}
