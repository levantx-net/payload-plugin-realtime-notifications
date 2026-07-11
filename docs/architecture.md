# Code Architecture

This document details the code architecture of the `payload-plugin-realtime-notifications` plugin. It outlines how the central event pipeline flows, how hooks are triggered and parsed, and how the client and server components communicate.

---

## 1. Overall System Architecture

The plugin is designed to operate on two primary boundaries:
1. **The Server Boundary (Payload CMS):** Processes content edits, determines if events should dispatch, and pushes payloads asynchronously to either a SaaS Gateway proxy or self-hosted systems.
2. **The Client Boundary (Consumer App):** Listens to events using a WebSocket client connected directly to the WebSocket host (either Soketi or the SaaS endpoint).

### System Topology Diagram

```mermaid
graph LR
    subgraph CMS ["Payload CMS (Server)"]
        A["Collection Hook"] -->|"Triggered"| B["dispatchEvent"]
        B -->|"Read Settings"| C[("Notification Settings (Global)")]
        B -->|"Zero-Blocking POST"| D["HTTP Client (fetch)"]
    end

    subgraph Gateway ["Delivery Infrastructure"]
        D -->|"HTTPS"| E["SaaS Gateway Proxy / Apprise"]
        E -->|"Internal Dispatch"| F["Soketi / WebSocket Server"]
    end

    subgraph Client ["Consumer App (Frontend)"]
        G["NotificationProvider"] -->|"WS Connection"| F
        H["useNotifications"] -->|"Subscribe Channel"| G
        I["useConnectionStatus"] -->|"Exposes State"| G
    end

    style CMS fill:#1f3322,stroke:#2e5036,stroke-width:2px,color:#fff
    style Gateway fill:#2a2b4a,stroke:#3b3c66,stroke-width:2px,color:#fff
    style Client fill:#3e243b,stroke:#5c3558,stroke-width:2px,color:#fff
```

---

## 2. Server-Side Execution Flow (Phase 1)

When a database mutation occurs (e.g. document updated/created/deleted), Payload invokes registered collection hooks. The plugin inserts specialized `afterChange` and `afterDelete` hooks.

### Execution Sequence

```mermaid
flowchart TD
    A["Collection Mutation Event"] -->|"afterChange / afterDelete"| B["Collection Hook Factory"]
    B -->|"1. Match Event Filter"| C{"Event Opted-in?"}
    C -->|"No"| D["Return doc (Skip)"]
    C -->|"Yes"| E["2. Evaluate condition()"]
    E -->|"throws / false"| D
    E -->|"true"| F["3. Run transform()"]
    F -->|"transforms doc"| G["Resolve Event Name"]
    G -->|"Call dispatchEvent"| H["Read NotificationSettings Global"]
    H -->|"Check enabled"| I{"enabled?"}
    I -->|"No"| D
    I -->|"Yes"| J["Resolve Dispatch Target"]
    J -->|"Fire-and-Forget fetch()"| K["POST request in catch block"]
    K --> D

    style D fill:#2d5a3d,color:#fff
    style K fill:#5a2d2d,color:#fff
```

### Core Architecture Rules Applied:
1. **Stateless Operations:** Hooks do not persist WebSocket connection objects. They act strictly as event publishers using standard HTTP endpoints.
2. **Zero-Blocking Performance:** The fetch sequence in `dispatchEvent` is detached from the hook execution context. The promise chain is explicitly ignored (`void` operator), preventing the Payload database save cycle from blocking on network resolutions.

---

## 3. The Custom Admin Dashboard & Handshake (Phase 2)

To connect the CMS to the SaaS billing gateway, a custom React component dashboard overrides the default admin edit view for the `notification-settings` Global.

### Handshake Callback Flow

```mermaid
sequenceDiagram
    participant Admin as CMS Admin
    participant CMS as Payload CMS UI
    participant SaaS as SaaS Portal
    participant Stripe as Stripe Gateway

    Admin->>CMS: Clicks "Connect & Subscribe"
    CMS->>SaaS: Redirect to /connect?callback_url=CMS_Settings_URL
    SaaS->>Stripe: Presents Checkout (Starter / Growth)
    Stripe->>SaaS: Successful payment callback
    SaaS->>SaaS: Generates tenant_id & saas_api_key
    SaaS->>CMS: Redirect back with ?saas_api_key=...&tenant_id=...
    
    Note over CMS: useHandshake hook detects search params
    CMS->>CMS: window.history.replaceState() [Synchronous scrub]
    CMS->>CMS: PATCH /api/globals/notification-settings [Update DB]
    CMS->>CMS: Re-fetch settings → render Connected View
```

### Key Security Design:
- **Synchronous URL Purge:** The `useHandshake` hook executes `window.history.replaceState` synchronously immediately upon detecting the search params. This removes sensitive API keys from the URL *before* starting the asynchronous REST fetch saving the keys to the database, protecting the key from trailing history or referer header leakage.

---

## 4. Frontend Client Architecture (Phase 4)

The consumer app's frontend communicates with the WebSockets layer through hooks exported from `payload-plugin-realtime-notifications/react`.

```mermaid
graph TD
    Provider["NotificationProvider"] -->|"Context"| Context["NotificationContext"]
    Context -->|"Shared Client & State"| hook1["useNotifications"]
    Context -->|"Shared Connection Status"| hook2["useConnectionStatus"]
    
    hook1 -->|"Subscribe Channel"| Channel["Pusher Channel"]
    Channel -->|"bind_global"| Messages["State Array: NotificationMessage[]"]
    
    style Provider fill:#1a365d,color:#fff
    style Context fill:#2c5282,color:#fff
    style hook1 fill:#2b6cb0,color:#fff
    style hook2 fill:#2b6cb0,color:#fff
```

### Decoupled Import Isolation:
To guarantee that the frontend bundles contain zero Payload server dependencies (e.g. database tools, admin UI modules), the React client hooks are exported via a clean, package-level export subpath:

```json
"exports": {
  "./react": {
    "import": "./dist/exports/react.js",
    "types": "./dist/exports/react.d.ts",
    "default": "./dist/exports/react.js"
  }
}
```
This forces compilation loaders to only tree-shake and bundle `react` and `pusher-js` client code.

---

## 5. Real-Time SDK & Developer Experience Extensions

To enable rapid building of collaborative real-time apps, the plugin includes advanced client-side utilities and server-side tracking:

```mermaid
graph TD
    subgraph Client ["Client Library (/react)"]
        H1["useNotifications"] -->|"General events"| WS["WebSocket Connection"]
        H2["usePresence"] -->|"Online user state"| WS
        H3["useTypingIndicator"] -->|"Low-latency client-typing"| WS
        C1["LiveIndicator"] -->|"Visual network health"| WS
    end

    subgraph Server ["Payload Server"]
        WH["Webhook API /soketi/webhooks"] -->|"HMAC-SHA256 Signed Event"| WH
        WH -->|"Persist log"| DB[("RealtimeLogs Collection (Read-Only DB)")]
        AT["AdminLiveToast"] -->|"Admin view background listener"| WS
    end
```

### Key Extended Components:
1. **`usePresence(channelName)`**: Subscribes to a Pusher Presence Channel (prefixed with `presence-`). It monitors `pusher:subscription_succeeded`, `pusher:member_added`, and `pusher:member_removed` events, maintaining a synchronized dictionary of active user IDs and metadata in React state.
2. **`useTypingIndicator(channel, localIdentifier)`**: Emits `client-typing` events directly through the WebSocket client to bypass database writes. It automatically throttles outgoing broadcasts (maximum 1 per second) and cleans up stale indicators via a 1.5s interval sweep.
3. **`RealtimeLogs` Collection**: A read-only Payload database collection that acts as a secure, permanent audit log of all channel traffic, occupied status, and client disconnects received from the verified webhook API.
4. **`LiveIndicator` & `AdminLiveToast`**: Instant UI helpers. `LiveIndicator` binds to connection state changes to render a glowing status dot. `AdminLiveToast` plugs into the Payload Admin UI sidebar to alert logged-in users of high-priority system alerts in real-time.

