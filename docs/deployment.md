# Deployment Guide

This document describes how to package, publish, and deploy the `payload-plugin-realtime-notifications` plugin, as well as how to set up self-hosted environments (Soketi + Apprise) or connect to the managed SaaS infrastructure.

---

## 1. Building and Packaging the Plugin

The plugin compiles using TypeScript and SWC. 

### Local Build Cycle

To compile the codebase for local verification or package linking:

```bash
# Clean previous builds
pnpm clean

# Copy non-JS assets, build types, and compile TS via SWC
pnpm build
```

This compiles output into the `/dist` directory, structure aligned with package exports:
- `/dist/index.js` (Server-side Entry)
- `/dist/exports/client.js` (Payload Admin UI components)
- `/dist/exports/react.js` (Decoupled React hooks)

### Publishing to npm

To publish the package, make sure you configure your registry credentials, verify version increments, and publish the workspace package:

```bash
pnpm publish
```

---

## 2. Deploying in Managed (SaaS) Mode

When using the Managed SaaS gateway, the deployment of the plugin relies completely on your Payload CMS environment variables.

### Required Environment Configuration

Ensure the following variables are configured in your target deployment environment (e.g. Vercel, Heroku, Coolify, or Docker containers):

```env
# Optional override for the SaaS gateway URL (if targetting a custom region)
# Defaults to the configured production portal URL.
NOTIFICATION_SAAS_GATEWAY_URL=https://api.yoursaas.com/v1
```

Once deployed, the administrator opens the **Notification Settings** page in the CMS, connects via the subscription flow, and the backend automatically persists the retrieved `saasApiKey` and `tenantId` inside the database. No further environment variables are needed to start dispatching.

---

## 3. Deploying Self-Hosted Mode (Soketi & Apprise)

For fully private self-hosted notifications, you need to spin up a Soketi instance (WebSockets gateway) and an Apprise container (multichannel notification router).

### Docker Compose Example Setup

Create a `docker-compose.yml` file to host the self-hosted services alongside your database or Payload app:

```yaml
version: '3.8'

services:
  # Soketi: Pusher-compatible WebSocket server
  soketi:
    image: quay.io/soketi/soketi:1.6.1-16-debian
    ports:
      - "6001:6001"
      - "9601:9601"
    environment:
      - SOKETI_DEBUG=1
      - SOKETI_HOST=0.0.0.0
      - SOKETI_PORT=6001
      - SOKETI_METRICS_SERVER_PORT=9601
      - SOKETI_DEFAULT_APP_ID=app-id
      - SOKETI_DEFAULT_APP_KEY=app-key
      - SOKETI_DEFAULT_APP_SECRET=app-secret
      # Webhooks configuration: Forwards vacate/disconnect events back to Payload CMS
      - SOKETI_WEBHOOKS_0_URL=http://payload-cms:3000/api/soketi/webhooks
      - SOKETI_WEBHOOKS_0_EVENTS=channel_occupied,channel_vacated,member_added,member_removed
    restart: unless-stopped

  # Apprise: Handles physical notifications (Email, Discord, Slack, SMS)
  apprise:
    image: caronc/apprise:latest
    ports:
      - "8000:8000"
    restart: always
```

### CMS Configuration for Self-Hosted

Once the services are deployed:
1. Log in to the Payload Admin panel.
2. Navigate to **Notification Settings**.
3. Select **Self-Hosted** under *Delivery Mode*.
4. Input the configured connection details:
   - **Soketi WebSocket Host:** The domain/IP where Soketi is listening (e.g. `localhost` or `ws.mycms.com`).
   - **Soketi Port:** `6001`
   - **Soketi App ID:** `app-id` (matches SOKETI_DEFAULT_APP_ID).
   - **Soketi App Key:** `app-key` (matches SOKETI_DEFAULT_APP_KEY).
   - **Soketi App Secret:** `app-secret` (matches SOKETI_DEFAULT_APP_SECRET).
   - **Apprise Base URL:** `http://localhost:8000` (or your public domain).
   - **Apprise Config Key:** `apprise` (or the stateful config key defined on your Apprise server).
   - **Apprise Bearer Token:** Optional API token if your Apprise instance is secured.
   - **Apprise Tags:** Optional comma-separated list of services (e.g. `slack,email`) to target.

---

## 4. Frontend Client Environment Configurations

Your frontend application (e.g., Next.js client, Mobile React Native bundle) needs the app key to listen to WebSocket channels. By using Server Components in Next.js, you can fetch this config dynamically on the server side (avoiding static client environment variables).

### Dynamic Client Initialization (Next.js Layout Example)

Fetch configuration dynamically from the CMS database to avoid leaking credentials:

```tsx
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { NotificationProvider } from 'payload-plugin-realtime-notifications/react'

export default async function AppWrapper({ children }) {
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
    <NotificationProvider config={clientConfig}>
      {children}
    </NotificationProvider>
  )
}
```
