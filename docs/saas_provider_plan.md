# Extensible Multi-Service SaaS Provider Implementation Plan

This document outlines the architecture and implementation plan for building a **Multi-Service SaaS Gateway & Web Portal** using Payload CMS. 

The portal is designed to manage and provision multiple infrastructure and application services under a single dashboard, with flexible subscriptions per service or via unified tiers. Adding new services in the future requires minimal overhead.

---

## 1. Architectural Overview

The SaaS Provider is built as a single **Payload 3.0 (Next.js App Router)** application. It functions as:
1. **The Identity & Tenant Manager:** Manages developer accounts (`Users`), their projects (`Tenants`), and API keys.
2. **The Service Registry:** Orchestrates multiple integrated backend services (WebSockets, App Deployment, WebRTC Media, Video Protection) and holds their active subscriptions.
3. **The API Gateway:** Exposes unified, namespace-scoped endpoints (e.g., `/api/v1/socket/*`, `/api/v1/livekit/*`) routed to specific service backends.
4. **The Billing Orchestrator:** Connects to Stripe to manage multi-item or per-service subscriptions, metered usage, and subscription lifecycles.

```mermaid
graph TD
    Client[Consumer App / Plugin] -->|Auth: saasApiKey| Gateway[API Gateway /api/v1]
    Gateway -->|Authentication / Verification| DB[(Payload DB)]
    Gateway -->|Namespace Route| ServiceRouter{Service Router}
    
    ServiceRouter -->|/socket/*| SocketService[Socket & Notification Service]
    ServiceRouter -->|/dokploy/*| DokployService[Dokploy Deployment Service]
    ServiceRouter -->|/livekit/*| LiveKitService[LiveKit Media Service]
    ServiceRouter -->|/video/*| VideoService[Video Protection Service]

    SocketService -->|Broadcasts| Soketi[Soketi Cluster]
    DokployService -->|Deploys| Dokploy[Dokploy VPS Engine]
    LiveKitService -->|WebRTC Tokens| LiveKit[LiveKit Server]
    VideoService -->|Signed Playback| VideoProvider[Secure Video Delivery / CDN]
```

---

## 2. Extensible Database Schema (Payload Collections)

To allow the platform to scale to new services without modifying database schemas repeatedly, we decouple tenants from specific services using an **Entitlements and Subscription** pattern.

### 2.1 Collection: `Users`
Represents the developers logging into the SaaS portal.
* **Fields:**
  * `email` (standard auth field)
  * `githubId` / `googleId` (for social developer logins)

### 2.2 Collection: `Tenants`
Represents a developer's project or organization.
* **Fields:**
  * `name` (text, required)
  * `owner` (relationship to `Users`, required)
  * `saasApiKey` (text, unique, indexed for high-performance lookups)
  * `status` (select: `active`, `suspended`, default: `active`)

### 2.3 Collection: `Services` (The Service Registry)
Holds the definition of the services offered by the platform.
* **Fields:**
  * `name` (text, required, e.g., "Socket & Notification")
  * `slug` (text, unique, required, e.g., `socket-notification`, `dokploy-deploy`, `livekit-media`, `video-protection`)
  * `description` (textarea)
  * `status` (select: `active`, `beta`, `deprecated`)

### 2.4 Collection: `ServicePlans`
Defines the pricing and quota configurations for specific services.
* **Fields:**
  * `service` (relationship to `Services`, required)
  * `name` (text, required, e.g., "Developer Free", "Scale Plan")
  * `slug` (text, unique, required, e.g., `socket-free`, `livekit-pro`)
  * `stripePriceId` (text, optional for free tiers)
  * `quotas` (array of quota objects, or JSON)
    * `key` (text, e.g., `monthly_events`, `concurrent_connections`, `build_minutes`)
    * `limit` (number, `-1` for unlimited)

### 2.5 Collection: `ServiceSubscriptions`
Bridges a `Tenant` with their active `ServicePlans`, holding service-specific credentials and configurations.
* **Fields:**
  * `tenant` (relationship to `Tenants`, required)
  * `service` (relationship to `Services`, required)
  * `plan` (relationship to `ServicePlans`, required)
  * `status` (select: `active`, `trialing`, `past_due`, `canceled`)
  * `stripeSubscriptionItemId` (text, for metered billing sync)
  * `currentUsage` (array of usage objects)
    * `key` (text)
    * `value` (number)
  * `config` (blocks, representing service-specific provisioning credentials/configurations)
    * **Block: Socket Config:** `appId`, `key`, `secret`, `cluster`
    * **Block: Dokploy Config:** `applicationId`, `gitRepo`, `branch`, `envVariables`
    * **Block: LiveKit Config:** `hostUrl`, `apiKey`, `apiSecret`
    * **Block: Video Config:** `playbackSigningKey`, `cdnHost`

---

## 3. Core Services Breakdown

Here is how each service will be provisioned, configured, and governed under the extensible schema.

### 3.1 Service: Socket & Notification (Initial Implementation)
Provides real-time event broadcasting (via self-hosted Soketi/Pusher) and notification triggers.
* **Service Slug:** `socket-notification`
* **Quotas & Limits:**
  * `monthly_events`: Default `100,000` (Free), `10,000,000` (Scale).
  * `max_connections`: Concurrent WebSocket connections limit.
* **Subscription Configuration:**
  ```json
  {
    "appId": "socket_app_123",
    "key": "socket_key_abc",
    "secret": "socket_sec_xyz"
  }
  ```
* **Endpoints:**
  * `POST /api/v1/socket/dispatch`: Proxies events to the Soketi cluster.
  * `POST /api/v1/socket/auto-enroll`: Streamlined endpoint for plugins to set up instantly.

### 3.2 Service: Dokploy Deployments
Deploys and manages web applications onto developer servers via Dokploy's API.
* **Service Slug:** `dokploy-deploy`
* **Quotas & Limits:**
  * `active_projects`: Maximum number of running applications.
  * `build_minutes`: Monthly CI/CD pipeline execution minutes.
* **Subscription Configuration:**
  ```json
  {
    "applicationId": "dokploy_app_uuid",
    "gitRepo": "github.com/org/repo",
    "branch": "main",
    "envVariables": "PORT=3000\nDATABASE_URL=mongodb://..."
  }
  ```
* **Endpoints / Operations:**
  * `POST /api/v1/dokploy/deploy`: Calls the Dokploy API to pull the latest code and trigger a rebuild.
  * `GET /api/v1/dokploy/logs`: Streams build and runtime logs back to the portal dashboard.
  * `POST /api/v1/dokploy/restart`: Triggers container restarts.

### 3.3 Service: LiveKit Media Server
Provides WebRTC rooms, audio/video SFU routing, and media recording.
* **Service Slug:** `livekit-media`
* **Quotas & Limits:**
  * `connection_minutes`: Cumulative participant call minutes.
  * `max_participants`: Max concurrent attendees in a single room.
* **Subscription Configuration:**
  ```json
  {
    "hostUrl": "wss://livekit.yoursaas.com",
    "apiKey": "lk_api_key_abc",
    "apiSecret": "lk_api_secret_xyz"
  }
  ```
* **Endpoints / Operations:**
  * `POST /api/v1/livekit/token`: Generates short-lived WebRTC join tokens for client browsers using the LiveKit Node SDK.
  * `GET /api/v1/livekit/rooms`: Returns active rooms and their participants.

### 3.4 Service: Video Protection (Mux-like)
Secure, token-authorized video streaming with DRM and signing key enforcement.
* **Service Slug:** `video-protection`
* **Quotas & Limits:**
  * `storage_gb`: Gigabytes of raw video files stored.
  * `streaming_minutes`: Minutes of video streamed.
* **Subscription Configuration:**
  ```json
  {
    "playbackSigningKey": "-----BEGIN RSA PRIVATE KEY-----...",
    "cdnHost": "https://media.yoursaas.com"
  }
  ```
* **Endpoints / Operations:**
  * `POST /api/v1/video/upload`: Returns a secure pre-signed upload URL for files.
  * `POST /api/v1/video/playback-token`: Generates signed JWT playback tokens required to stream protected video assets.

---

## 4. Multi-Service API Gateway Route Structure

The gateway routes requests to the appropriate service handler using the following URL structure:
`https://api.yoursaas.com/v1/:serviceSlug/:action`

### Custom Payload Endpoint Router
We define a dynamic endpoint interceptor inside `payload.config.ts` to handle authorization and route dispatching.

```typescript
// payload.config.ts
export default buildConfig({
  endpoints: [
    {
      path: '/v1/:serviceSlug/:action*',
      method: 'all',
      handler: gatewayRouterHandler,
    }
  ]
})
```

### Dynamic Gateway Handler Logic:
1. **Extract Authorization:** Read the `Authorization: Bearer <saasApiKey>` header.
2. **Retrieve Tenant & Subscription:**
   - Search the `Tenants` collection for the API key.
   - Find the corresponding `ServiceSubscriptions` record matching the `tenant.id` and the requested `:serviceSlug`.
   - If either is missing or suspended, return `401 Unauthorized`.
3. **Verify Quotas:**
   - Check if current usage exceeds limits specified in the subscription's `ServicePlan`. If yes, return `429 Too Many Requests`.
4. **Delegate Route Execution:**
   - Look up the active handler function for the given `:serviceSlug` and `:action`.
   - Inject the resolved tenant details and service configurations (`ServiceSubscriptions.config`) into the request context.
   - Execute the handler and return its output.

---

## 5. The Portal Dashboard (Frontend)

Built as standard Next.js App Router pages inside the `app/(portal)/` directory:

* **`/dashboard` (Main Dashboard):** Lists all available services with toggles to enable or configure them.
* **`/dashboard/:serviceSlug` (Service Details):**
  * Displays service-specific metrics and usage progress bars.
  * Lists credentials (e.g., API keys, Connection URLs).
  * Houses service-specific settings (e.g., Repo URL for Dokploy, Host URLs for LiveKit).
* **`/connect?services=socket-notification` (Multi-Service Handshake):**
  * Supports auto-enrollment with query parameters specifying which services are requested.
  * Provisions requested services automatically on free plans, returning credentials.

---

## 6. Subscription Billing Model (Stripe Integration)

To handle subscriptions across multiple independent services, we configure Stripe using **Metered Billing** or **Subscription Add-ons**.

1. **Stripe Customer:** Each `Tenant` maps to a single Stripe Customer ID.
2. **Service Add-ons (Multiple Stripe Price IDs):**
   - Each `ServicePlan` is linked to a Stripe Price ID.
   - Upgrading a service adds that price item to the Tenant's active Stripe subscription.
3. **Metered Invoicing (Webhooks):**
   - When usage occurs (e.g., events sent, streaming minutes consumed), we push usage records to Stripe via the Usage Records API.
   - At the end of the billing cycle, Stripe aggregates these and invoices the developer.
   - A webhook handler (`/api/stripe/webhook`) listens for invoice payments to update statuses in `ServiceSubscriptions`.

---

## 7. High-Performance Usage Tracking (Redis Layer)

Database writes for each API transaction (e.g., incrementing event counts) are bypassed in favor of Redis:

* **Increment in Redis:** For incoming `/api/v1/socket/dispatch` calls, run `redis.hincrby('usage:' + tenantId + ':' + serviceSlug, 'events', 1)`.
* **Sync Task:** A scheduled cron job queries Redis hourly and updates the `currentUsage` field in the Payload DB `ServiceSubscriptions` collection. This preserves database integrity while sustaining high-throughput API endpoints.

---

## 8. Step-by-Step Implementation Phases

### Phase 1: Core Framework & Extensible DB Models
* Initialize Payload CMS with the relational database schema (`Users`, `Tenants`, `Services`, `ServicePlans`, `ServiceSubscriptions`).
* Seed the registry with the initial `socket-notification` service definition.
* Build the core API Gateway authorization router (`/api/v1/:serviceSlug/:action`).

### Phase 2: Socket & Notification Implementation (Initial Focus)
* Build the dynamic endpoint handlers for `/v1/socket/dispatch` and `/v1/socket/auto-enroll`.
* Configure the client dashboard UI within the plugin to query `/v1/socket/usage` to show event statistics.
* Integrate the Redis layer to track real-time broadcast counts for the Socket service.

### Phase 3: Stripe Integration & Developer Portal UI
* Build the Next.js portal landing page and the Multi-Service developer dashboard.
* Integrate Stripe checkout sessions that dynamically build multi-service subscriptions based on active developer choices.
* Implement Stripe webhooks to handle upgrades/downgrades and subscription status syncing.

### Phase 4: Expansion (Dokploy, LiveKit, & Video Protection)
* Seed the registry with the `dokploy-deploy`, `livekit-media`, and `video-protection` service definitions.
* Create respective service-specific configuration block models.
* Write endpoint handlers to securely delegate requests to the Dokploy, LiveKit, and Video backend APIs.
