# Payload CMS Real-Time Notifications Plugin

[![npm version](https://img.shields.io/npm/v/payload-plugin-realtime-notifications.svg)](https://www.npmjs.com/package/payload-plugin-realtime-notifications)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A stateless, production-ready, zero-blocking real-time notification publisher plugin for **Payload CMS 3.x**. Easily dispatch real-time events to your clients via WebSockets when database records change, using either a managed SaaS gateway or a self-hosted Sockudo + Apprise stack.

---

## Features

- **Stateless Architecture:** Event publisher model. It doesn't manage connection sockets directly on the CMS, maintaining Payload server performance.
- **Zero-Blocking Hooks:** All database hooks run asynchronously and are safely wrapped in try-catch handlers. Slow network responses from SaaS or self-hosted systems will *never* block Payload save/update operations.
- **Managed & Self-Hosted Modes:** Connect directly to a managed SaaS platform via OAuth, or point to your own Sockudo (WebSocket) and Apprise instances.
- **Fully Generic Hook Configuration:** Opt-in database collections with granular control over events, conditions, data transforms, and event naming.
- **Next.js & React Frontend Integration:** A dedicated decoupled client path (`/react`) with standard React hooks to subscribe and listen to notification feeds from your frontend apps.
- **Graceful Degradation:** Real-time connection status is fully observable on the client to allow seamless polling fallbacks (SWR/React Query) when offline.

---

## Installation

Install the plugin along with `pusher-js` (required if using the frontend react client):

```bash
npm install payload-plugin-realtime-notifications pusher-js
# or
pnpm add payload-plugin-realtime-notifications pusher-js
# or
yarn add payload-plugin-realtime-notifications pusher-js
```

---

## Server-Side Configuration

Register the plugin inside your `payload.config.ts`:

```typescript
import { buildConfig } from 'payload'
import { notificationsPlugin } from 'payload-plugin-realtime-notifications'

export default buildConfig({
  plugins: [
    notificationsPlugin({
      collections: {
        // Option 1: Simple configuration (listens to all events: create, update, delete)
        posts: true,

        // Option 2: Advanced configuration with filters, transforms, and custom event names
        orders: {
          events: ['create', 'update'], // Skip delete events
          condition: ({ doc }) => doc.status === 'paid', // Only dispatch when paid
          transform: ({ doc }) => ({
            id: doc.id,
            total: doc.total,
            customerEmail: doc.customerEmail,
          }), // Strip sensitive fields and dispatch a lighter object
          eventName: ({ operation }) => `shop.order.${operation}`, // Override default names
        },
      },
      // Optional: Override default SaaS gateway URL
      saasGatewayUrl: 'https://api.yoursaas.com/v1',
    }),
  ],
})
```

### Collection Hook Configuration Options

If configuring a collection with an object instead of `true`, the following settings are available:

| Property | Type | Description |
| :--- | :--- | :--- |
| `events` | `Array<'create' \| 'update' \| 'delete'>` | Limit which operations trigger the hooks. Defaults to all three. |
| `condition` | `(args: HookConditionArgs) => boolean` | Returning `false` or throwing an error cancels the dispatch before making network calls. |
| `transform` | `(args: DataTransformArgs) => Record<string, any>` | Shape the webhook body. If it throws, fallback sends the full document. |
| `eventName` | `(args: EventNameArgs) => string` | Custom event name overrides. Default is `{collectionSlug}.{created\|updated\|deleted}`. |

---

## Standalone Hook Factories

If you prefer not to use the automated collections wiring, you can import and attach the hook factories directly to any collection's array manually:

```typescript
import { createAfterChangeHook, createAfterDeleteHook } from 'payload-plugin-realtime-notifications'

export const InvoicesCollection = {
  slug: 'invoices',
  hooks: {
    afterChange: [
      createAfterChangeHook({
        slug: 'invoices',
        config: {
          condition: ({ doc }) => doc.amount > 1000,
        },
      }),
    ],
    afterDelete: [
      createAfterDeleteHook({
        slug: 'invoices',
      }),
    ],
  },
  fields: [],
}
```

---

## Admin Panel Settings & Subscription Flow

Upon registering the plugin, a new Global option titled **Notification Settings** appears in the sidebar under the `Plugins` group. 

Overriding the default Global view, this plugin provides a custom dashboard:

1. **Disconnected (Pricing Grid & Connection):**
   When first visiting the view, you are presented with SaaS marketing pricing cards and a **Connect & Subscribe** button.
2. **The OAuth Handshake:**
   - Clicking **Connect & Subscribe** redirects you to the SaaS Portal to authorize your account and select a subscription plan.
   - On completion, the gateway redirects back to your Payload admin dashboard passing temporary credentials.
   - The React UI reads these parameters, posts them securely to the database using Payload REST API, and instantly purges the keys from the URL address bar using `window.history.replaceState` for security.
3. **Connected (Usage & Billing):**
   Once connected, the screen switches to render:
   - Live monthly usage status (WebSocket counters and push notifications vs. current plan limits).
   - A **Manage Billing** button redirecting the user to Stripe's Customer Portal.
   - A **Disconnect Account** button to cleanly tear down authentication.

---

## Frontend Integration (Next.js / React Client)

You can subscribe to and process live updates inside your web apps by importing from the separate export path `/react` containing no heavy Payload dependencies.

### 1. Wrap Your App in the Provider

```tsx
import { NotificationProvider } from 'payload-plugin-realtime-notifications/react'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotificationProvider
      config={{
        appKey: process.env.NEXT_PUBLIC_SAAS_API_KEY || 'your-app-key',
        // Optional parameters for self-hosted Sockudo configurations:
        // wsHost: 'ws.example.com',
        // forceTLS: true,
      }}
    >
      {children}
    </NotificationProvider>
  )
}
```

### 2. Consume Notifications in Components

```tsx
'use client'

import { useNotifications, useConnectionStatus } from 'payload-plugin-realtime-notifications/react'

export function LiveOrdersList() {
  const status = useConnectionStatus() // 'connecting' | 'connected' | 'disconnected' | 'error'
  const { messages, lastMessage, clearMessages } = useNotifications({
    channel: 'orders',
    events: ['shop.order.created'], // Listen for custom event name
  })

  return (
    <div>
      <div>Connection Status: {status === 'connected' ? '🟢 Live' : '🔴 Offline'}</div>

      <ul>
        {messages.map((msg, idx) => (
          <li key={idx}>
            Order #{msg.data.id} received. Total: {msg.data.total}
          </li>
        ))}
      </ul>
      <button onClick={clearMessages}>Clear</button>
    </div>
  )
}
```

### 3. Implementing Graceful HTTP Fallbacks (SWR/React Query)

If the client disconnects or fails to authenticate, you can fallback to HTTP polling transparently:

```typescript
import useSWR from 'swr'
import { useConnectionStatus, useNotifications } from 'payload-plugin-realtime-notifications/react'

function useLiveFeed() {
  const status = useConnectionStatus()
  const { messages } = useNotifications({ channel: 'posts' })

  // Only poll the database if WebSocket isn't actively connected
  const { data: polledData } = useSWR(
    status !== 'connected' ? '/api/posts' : null,
    fetcher,
    { refreshInterval: 5000 }
  )

  return messages.length > 0 ? messages : (polledData || [])
}
```

---

## Security Best Practices

- **Minimal Scope:** The SaaS credentials are only readable/writable by authenticated Payload administrators.
- **Sanitized URL bar:** API keys passed back via oauth callback routes are scrubbed synchronously prior to background processing to prevent leaks.
- **Decoupled Bundling:** Importing frontend components from `/react` guarantees that server-side database tools never leak to client code bundles.

## License

MIT © [LevantX](https://github.com/levantx-net)
