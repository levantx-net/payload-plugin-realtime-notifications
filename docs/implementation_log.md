# Implementation Log & Code Analysis

This document provides a technical walkthrough of the code written during the implementation of the `payload-plugin-realtime-notifications` plugin. It outlines design decisions, security configurations, and key API designs.

---

## 1. Plan vs. Execution Review

Our actual implementation maps directly to the master roadmap defined in `plan.md`, with architectural refinements made to increase flexibility and maintainability:

| Goal (from `plan.md`) | Implementation Strategy | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Phase 1: Scaffolding & Global** | Created `NotificationSettings` global config and stateless `dispatchEvent`. | **Completed** | Wrapped fetch inside strict `try/catch` using the `void` promise operator. |
| **Phase 2: Custom Admin Dashboard** | React dashboard containing Loading, Connected, and Disconnected sub-views. | **Completed** | Embedded usage statistics and integrated redirect pathways for Stripe Portal and OAuth. |
| **Phase 3: Integration (Generic)** | Reframed integration hooks from being product-specific to generic factories. | **Completed** | Created `createAfterChangeHook` and `createAfterDeleteHook` supporting transforms and event filters. |
| **Phase 4: Client Hooks** | Decoupled `/react` endpoint with Context Providers and custom subscription hooks. | **Completed** | Added connection tracking for client polling fallbacks. Handled runtime NodeNext types wrapper issue. |

---

## 2. Key Code Deep-Dives

### 2.1 The Zero-Blocking Dispatcher (`dispatchEvent.ts`)

To protect CMS content-management database cycles, `dispatchEvent` detaches promise resolution from the server context:

```typescript
// void keyword detaches the async task from the call context
void (async () => {
  try {
    const res = await fetch(target.url, {
      method: 'POST',
      headers: target.headers,
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.warn(`[notifications] Event dispatch failed: ${res.status}`)
    }
  } catch (err) {
    // Swallow any offline network failures silently
  }
})()
```
*Rationale:* If `fetch` is awaited directly inside database hooks, any network latency (e.g., DNS timeouts, offline gateways) would cause Payload's API responses to lag or timeout, breaking editorial work.

### 2.2 Synchronous URL Key Stripping (`useHandshake.ts`)

A potential exploit vector in OAuth flows is exposing secrets via browser history or referer headers. The custom hook purges URL parameters immediately:

```typescript
const key = params.get('saas_api_key')
const tenant = params.get('tenant_id')

if (key && tenant) {
  // 1. Scrub browser URL bar IMMEDIATELY (synchronously)
  const cleanUrl = window.location.pathname + window.location.hash
  window.history.replaceState({}, document.title, cleanUrl)

  // 2. Perform background REST call to save to database
  saveCredentials(key, tenant)
}
```
*Rationale:* By purging URL params synchronously *before* triggering the async network write (`saveCredentials`), we guarantee that even if the network call fails or lags, the keys are already eradicated from the browser screen and address bar history.

### 2.3 Safe Transforms and Conditions in Hook Factories

Hook factories isolate custom user logic:

```typescript
try {
  const shouldDispatch = config.condition({ doc: docData, operation, collection })
  if (!shouldDispatch) return doc
} catch {
  // If the user's condition logic fails, safe fallback is to skip dispatch
  return doc
}
```
*Rationale:* Wrapping both `condition()` and `transform()` in dedicated `try/catch` blocks blocks errors in user logic from bubbling up and crashing the entire database write pipeline.

---

## 3. Best Practices Applied

1. **Next.js 16+ & React 19 Compatibility:**
   - Used the new `use()` hook (`use(NotificationContext)`) instead of legacy `useContext()`.
   - Used the new React 19 Context notation `<NotificationContext>` instead of `<NotificationContext.Provider>`.
   - Implemented `'use client'` pragmas to ensure Next.js App Router boundary safety.
2. **ESM / NodeNext Resolution Safety:**
   - `pusher-js` has varying ESM default export structures depending on runtime bundlers. We resolved this safely at runtime:
     ```typescript
     const PusherConstructor = (
       'default' in PusherModule ? (PusherModule as any).default : PusherModule
     ) as new (key: string, opts: any) => PusherClient
     ```
3. **Responsive CSS Modules styling:**
   - Styles are fully encapsulated. No Tailwind config modifications are required on the host project.
   - Leveraged CSS variables like `var(--theme-success-500)` to ensure dark and light themes match Payload CMS defaults automatically.
