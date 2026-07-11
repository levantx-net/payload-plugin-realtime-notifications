# Payload CMS Real-Time Notifications Plugin

[![npm version](https://img.shields.io/npm/v/payload-plugin-realtime-notifications.svg)](https://www.npmjs.com/package/payload-plugin-realtime-notifications)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A stateless, production-ready, zero-blocking real-time notification publisher plugin for **Payload CMS 3.x**. Easily dispatch real-time events to your clients via WebSockets when database records change, using either a managed SaaS gateway or a self-hosted Sockudo + Apprise stack.

---

## Features

- **Stateless Architecture:** Event publisher model. It doesn't manage connection sockets directly on the CMS, maintaining Payload server performance.
- **Zero-Blocking Hooks:** All database hooks run asynchronously and are safely wrapped in try-catch handlers. Slow network responses from SaaS or self-hosted systems will *never* block Payload save/update operations.
- **Managed & Self-Hosted Modes:** Connect directly to a managed SaaS platform via OAuth, or point to your own Soketi (WebSocket) and Apprise instances.
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

Depending on the mode selected, developers can configure:
- **Managed (SaaS):** Integrates via a secure OAuth connection redirecting to the SaaS web portal for billing selection (Free, Starter, or Growth tiers).
- **Self-Hosted:** Fully configure Soketi credentials (Host, Port, App ID, App Key, App Secret) and Apprise configurations (Base URL, Config Key, Bearer Token, and Tags) directly within the admin panel.

---

## Frontend Integration (Next.js / React Client)

You can subscribe to and process live updates inside your web apps by importing from the separate export path `/react` containing no heavy Payload dependencies.

### 1. Wrap Your App in the Provider

For Next.js App Router applications, you can fetch the configuration dynamically on the server side using the Payload Local API to prevent leaking private secrets to the client:

```tsx
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { NotificationProvider } from 'payload-plugin-realtime-notifications/react'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Fetch the configuration dynamically from the database
  const payload = await getPayload({ config: configPromise })
  const settings = await payload.findGlobal({ slug: 'notification-settings' })

  const clientConfig = settings.mode === 'self-hosted' 
    ? {
        appKey: settings.soketiAppKey || 'app-key',
        wsHost: settings.soketiHost || 'localhost',
        wsPort: settings.soketiPort || 6001,
        forceTLS: false,
        disableStats: true,
      } 
    : {
        appKey: settings.saasApiKey || 'saas-key',
        cluster: 'mt1',
      }

  return (
    <html lang="en">
      <body>
        <NotificationProvider config={clientConfig}>
          {children}
        </NotificationProvider>
      </body>
    </html>
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

### 3. Track Who is Online (`usePresence`)
For tracking user connections in a lobby or room. Must be used on channels prefixed with `presence-`:

```tsx
import { usePresence } from 'payload-plugin-realtime-notifications/react'

export function ActiveUsersList() {
  const { members, count, myId } = usePresence('presence-chat-room')

  return (
    <div>
      <h4>Online Users ({count})</h4>
      <ul>
        {Object.entries(members).map(([userId, userInfo]) => (
          <li key={userId} style={{ fontWeight: userId === myId ? 'bold' : 'normal' }}>
            {userInfo.email} {userId === myId && '(You)'}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

### 4. Low-Latency Typing Indicators (`useTypingIndicator`)
Send and receive "User is typing..." statuses directly between clients, bypassing database writes:

```tsx
import { useTypingIndicator } from 'payload-plugin-realtime-notifications/react'

export function ChatInput({ currentUser }) {
  const { isTyping, typingUsers, triggerTyping } = useTypingIndicator('presence-chat-room', currentUser.name)

  return (
    <div>
      <input type="text" onChange={triggerTyping} placeholder="Type a message..." />
      {isTyping && (
        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
          {Object.keys(typingUsers).join(', ')} {Object.keys(typingUsers).length === 1 ? 'is' : 'are'} typing...
        </span>
      )}
    </div>
  )
}
```

### 5. UI Helpers: Glowing Live Indicator (`LiveIndicator`)
Drop a glowing WebSocket health dot into your Navbar:

```tsx
import { LiveIndicator } from 'payload-plugin-realtime-notifications/react'

export function Navbar() {
  return (
    <nav>
      <span>MyApp</span>
      <LiveIndicator label="WebSocket Connection Status" />
    </nav>
  )
}
```

### 6. Admin Panel Global Toasts (`AdminLiveToast`)
Register a background listener that pops up real-time toasts directly inside your Payload Admin UI. Import it and add it to your `admin.components.afterNav` in `payload.config.ts`:

```typescript
import { buildConfig } from 'payload'
import { AdminLiveToast } from 'payload-plugin-realtime-notifications/client'

export default buildConfig({
  admin: {
    components: {
      afterNav: [AdminLiveToast],
    },
  },
})
```

---

## Webhook Audit Trail (Realtime Event Logs)

The plugin automatically registers a read-only Payload database collection called `Realtime Logs` (`realtime-logs`).

Whenever Soketi dispatches a webhook event to `/api/soketi/webhooks` (like connection failures, user disconnects, or vacated rooms), the plugin verifies the cryptographical `X-Pusher-Signature` header, parses the raw data, and writes the event history directly to your Payload database. This provides administrators with a secure, permanent audit log of all WebSocket traffic.

---

## Security Best Practices

- **Minimal Scope:** The SaaS credentials are only readable/writable by authenticated Payload administrators.
- **Sanitized URL bar:** API keys passed back via oauth callback routes are scrubbed synchronously prior to background processing to prevent leaks.
- **Decoupled Bundling:** Importing frontend components from `/react` guarantees that server-side database tools never leak to client code bundles.

---

## Built-In API Endpoints

The plugin automatically registers five helper endpoints under your Payload API prefix (usually `/api`):

### 1. Active WebSocket Listener Count
* **Route**: `GET /api/soketi/connections`
* **Query Parameters**:
  * `channel` (optional): The WebSocket channel to query. Defaults to `posts`.
* **Description**: Securely contacts the configured self-hosted Soketi HTTP API using signed requests (HMAC-SHA256) and returns the number of currently active WebSocket listeners (connections) subscribed to that channel.
* **Response**:
  ```json
  {
    "count": 3
  }
  ```

### 2. Client-to-Admin Alert Gateway
* **Route**: `POST /api/admin-alert`
* **Body Parameters**:
  * `message` (optional): The alert message to send. Defaults to `"Alert from client"`.
  * `collection` (optional): The channel name/collection to broadcast on. Defaults to `"posts"`.
* **Description**: Receives an alert payload from your client application and broadcasts a custom `admin.alert` event directly to your configured Soketi (WebSockets) and Apprise (Slack, Discord, Email, etc.) dispatch endpoints.
* **Response**:
  ```json
  {
    "success": true
  }
  ```

### 3. Channel Authentication (Private & Presence Channels)
* **Route**: `POST /api/soketi/auth`
* **Body Parameters (Form URL Encoded)**:
  * `socket_id` (required): The client connection socket ID.
  * `channel_name` (required): The channel name (must start with `private-` or `presence-`).
* **Description**: Authenticates subscription requests for secure channels. Integrates with Payload's authentication. If the client is logged in, it signs the request using the client's User ID and User Info. It will automatically fall back to a guest identifier if the client is not authenticated.
* **Response**:
  ```json
  {
    "auth": "app-key:signature",
    "channel_data": "{\"user_id\":\"123\",\"user_info\":{\"email\":\"user@example.com\"}}" // Only for presence channels
  }
  ```

### 4. Active Channels List
* **Route**: `GET /api/soketi/channels`
* **Query Parameters**:
  * `filter_by_prefix` (optional): Filter the returned channels list by prefix (e.g. `presence-` to see only presence channels).
* **Description**: Securely contacts the Soketi HTTP API and retrieves a list of all active WebSocket channels/rooms currently occupied on the server.
* **Response**:
  ```json
  {
    "channels": {
      "presence-room-1": {
        "user_count": 5
      },
      "private-chat-123": {
        "user_count": 2
      }
    }
  }
  ```

### 5. Soketi Webhook Receiver
* **Route**: `POST /api/soketi/webhooks`
* **Headers**:
  * `X-Pusher-Signature` (required): Signed HMAC-SHA256 signature to verify that Soketi sent the request.
* **Description**: Receives asynchronous webhooks from Soketi (like `channel_occupied`, `channel_vacated`, `member_added`, `member_removed`). This can be configured in your Soketi dashboard/config to run automated database cleanups or update user presence statuses in real-time.
* **Response**:
  ```json
  {
    "success": true
  }
  ```

---

## License

MIT © [LevantX](https://github.com/levantx-net)
