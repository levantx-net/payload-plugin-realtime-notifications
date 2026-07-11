# SaaS Infrastructure & Integration Guide

This guide details how to build and configure the SaaS cloud infrastructure to power the `payload-plugin-realtime-notifications` plugin. It outlines the step-by-step setup required so developers can sign up, subscribe via Stripe, and seamlessly connect their Payload CMS admin panel to your service.

---

## 1. SaaS System Architecture Overview

The SaaS infrastructure consists of three main components:
1. **SaaS Web Portal (`app.yoursaas.com`):** A Next.js/React app where developers sign up, select a subscription tier, manage billing via Stripe, and view credentials.
2. **SaaS Gateway API (`api.yoursaas.com`):** The central HTTP server that handles API key verification, routes client usage requests, processes Stripe webhooks, and proxies notifications to WebSockets.
3. **WebSocket Cluster (Pusher-compatible / Soketi):** Manages active WebSockets connections from consumer frontend clients.

```mermaid
graph TD
    subgraph CMS ["Developer's Payload CMS"]
        UI["Admin Panel Dashboard"] -->|"Connect Redirect"| Portal["SaaS Portal (app.yoursaas.com)"]
        UI -->|"PATCH keys"| DB[(Local CMS DB)]
        Hook["Collection Hook"] -->|"POST /v1/dispatch"| Gateway["SaaS Gateway (api.yoursaas.com)"]
    end

    subgraph Billing ["Billing Pipeline"]
        Portal -->|"Stripe Checkout"| Stripe["Stripe Checkout / Portal"]
        Stripe -->|"Webhooks"| Gateway
    end

    subgraph SaaS ["SaaS Cloud Service"]
        Gateway -->|"Verify Limits / Keys"| SaaSDB[(SaaS database / Redis)]
        Gateway -->|"Forward Payload"| WS["WebSocket Server (Soketi)"]
    end

    subgraph App ["Consumer Frontend App"]
        WS -->|"WebSockets"| FE["React App (react-useNotifications)"]
    end

    style CMS fill:#1e293b,color:#fff
    style Billing fill:#312e81,color:#fff
    style SaaS fill:#14532d,color:#fff
```

---

## 2. Step-by-Step Setup Checklist

### Step 1: Set Up SaaS Databases
You need a persistent database (e.g., PostgreSQL or MongoDB) for accounts and a fast cache database (Redis) for tracking real-time usage/rate limits.

* **Account Schema Requirements:**
  - `userId` (Primary Key)
  - `email`
  - `stripeCustomerId` (nullable)
  - `tenantId` (UUID, unique index)
  - `saasApiKey` (hashed or encrypted index)
  - `plan` (e.g. `'free'`, `'starter'`, `'growth'`)
* **Redis Counter Strategy:**
  - Track usage monthly using Redis keys structured by tenant and month: `usage:{tenantId}:{YYYY-MM}:websocket` and `usage:{tenantId}:{YYYY-MM}:push`.

### Step 2: Configure Stripe Products and Webhooks
1. **Create Products in Stripe:**
   - Create a product for each tier (e.g. *Starter*, *Growth*).
   - Configure monthly recurring Prices. Note down the **Stripe Price IDs** (e.g., `price_1Oxx...`).
2. **Setup Stripe Webhooks:**
   - Configure a webhook endpoint in Stripe pointing to `https://api.yoursaas.com/v1/stripe/webhook`.
   - Listen to the following events:
     - `checkout.session.completed`: Upgrades the user account and generates active API Keys.
     - `customer.subscription.deleted`: Downgrades the account to `free` or disables the tenant's keys.
     - `customer.subscription.updated`: Syncs active plan updates.

### Step 3: Implement OAuth Handshake Redirection (`/connect`)
In the SaaS Web Portal, build the route `GET /connect` that prompts users to login/register and then provisions their account. To ensure a seamless connection, provide a frictionless path for the Free tier.

1. **Capture Callback URL & Plan Choice:**
   - The user is redirected from the CMS Admin panel with `?callback_url=...&plan=free` (or starter/growth). Store this URL in the browser session or state.
2. **Prompt Sign-up & Authenticate:**
   - If not authenticated, prompt the user to create an account.
3. **Provision the Account (Frictionless vs. Paid):**
   - **For Free Tier:** Instantly provision the account in your database. Bypass Stripe Checkout completely so developers can start testing immediately.
   - **For Paid Tiers:** Redirect the user to a Stripe Checkout Session for the selected plan tier.
4. **Generate Keys on Success:**
   - Upon successful account creation or Stripe Payment, query your SaaS database:
     - Check if the user already has a `tenantId` and `saasApiKey`. If not, generate them:
       - `tenantId`: Generate a standard UUID (e.g. `123e4567-e89b-12d3-a456-426614174000`).
       - `saasApiKey`: Generate a secure random prefix token (e.g. `sk_live_5e8e...`).
5. **Redirect back to CMS:**
   - Construct the redirection URL using the captured `callback_url`:
     ```
     {callback_url}?saas_api_key={saasApiKey}&tenant_id={tenantId}
     ```
   - Redirect the developer's browser back to this URL. The plugin handles the rest!

---

## 3. Implementing the SaaS Gateway API Endpoints

The SaaS Gateway (`api.yoursaas.com`) must implement three critical endpoints to integrate directly with the CMS dashboard UI.

### 1. The Dispatch Proxy: `POST /v1/dispatch`
Invoked automatically by the Payload collection hooks.

* **Headers:** `Authorization: Bearer {saasApiKey}`
* **Execution Flow:**
  1. Parse the Bearer token and find the matching tenant/user in your database.
  2. If tenant does not exist, return `401 Unauthorized`.
  3. Query current month usage count from Redis (e.g., `usage:{tenantId}:{YYYY-MM}:websocket`).
  4. Compare the usage count to the user's plan tier limits. If exceeded, return `429 Too Many Requests`.
  5. Increment the Redis usage counter: `INCR usage:{tenantId}:{YYYY-MM}:websocket`.
  6. Forward the event payload internally to your Soketi / WebSocket cluster.
  7. Return `200 OK`.

### 2. Auto-Enrollment (Free Tier out-of-the-box): `POST /v1/auto-enroll`
Invoked silently by the Payload CMS plugin when it boots up (`onInit`) and detects no API keys. This enables the "out of the box" experience.

* **Headers:** None (or origin checks).
* **Execution Flow:**
  1. Instantly provision an anonymous tenant in the database.
  2. Generate a `tenantId` and a `saasApiKey` limited to the free tier (e.g., 100 events).
  3. Return the credentials:
     ```json
     {
       "tenantId": "123e4567-e89b...",
       "saasApiKey": "sk_free_..."
     }
     ```
  4. The CMS plugin saves this automatically and immediately begins dispatching events!

### 3. Tenant Usage Metrics: `GET /v1/tenant/usage`
Invoked by the CMS Connected Dashboard UI to render the progress bars.

* **Headers:** `Authorization: Bearer {saasApiKey}`
* **Response Shape (`UsageData`):**
  ```json
  {
    "plan": "Growth",
    "websocketCount": 4200,
    "websocketLimit": 100000,
    "pushCount": 150,
    "pushLimit": 5000
  }
  ```

### 3. Stripe Portal Session: `POST /v1/tenant/portal-session`
Invoked when the admin clicks the "Manage Billing" button in the CMS.

* **Headers:** `Authorization: Bearer {saasApiKey}`
* **Execution Flow:**
  1. Retrieve the matching tenant's `stripeCustomerId` from the database.
  2. Call the Stripe SDK to generate a portal session:
     ```javascript
     const session = await stripe.billingPortal.sessions.create({
       customer: stripeCustomerId,
       return_url: 'https://api.yoursaas.com/v1/tenant/portal-return-redirect', 
       // This endpoint should redirect back to the CMS setting view
     });
     ```
  3. Return the session URL:
     ```json
     { "url": "https://billing.stripe.com/p/session/..." }
     ```

---

## 4. How the Plugin Integrates from the Admin UI

When the developer installs your plugin, here is exactly how your SaaS portal interacts with the CMS interface:

1. **Initiate Handshake:**
   - The developer clicks the **Connect & Subscribe** button in their Payload Admin Panel.
   - The dashboard routes them to:
     `https://app.yoursaas.com/connect?callback_url=http://localhost:3000/admin/globals/notification-settings`
2. **Authorize and Pay:**
   - They subscribe to your billing plan.
3. **Deliver Credentials:**
   - Your SaaS portal redirects them back to:
     `http://localhost:3000/admin/globals/notification-settings?saas_api_key=sk_live_123&tenant_id=tenant_abc`
4. **Scrub & Save:**
   - The plugin's `useHandshake` React hook intercepts the URL, executes `replaceState` to hide the parameters immediately, and submits a `PATCH /api/globals/notification-settings` internally to the local Payload server database.
5. **Polled Verification:**
   - The dashboard re-fetches configuration settings and now displays the subscription statistics (usage progress meters) fetched from your gateway's `/v1/tenant/usage` API.

---

## 5. Deploying the SaaS Infrastructure on Dokploy

[Dokploy](https://dokploy.com/) is a powerful open-source PaaS that simplifies deploying Docker containers, databases, and applications. Here is how to deploy the real-time notifications infrastructure on a single Dokploy server.

### 1. Provision the Databases
In your Dokploy dashboard, navigate to **Databases** and create two services:
* **PostgreSQL / MongoDB**: For storing accounts, tenant IDs, and hashed API keys. 
* **Redis**: For tracking real-time usage and rate limits. 
* *Note: Note down the internal network URLs provided by Dokploy (e.g., `redis://dokploy-redis:6379`).*

### 2. Deploy the WebSocket Server (Soketi)
Soketi acts as your Pusher-compatible WebSocket cluster.
1. Go to **Applications** -> **Create Application**.
2. Set the Name to `websocket-cluster`.
3. Set the Docker Image to `quay.io/soketi/soketi:1.6-16-alpine`.
4. In the **Environment Variables**, define your master Pusher credentials:
   ```env
   SOKETI_DEBUG=1
   SOKETI_DEFAULT_APP_ID=YOUR_APP_ID
   SOKETI_DEFAULT_APP_KEY=YOUR_APP_KEY
   SOKETI_DEFAULT_APP_SECRET=YOUR_APP_SECRET
   ```
5. In the **Domains** tab, attach a public domain (e.g., `ws.yoursaas.com`) with Let's Encrypt SSL enabled. Make sure the internal port is mapped to `6001`.

### 3. Deploy the SaaS Gateway & Portal
You can deploy your Next.js SaaS Web Portal and Gateway API as a single application or separate microservices.
1. Create a new **Application** in Dokploy pointing to your SaaS Git repository.
2. Under **Environment Variables**, connect it to your Dokploy databases and the WebSocket server:
   ```env
   DATABASE_URL=postgres://user:pass@dokploy-postgres:5432/db
   REDIS_URL=redis://dokploy-redis:6379
   STRIPE_SECRET_KEY=sk_live_...
   PUSHER_APP_ID=YOUR_APP_ID
   PUSHER_KEY=YOUR_APP_KEY
   PUSHER_SECRET=YOUR_APP_SECRET
   PUSHER_HOST=dokploy-websocket-cluster
   PUSHER_PORT=6001
   ```
3. Attach your public domains (e.g., `app.yoursaas.com` and `api.yoursaas.com`) to the application and enable SSL.

### 4. Connect the Plugin to your Dokploy Deployment
Once the infrastructure is live, your users (or you) just need to override the default URLs when installing the plugin in their `payload.config.ts`:

```typescript
import { notificationsPlugin } from 'payload-plugin-realtime-notifications'

export default buildConfig({
  plugins: [
    notificationsPlugin({
      // Point the CMS backend to your Dokploy SaaS Gateway
      saasGatewayUrl: 'https://api.yoursaas.com/v1',
      collections: {
        posts: true,
      },
    }),
  ],
})
```

And in their frontend Next.js/React app (`NotificationProvider`), point the WebSocket client to the Dokploy Soketi instance:

```tsx
<NotificationProvider
  config={{
    appKey: 'YOUR_APP_KEY',          // Set in Step 2
    wsHost: 'ws.yoursaas.com',       // Your Dokploy WS domain
    wsPort: 80,
    wssPort: 443,
    forceTLS: true,
    disableStats: true,              // Prevents pinging official Pusher stats
    enabledTransports: ['ws', 'wss'],
  }}
>
  <App />
</NotificationProvider>
```
