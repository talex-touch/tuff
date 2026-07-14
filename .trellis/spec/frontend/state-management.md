# State Management

> How state is managed across CoreApp, Nexus, TuffEx, and plugin UI.

---

## Overview

Use the smallest state boundary that matches the data owner.

- Component-local state: `ref`, `reactive`, `computed`.
- Cross-view CoreApp renderer state: Pinia setup stores.
- Host/application state: typed SDKs, typed transport, existing modules, and SQLite-backed services.
- Nexus route/server state: Nuxt pages, composables, route helpers, and server API utilities.
- Plugin state: plugin SDKs and plugin storage/secret capabilities, not direct host access.

---

## State Categories

### Local UI State

Use local Vue state for transient UI behavior: dropdowns, loading flags, copy feedback, selected tabs, timers, and one-view form state.

Example: `TxFileUploader` keeps `inputRef` and `dropActive` local, derives `value` from `modelValue`, and emits updates instead of owning durable file state.

### Global Renderer State

Use Pinia when multiple CoreApp renderer views or subscriptions need the same state.

Example: `apps/core-app/src/renderer/src/stores/plugin.ts`

```ts
export const usePluginStore = defineStore('plugin', () => {
  const plugins = reactive(new Map<string, ITouchPlugin>())

  function handleStateEvent(event: PluginStateEvent): void {
    switch (event.type) {
      case 'added':
        setPlugin(event.plugin)
        break
      case 'removed':
        deletePlugin(event.name)
        break
    }
  }

  return { plugins, handleStateEvent, initialize }
})
```

This is a good pattern for host-subscribed renderer state: typed event in, normalized store state out.

### Host And Durable State

Do not make renderer state the source of truth for host data.

- CoreApp local business SoT is SQLite where the domain already uses SQLite.
- Renderer stores mirror and display host state; they do not replace the owning module.
- Plugin secrets belong in secure plugin secret capability / secure-store facade, not ordinary UI state or localStorage.
- JSON is acceptable for plugin config, sync payloads, catalog downloads, and evidence artifacts, but not as a replacement business SoT.

### CoreApp Auth Credential Persistence

#### 1. Scope / Trigger

- Trigger: CoreApp account settings change login credential protection (`appSetting.auth.useSecureStorage`) or auth token persistence.
- The setting controls local credential encryption strength, not whether the app preserves signed-in state.

#### 2. Signatures

```ts
type AuthSettings = {
  useSecureStorage: boolean
  secureStorageUserOverridden: boolean
  secureStorageUnavailable: boolean
}

async function loadAuthToken(): Promise<void>
async function setAuthToken(nextToken: string): Promise<void>
async function clearAuthToken(): Promise<void>
async function handleAuthStoragePreferenceChanged(nextAppSetting: AppSetting): Promise<void>
```

#### 3. Contracts

- `auth.token` is the persisted login token key in CoreApp secure-store.
- `useSecureStorage === false` means login credential protection is disabled, but `loadAuthToken()` still attempts to read persisted `auth.token`.
- Disabling credential protection with `handleAuthStoragePreferenceChanged()` must not write `auth.token = null`.
- `clearAuthToken()` is sign-out / unauthorized cleanup and must clear persisted `auth.token` even when credential protection is disabled.
- Account UI copy must describe stronger local credential protection only; it must not promise or deny restart persistence.

#### 4. Validation & Error Matrix

- Secure-store readable + token exists -> restore signed-in state from `auth.token`.
- Secure-store unavailable -> keep only in-memory auth state and surface degraded secure-store state when protection is enabled.
- User toggles credential protection off -> preserve in-memory and persisted token.
- User signs out or remote auth is unauthorized -> clear in-memory token and persisted `auth.token`.

#### 5. Good/Base/Bad Cases

- Good: disabled credential protection still restores `persisted-token` on cold startup.
- Base: enabled credential protection restores and persists the token through secure-store.
- Bad: treating `useSecureStorage === false` as session-only and skipping `getSecureStoreValue()`.

#### 6. Tests Required

- Main auth test: cold startup reads `auth.token` when `useSecureStorage === false` and `secureStorageUserOverridden === true`.
- Main auth test: disabling credential protection through `handleAuthStoragePreferenceChanged()` does not clear `auth.token`.
- Main auth test: `clearAuthToken()` clears `auth.token` even when protection is disabled.
- Renderer account settings test: credential protection copy is i18n-backed and does not contain restart/session-only persistence language.

#### 7. Wrong vs Correct

##### Wrong

```ts
if (!authUseSecureStorage) {
  authToken = null
  return
}
```

##### Correct

```ts
authUseSecureStorage = isAuthTokenSecureStorageEnabled()
authToken = await getSecureValue(AUTH_TOKEN_KEY)
```

### Nexus SSR And Client State

Avoid hydration mismatches.

- Do not read `window`, `document`, localStorage, random numbers, or current time during SSR-rendered output.
- Browser-only state belongs behind `import.meta.client`, `ClientOnly`, or a client-only component.
- Route-local i18n/chunk state should follow the existing route locale helpers.

---

## Derived State

- Use `computed` for derived UI state inside components and composables.
- Use pure helper functions for display contracts that are shared with tests or scripts.
- Avoid duplicating derived state in both a store and a component unless the store owns the derived contract.
- Normalize incoming SDK/transport payloads at the boundary before storing them.

---

## When To Use Global State

Promote state to Pinia or a shared domain module only when:

- Multiple views need the same state.
- The data is fed by an SDK subscription or typed transport event.
- The state represents a renderer-wide application concept such as plugin list/status.
- The owner already has a store/module for that domain.

Keep state local when it is only view form state, animation state, open/closed UI, or one-shot feedback.

---

## Common Mistakes

- Treating a renderer cache as durable SoT.
- Adding global state for one dialog or one page.
- Storing secrets, provider keys, prompt/response content, or raw paths in ordinary UI state that can leak into logs or sync payloads.
- Updating several local branches from raw `kind` / `action` fields instead of normalizing the payload once.
- Letting Nexus client-only state influence SSR markup before hydration.

## Scenario: CoreBox Trusted One-Shot Query Context

### 1. Scope / Trigger

- Apply when a host entrypoint such as Assistant injects a query into CoreBox and the selected result must execute under that entrypoint's context policy.
- The renderer owns only transient delivery state; session/history/package state remains host-owned.

### 2. Signatures

```ts
interface SetInputRequest {
  value: string
  context?: TuffContext
}

CoreBoxEvents.input.setQuery: SetInputRequest -> void
CoreBoxEvents.search.query: { query: TuffQuery } -> TuffSearchResult
CoreBoxEvents.item.execute: { item: TuffItem; searchResult?: TuffSearchResult } -> ActivationState
```

### 3. Contracts

- `setQuery` stores `context` as one-shot local state, marks the exact programmatic value, updates `searchVal`, and forces one search.
- The `searchVal` watcher must suppress the duplicate reactive search for that exact programmatic value. A user edit clears the one-shot context before searching.
- Before `item.execute`, bind the one-shot context to the serialized `searchResult.query.context`; if no one-shot context exists, delete any context returned by cache/backend so stale trust metadata cannot replay.
- Clear the one-shot context immediately after building the execute payload. Never persist it in Pinia, localStorage, plugin storage, logs, or SQLite.
- Host context execution validates the trusted entrypoint/actor pair; renderer state is delivery metadata, not authorization.

### 4. Validation & Error Matrix

- `setQuery.context` absent -> search and execute as normal CoreBox; strip cached query context.
- Exact programmatic `searchVal` watcher callback -> suppress only that reactive search; keep the forced search.
- User changes the value -> clear one-shot context, then run the normal search path.
- Backend/cache omits or returns stale `query.context` -> renderer overwrites/deletes it from current one-shot state before execute.
- Untrusted actor requests `owner='assistant'` -> host rejects with `CONTEXT_SESSION_OWNER_FORBIDDEN`.

### 5. Good / Base / Bad Cases

- Good: Assistant sends `owner='assistant'`, `scope='light'`, `isolated=true`; the chosen AI feature executes once with `new / light`.
- Base: a normal CoreBox query executes with no entrypoint context and cannot inherit a prior Assistant context.
- Bad: consuming context only in the first search request, allowing a duplicate/cached result to drop or replay it before item execution.

### 6. Tests Required

- Forced set-query regression: exactly one `CoreBoxEvents.search.query` send for the programmatic value.
- Execute regression: even when the mocked search result omits context, `CoreBoxEvents.item.execute.searchResult.query.context` matches the trusted one-shot entrypoint.
- Follow-up regression: a user-edited/contextless query has no prior entrypoint context.
- Packaged evidence: verify host session owner/scope and Provider call count, not raw interaction text.

### 7. Wrong vs Correct

#### Wrong

```ts
pendingQueryContext = context
searchVal.value = value
void handleSearchImmediate({ force: true })
// watcher dispatches another contextless search; execute trusts whichever result wins
```

#### Correct

```ts
programmaticQueryValue = value
oneShotQueryContext = context
searchVal.value = value
void handleSearchImmediate({ force: true })

// Immediately before item.execute:
serializedSearchResult.query.context = oneShotQueryContext
oneShotQueryContext = undefined
```
