Payload Plugin Notifications: Master Implementation Plan

This document outlines the complete architectural roadmap for building the payload-plugin-notifications. It combines the core event dispatcher, the adapter pattern for graceful degradation, and the embedded SaaS billing dashboard inside the Payload CMS Admin panel.

Phase 1: Plugin Architecture & Global Configuration

Goal: Set up the plugin scaffolding and create the database schema to store the user's settings, ensuring it degrades gracefully if services are offline.

Initialize the Plugin: Create a standard Payload plugin structure exporting a notificationsPlugin function.

Create the NotificationSettings Global:
Inject a new Global collection into the user's Payload instance.

Fields: enabled (boolean), mode ('saas' or 'self-hosted'), saasApiKey (text), tenantId (text), sockudoUrl (text), appriseUrl (text).

Admin Config: Override the default Payload view for this Global by injecting a custom React component for the UI:

admin: {
components: {
views: {
edit: {
default: {
Component: '/path/to/NotificationDashboard.tsx'
}
}
}
}
}

Build the Central Dispatcher:
Create the dispatchEvent(event, payload) function. This function must:

Read the NotificationSettings Global.

If enabled is false, immediately return (zero-blocking).

Use fetch to make an HTTP POST to either the SaaS Gateway (using the saasApiKey as a Bearer token) or the local sockudoUrl/appriseUrl.

Wrap the fetch in a try/catch and do not await the final network resolution, ensuring Payload's save operations never hang.

Phase 2: The Embedded SaaS Dashboard (React Component)

Goal: Build the React component (NotificationDashboard.tsx) that lives inside the Payload Admin panel, allowing users to subscribe, connect, and monitor usage without leaving their CMS.

The "Disconnected" State (Marketing UI):

Check if saasApiKey exists in the Global config. If not, display pricing tiers (Starter, Growth).

Implement the "Connect & Subscribe" button. This button sets window.location.href to your SaaS OAuth route, passing the current Payload URL as a callback:
https://app.yoursaas.com/connect?callback_url=https://their-cms.com/admin/settings/notifications

The Handshake Callback:

Use Next.js useSearchParams() inside the React component.

If the component mounts and detects ?saas_api_key=...&tenant_id=... in the URL, immediately fire an API request to the local Payload REST API (POST /api/globals/notification-settings) to save these keys securely in the database.

Use window.history.replaceState to strip the API keys from the browser's URL bar for security.

The "Connected" State (Usage UI):

If keys exist, fetch live metrics by making a request to your SaaS gateway: GET https://api.yoursaas.com/v1/tenant/usage.

Display HTML <progress> bars showing real-time WebSocket events and push notifications used this month vs. their plan limit.

Add a "Manage Billing" button that requests a Stripe Portal Session URL from your SaaS gateway and redirects the user to Stripe.

Phase 3: The SaaS Gateway & Billing Engine (api.yoursaas.com)

Goal: Build the cloud infrastructure that handles subscriptions, validates API keys, and routes traffic to the physical WebSocket servers.

The Connection Route (/connect):

Build a frontend route on your SaaS that prompts the user to log in or create an account.

Once logged in, present Stripe Checkout.

On successful checkout, generate a unique tenant_id and saas_api_key in your billing database (Postgres/MongoDB).

Redirect the user back to the callback_url provided in step 1, appending the generated keys.

The Billing Endpoints:

GET /v1/tenant/usage: Validates the Bearer API key, checks Redis/Postgres for the current month's usage counters, and returns { websocketCount: 1250, limit: 100000 }.

POST /v1/tenant/portal-session: Uses the Stripe SDK to generate a secure Customer Portal link so the user can upgrade/cancel their plan.

The Dispatch Proxy (POST /v1/dispatch):

Receives the event from the user's Payload CMS.

Checks the API key and ensures the user hasn't exceeded their tier limit.

Increments the usage counter.

Forwards the payload securely via the internal network to your heavy-lifting infrastructure (Sockudo / Apprise).

Phase 4: Integration with Core Projects (Asaas & Siraj)

Goal: Wire the plugin into your open-source products.

Install the Plugin: Add payload-plugin-notifications to the Asaas and Siraj payload.config.ts.

Collection Hooks: In your Messages, Orders, or Courses collections, add afterChange hooks that call the plugin's dispatchEvent() function.

Frontend Clients (React/Next.js):

Install pusher-js in the Siraj/Asaas frontend.

Create a React Context or Hook that connects to the WebSocket URL (either the user's local Sockudo instance or your managed ws.yoursaas.com endpoint, depending on how they configured the CMS).

Graceful Fallbacks: Ensure the frontend uses tools like SWR or React Query to poll for data via standard HTTP if the WebSocket connection fails or isn't enabled by the admin.
