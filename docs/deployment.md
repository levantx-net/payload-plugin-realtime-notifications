# Deployment Guide

This document describes how to package, publish, and deploy the `payload-plugin-realtime-notifications` plugin, as well as how to set up self-hosted environments (Sockudo + Apprise) or connect to the managed SaaS infrastructure.

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

## 3. Deploying Self-Hosted Mode (Sockudo & Apprise)

For fully private self-hosted notifications, you need to spin up a Sockudo instance (WebSockets gateway) and an Apprise container (multichannel notification router).

### Docker Compose Example Setup

Create a `docker-compose.yml` file to host the self-hosted services alongside your database or Payload app:

```yaml
version: '3.8'

services:
  # Sockudo: WebSocket server speaking the Pusher protocol
  sockudo:
    image: sockudo/sockudo:latest
    ports:
      - "8080:8080"
    environment:
      - SOCKUDO_APP_ID=notification-app
      - SOCKUDO_APP_KEY=self_hosted_key_123
      - SOCKUDO_APP_SECRET=self_hosted_secret_abc
      - SOCKUDO_PORT=8080
    restart: always

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
4. Input the configured connection URLs:
   - **Sockudo WebSocket URL:** `http://localhost:8080` (or your public domain, e.g. `https://ws.mycms.com`)
   - **Apprise Notification URL:** `http://localhost:8000` (or your public domain)

---

## 4. Frontend Client Environment Configurations

Your frontend application (e.g., Next.js client, Mobile React Native bundle) needs the app key to listen to WebSocket channels. 

### Environment Configuration (.env.local)

```env
# The WebSocket application key (Managed Tenant API key or Sockudo App Key)
NEXT_PUBLIC_NOTIFICATION_APP_KEY=self_hosted_key_123

# Required ONLY for Self-Hosted connections:
NEXT_PUBLIC_NOTIFICATION_WS_HOST=ws.mycms.com
```

### Next.js Client Hook Initialization

```tsx
import { NotificationProvider } from 'payload-plugin-realtime-notifications/react'

export function AppWrapper({ children }) {
  const isSelfHosted = !!process.env.NEXT_PUBLIC_NOTIFICATION_WS_HOST

  return (
    <NotificationProvider
      config={{
        appKey: process.env.NEXT_PUBLIC_NOTIFICATION_APP_KEY!,
        ...(isSelfHosted ? {
          wsHost: process.env.NEXT_PUBLIC_NOTIFICATION_WS_HOST,
          forceTLS: true,
        } : {
          cluster: 'eu', // Or SaaS cluster
        })
      }}
    >
      {children}
    </NotificationProvider>
  )
}
```
