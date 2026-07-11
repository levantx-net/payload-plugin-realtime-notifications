import type { Config } from 'payload'

import { NotificationSettings } from './globals/NotificationSettings.js'
import { createAfterChangeHook } from './hooks/createAfterChangeHook.js'
import { createAfterDeleteHook } from './hooks/createAfterDeleteHook.js'
import type { CollectionHookConfig, PluginOptions } from './types.js'

// ---------------------------------------------------------------------------
// Re-exports — public API surface
// ---------------------------------------------------------------------------

export { dispatchEvent } from './dispatcher/dispatchEvent.js'
export { resolveTargets } from './dispatcher/dispatchEvent.js'
export { createAfterChangeHook } from './hooks/createAfterChangeHook.js'
export { createAfterDeleteHook } from './hooks/createAfterDeleteHook.js'
export type {
  CollectionHookConfig,
  CollectionHookEntry,
  DataTransformArgs,
  DispatchTarget,
  EventNameArgs,
  HookConditionArgs,
  HookFactoryOptions,
  NotificationEvent,
  NotificationMode,
  NotificationSettingsData,
  PluginOptions,
} from './types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes a collection hook entry into a `CollectionHookConfig`.
 * - `true` becomes `{}` (all defaults).
 * - An object is passed through as-is.
 */
function normalizeHookEntry(entry: true | CollectionHookConfig): CollectionHookConfig {
  return entry === true ? {} : entry
}

// ---------------------------------------------------------------------------
// Plugin Factory
// ---------------------------------------------------------------------------

/**
 * Payload CMS plugin that adds real-time notification dispatching.
 *
 * The plugin is **stateless** — it is an event publisher, not a
 * connection manager. All dispatch calls are fire-and-forget and
 * wrapped in `try/catch` to guarantee zero-blocking behaviour.
 *
 * @example
 * ```ts
 * // payload.config.ts
 * import { notificationsPlugin } from 'payload-plugin-realtime-notifications'
 *
 * export default buildConfig({
 *   plugins: [
 *     notificationsPlugin({
 *       collections: {
 *         posts: true,
 *         orders: {
 *           events: ['create', 'update'],
 *           condition: ({ doc }) => doc.status === 'paid',
 *         },
 *       },
 *     }),
 *   ],
 * })
 * ```
 */
export const notificationsPlugin =
  (pluginOptions: PluginOptions) =>
  (config: Config): Config => {
    // ── Ensure arrays exist ───────────────────────────────────
    if (!config.globals) {
      config.globals = []
    }

    // ── Inject the NotificationSettings Global ────────────────
    // Always inject — even when disabled — so the DB schema stays
    // consistent for migrations.
    config.globals.push(NotificationSettings)

    // ── Early exit if disabled ────────────────────────────────
    // Schema is already injected above, so the database remains
    // consistent. We just skip all runtime behaviour.
    if (pluginOptions.disabled) {
      return config
    }

    // ── Admin UI setup ────────────────────────────────────────
    if (!config.admin) {
      config.admin = {}
    }

    // Store the gateway URL override (if any) on the config so
    // hooks can access it at runtime without re-reading plugin options.
    // We use Payload's `custom` bag for this.
    if (!config.custom) {
      config.custom = {}
    }
    config.custom.notificationsPluginOptions = {
      saasGatewayUrl: pluginOptions.saasGatewayUrl,
    }

    // ── Endpoints ─────────────────────────────────────────────
    if (!config.endpoints) {
      config.endpoints = []
    }

    config.endpoints.push(
      {
        path: '/admin-alert',
        method: 'post',
        handler: async (req) => {
          try {
            const json = (await req.json()) as { message?: string; collection?: string }
            const message = json.message || 'Alert from client'
            const collection = json.collection || 'posts'

            const { dispatchEvent } = await import('./dispatcher/dispatchEvent.js')

            dispatchEvent(req.payload, {
              event: 'admin.alert',
              collection,
              operation: 'update',
              data: {
                message,
                timestamp: new Date().toISOString(),
              },
            })

            return Response.json({ success: true })
          } catch (e) {
            return Response.json({ success: false, error: String(e) }, { status: 500 })
          }
        },
      },
      {
        path: '/soketi/connections',
        method: 'get',
        handler: async (req) => {
          try {
            const settings = (await req.payload.findGlobal({
              slug: 'notification-settings',
            })) as any

            if (settings.mode !== 'self-hosted' || !settings.soketiHost) {
              return Response.json({ count: 1 }) // Fallback mock
            }

            const searchParams = new URL(req.url).searchParams
            const channel = searchParams.get('channel') || 'posts'

            const host = settings.soketiHost.replace(/^https?:\/\//, '').replace(/\/+$/, '')
            let protocol = settings.soketiHost.startsWith('https') ? 'https' : 'http'
            if (settings.soketiPort === 443) protocol = 'https'

            const port = settings.soketiPort ? `:${settings.soketiPort}` : ''
            const path = `/apps/${settings.soketiAppId}/channels/${channel}`

            const authTimestamp = Math.floor(Date.now() / 1000).toString()
            const queryParams = {
              auth_key: settings.soketiAppKey,
              auth_timestamp: authTimestamp,
              auth_version: '1.0',
              info: 'subscription_count',
            }

            const sortedKeys = Object.keys(queryParams).sort() as Array<
              keyof typeof queryParams
            >
            const queryString = sortedKeys.map((key) => `${key}=${queryParams[key]}`).join('&')

            const signString = `GET\n${path}\n${queryString}`
            const crypto = await import('crypto')
            const signature = crypto.default
              .createHmac('sha256', settings.soketiAppSecret)
              .update(signString)
              .digest('hex')

            const url = `${protocol}://${host}${port}${path}?${queryString}&auth_signature=${signature}`

            const res = await fetch(url)
            if (!res.ok) {
              const errBody = await res.text()
              throw new Error(`Soketi API returned status ${res.status}: ${errBody}`)
            }

            const data = (await res.json()) as { subscription_count?: number; occupied?: boolean }
            
            return Response.json({ count: data.subscription_count ?? (data.occupied ? 1 : 0) })
          } catch (e: any) {
            req.payload.logger.error('Error fetching Soketi connections: ' + e)
            return Response.json({ count: 1 }) // Fallback mock
          }
        },
      },
      {
        path: '/soketi/auth',
        method: 'post',
        handler: async (req) => {
          try {
            const settings = (await req.payload.findGlobal({
              slug: 'notification-settings',
            })) as any

            if (settings.mode !== 'self-hosted' || !settings.soketiAppSecret) {
              return new Response('Unauthorized', { status: 403 })
            }

            const text = await req.text()
            const params = new URLSearchParams(text)
            const socketId = params.get('socket_id')
            const channelName = params.get('channel_name')

            if (!socketId || !channelName) {
              return new Response('Bad request', { status: 400 })
            }

            // Simple user extraction (fallback to anonymous ID if not logged in)
            const user = (req as any).user
            const userId = user?.id || `anon_${Math.floor(Math.random() * 10000)}`
            const userInfo = user ? { email: user.email } : { email: 'anonymous@guest.com' }

            let stringToSign = `${socketId}:${channelName}`
            let channelDataStr = ''

            // Presence channels require user information in the signature
            if (channelName.startsWith('presence-')) {
              const channelData = { user_id: String(userId), user_info: userInfo }
              channelDataStr = JSON.stringify(channelData)
              stringToSign += `:${channelDataStr}`
            }

            const crypto = await import('crypto')
            const signature = crypto.default
              .createHmac('sha256', settings.soketiAppSecret)
              .update(stringToSign)
              .digest('hex')

            const authResponse: any = {
              auth: `${settings.soketiAppKey}:${signature}`,
            }

            if (channelDataStr) {
              authResponse.channel_data = channelDataStr
            }

            return Response.json(authResponse)
          } catch (e) {
            req.payload.logger.error('Soketi Auth Error: ' + e)
            return new Response('Server Error', { status: 500 })
          }
        },
      },
      {
        path: '/soketi/channels',
        method: 'get',
        handler: async (req) => {
          try {
            const settings = (await req.payload.findGlobal({
              slug: 'notification-settings',
            })) as any

            if (settings.mode !== 'self-hosted' || !settings.soketiHost) {
              return Response.json({ channels: {} })
            }

            const searchParams = new URL(req.url).searchParams
            const prefix = searchParams.get('filter_by_prefix')

            const host = settings.soketiHost.replace(/^https?:\/\//, '').replace(/\/+$/, '')
            let protocol = settings.soketiHost.startsWith('https') ? 'https' : 'http'
            if (settings.soketiPort === 443) protocol = 'https'

            const port = settings.soketiPort ? `:${settings.soketiPort}` : ''
            const path = `/apps/${settings.soketiAppId}/channels`

            const authTimestamp = Math.floor(Date.now() / 1000).toString()
            const queryParams: any = {
              auth_key: settings.soketiAppKey,
              auth_timestamp: authTimestamp,
              auth_version: '1.0',
            }

            if (prefix) {
              queryParams.filter_by_prefix = prefix
            }

            const sortedKeys = Object.keys(queryParams).sort()
            const queryString = sortedKeys.map((key) => `${key}=${queryParams[key]}`).join('&')

            const signString = `GET\n${path}\n${queryString}`
            const crypto = await import('crypto')
            const signature = crypto.default
              .createHmac('sha256', settings.soketiAppSecret)
              .update(signString)
              .digest('hex')

            const url = `${protocol}://${host}${port}${path}?${queryString}&auth_signature=${signature}`

            const res = await fetch(url)
            if (!res.ok) {
              const errBody = await res.text()
              throw new Error(`Soketi API returned status ${res.status}: ${errBody}`)
            }

            const data = await res.json()
            return Response.json(data)
          } catch (e: any) {
            req.payload.logger.error('Error fetching Soketi channels: ' + e)
            return Response.json({ channels: {} })
          }
        },
      },
      {
        path: '/soketi/webhooks',
        method: 'post',
        handler: async (req) => {
          try {
            const settings = (await req.payload.findGlobal({
              slug: 'notification-settings',
            })) as any

            if (settings.mode !== 'self-hosted' || !settings.soketiAppSecret) {
              return new Response('Not configured', { status: 400 })
            }

            const rawBody = await req.text()
            const signatureHeader = req.headers.get('x-pusher-signature')

            if (!signatureHeader) {
              return new Response('Missing signature', { status: 401 })
            }

            const crypto = await import('crypto')
            const expectedSignature = crypto.default
              .createHmac('sha256', settings.soketiAppSecret)
              .update(rawBody)
              .digest('hex')

            if (signatureHeader !== expectedSignature) {
              return new Response('Invalid signature', { status: 401 })
            }

            const payload = JSON.parse(rawBody)

            for (const event of payload.events) {
              req.payload.logger.info(
                `[notifications] Webhook Event: ${event.name} on ${event.channel}`,
              )
              // This is where users can add custom logic to update online status or clear rooms
            }

            return Response.json({ success: true })
          } catch (e) {
            req.payload.logger.error('Webhook processing error: ' + e)
            return new Response('Server Error', { status: 500 })
          }
        },
      }
    )

    // ── Collection hooks ──────────────────────────────────────
    if (pluginOptions.collections && config.collections) {
      for (const [slug, entry] of Object.entries(pluginOptions.collections)) {
        if (!entry) continue

        const collection = config.collections.find((c) => c.slug === slug)
        if (!collection) continue

        const hookConfig = normalizeHookEntry(entry)

        if (!collection.hooks) {
          collection.hooks = {}
        }

        // -- afterChange hook (create + update) --
        const shouldHookChange =
          !hookConfig.events ||
          hookConfig.events.includes('create') ||
          hookConfig.events.includes('update')

        if (shouldHookChange) {
          if (!collection.hooks.afterChange) {
            collection.hooks.afterChange = []
          }
          collection.hooks.afterChange.push(
            createAfterChangeHook({
              slug,
              config: hookConfig,
              saasGatewayUrl: pluginOptions.saasGatewayUrl,
            }),
          )
        }

        // -- afterDelete hook --
        const shouldHookDelete = !hookConfig.events || hookConfig.events.includes('delete')

        if (shouldHookDelete) {
          if (!collection.hooks.afterDelete) {
            collection.hooks.afterDelete = []
          }
          collection.hooks.afterDelete.push(
            createAfterDeleteHook({
              slug,
              config: hookConfig,
              saasGatewayUrl: pluginOptions.saasGatewayUrl,
            }),
          )
        }
      }
    }

    // ── Auto-Enrollment (Free Tier out-of-the-box) ───────────
    const existingOnInit = config.onInit
    config.onInit = async (payload) => {
      // 1. Run the consumer's original onInit first
      if (existingOnInit) {
        await existingOnInit(payload)
      }

      // 2. Check if we need to auto-enroll
      try {
        const settings = await payload.findGlobal({ slug: 'notification-settings' })

        // If no key exists and it hasn't been explicitly configured yet
        if (!settings?.saasApiKey && settings?.mode !== 'self-hosted') {
          const baseUrl = pluginOptions.saasGatewayUrl ?? 'https://api.yoursaas.com/v1'

          try {
            // Hit the SaaS Gateway to generate free-tier credentials
            const res = await fetch(`${baseUrl}/auto-enroll`, { method: 'POST' })
            if (res.ok) {
              const data = (await res.json()) as { saasApiKey: string; tenantId: string }

              // Automatically save and activate the settings
              await payload.updateGlobal({
                slug: 'notification-settings',
                data: {
                  enabled: true,
                  mode: 'saas',
                  saasApiKey: data.saasApiKey,
                  tenantId: data.tenantId,
                },
              })

              payload.logger.info(
                '[notifications] Automatically enrolled in the Free Tier. Real-time events are now active!',
              )
            }
          } catch (err) {
            // Silently fail if offline or gateway is unreachable
            payload.logger.warn(
              '[notifications] Could not auto-enroll in free tier (network issue).',
            )
          }
        }
      } catch (err) {
        // Ignore errors if the database or collection isn't ready
      }
    }

    return config
  }
