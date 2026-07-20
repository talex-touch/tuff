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
export const usePluginStore = defineStore("plugin", () => {
  const plugins = reactive(new Map<string, ITouchPlugin>());

  function handleStateEvent(event: PluginStateEvent): void {
    switch (event.type) {
      case "added":
        setPlugin(event.plugin);
        break;
      case "removed":
        deletePlugin(event.name);
        break;
    }
  }

  return { plugins, handleStateEvent, initialize };
});
```

This is a good pattern for host-subscribed renderer state: typed event in, normalized store state out.

### Host And Durable State

Do not make renderer state the source of truth for host data.

- CoreApp local business SoT is SQLite where the domain already uses SQLite.
- Renderer stores mirror and display host state; they do not replace the owning module.
- Plugin secrets belong in secure plugin secret capability / secure-store facade, not ordinary UI state or localStorage.
- JSON is acceptable for plugin config, sync payloads, catalog downloads, and evidence artifacts, but not as a replacement business SoT.

### CoreApp Cloud Sync Feedback Control

- `APP_SETTING` participates in cloud sync, but its `sync` subtree also stores local runtime metadata (`status`, cursors, queue depth, timestamps, failure counters, and operation sequence). Runtime metadata writes must not mark `APP_SETTING` dirty or schedule another push.
- Allocate `op_seq` values in memory for one push batch and persist only the final sequence before sending. Never persist the whole app setting once per sync item.
- Full snapshot push is limited to first bootstrap (`cursor <= 0`) and an explicit user-triggered sync. Startup with an established cursor, focus recovery, and online recovery push only dirty storage.
- Renderer online/status recovery owns deduplication for one network transition. The main sync module must not register a second independent online recovery trigger for the same lifecycle event.

### CoreApp Auth Credential Persistence

#### 1. Scope / Trigger

- Trigger: CoreApp account settings change login credential protection (`appSetting.auth.useSecureStorage`) or auth token persistence.
- The setting controls local credential encryption strength, not whether the app preserves signed-in state.

#### 2. Signatures

```ts
type AuthSettings = {
  useSecureStorage: boolean;
  secureStorageUserOverridden: boolean;
  secureStorageUnavailable: boolean;
};

async function loadAuthToken(): Promise<void>;
async function setAuthToken(nextToken: string): Promise<void>;
async function clearAuthToken(): Promise<void>;
async function handleAuthStoragePreferenceChanged(
  nextAppSetting: AppSetting,
): Promise<void>;
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
  authToken = null;
  return;
}
```

##### Correct

```ts
authUseSecureStorage = isAuthTokenSecureStorageEnabled();
authToken = await getSecureValue(AUTH_TOKEN_KEY);
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
pendingQueryContext = context;
searchVal.value = value;
void handleSearchImmediate({ force: true });
// watcher dispatches another contextless search; execute trusts whichever result wins
```

#### Correct

```ts
programmaticQueryValue = value;
oneShotQueryContext = context;
searchVal.value = value;
void handleSearchImmediate({ force: true });

// Immediately before item.execute:
serializedSearchResult.query.context = oneShotQueryContext;
oneShotQueryContext = undefined;
```

## Scenario: CoreApp Storage Hydration and Onboarding Admission

### 1. Scope / Trigger

- Trigger: changing `StorageModule` initialization, onboarding completion reads,
  CoreBox activation, search-provider startup, or indexing maintenance startup.
- `BaseModule.init()` assigns `filePath` before `StorageModule.onInit()` settles;
  therefore path presence is never a readiness signal.

### 2. Signatures

```ts
type StorageReadiness =
  | { state: 'pending' }
  | { state: 'ready' }
  | { state: 'failed'; reason: 'storage-init-failed'; recoverable: false }

type OnboardingGateDecision =
  | { state: 'allowed' }
  | { state: 'blocked'; reason: 'onboarding-incomplete'; recoverable: true }
  | {
      state: 'degraded'
      reason: 'storage-pending' | 'storage-init-failed' | 'onboarding-read-failed'
      recoverable: boolean
    }

StorageModule.getReadiness(): StorageReadiness
StorageModule.waitUntilReady(): Promise<StorageReadiness>
OnboardingGate.evaluate(): OnboardingGateDecision
OnboardingGate.waitForDecision(): Promise<OnboardingGateDecision>
OnboardingGate.retry(): Promise<OnboardingGateDecision>
```

### 3. Contracts

- Storage starts `pending`; it becomes `ready` only after startup migrations and
  app-setting warmup complete.
- Initialization failure publishes terminal `storage-init-failed` before the
  exception returns to `ModuleManager`; consumers receive a decision, not a
  fabricated configuration object.
- `waitUntilReady()` is single-flight for one initialization attempt and resolves
  to `ready` or `failed` without requiring a catch.
- `OnboardingGate` reads `beginner.init` only after storage is ready. Unknown,
  pending, failed, and read-error states are never equivalent to consent.
- Provider `onLoad`, consent-sensitive scans, indexing maintenance, CoreBox
  visibility, and direct CoreBox search require `allowed`.
- Gate subscriptions and the existing provider/runtime start guards enforce
  exactly-once recovery. No retry timer or unbounded startup loop is allowed.
- Diagnostics expose only state, stable reason, and recoverability; never raw
  settings, paths, or secret-bearing values.

### 4. Validation & Error Matrix

- Storage pending -> `degraded/storage-pending`, recoverable, no provider/search start.
- Storage initialization failed -> `degraded/storage-init-failed`, terminal and fail closed.
- Storage ready + `beginner.init !== true` -> `blocked/onboarding-incomplete`.
- App-setting read throws -> `degraded/onboarding-read-failed`; explicit retry or
  a settings update may re-evaluate.
- App-setting read succeeds with `beginner.init === true` -> `allowed`; provider
  and maintenance startup occur once.
- Repeated `allowed` notifications -> no duplicate provider load, scan, or maintenance start.

### 5. Good / Base / Bad Cases

- Good: storage settles, onboarding completes, one gate transition starts providers
  and maintenance once.
- Base: onboarding is incomplete, so CoreBox stays closed and the existing main
  onboarding surface is focused.
- Bad: catching `getMainConfig()` and returning `true`, or checking `filePath` and
  treating a failed/pending storage module as ready.

### 6. Tests Required

- Storage readiness: pending state, single-flight wait identity, ready transition,
  terminal failure, and destroy/reload reset.
- Gate matrix: pending, incomplete, complete, recoverable read failure + retry,
  terminal failure, and distinct decision subscriptions.
- Search/CoreBox: provider startup and maintenance remain zero before allowance;
  repeated allowance starts once; direct search and shortcut activation fail closed.
- CoreApp Node typecheck and the nearest storage, SearchEngineCore,
  SearchProviderRegistry, CoreBox manager, and CoreBox module focused tests.

### 7. Wrong vs Correct

#### Wrong

```ts
try {
  return getMainConfig(StorageList.APP_SETTING).beginner.init;
} catch {
  return true;
}
```

#### Correct

```ts
const decision = onboardingGate.evaluate();
if (decision.state !== "allowed") {
  routeToExistingOnboardingOrRecoverySurface(decision.reason);
  return;
}

await providerRegistry.loadWhenOnboardingAllows("all-modules-loaded");
```

## Scenario: CoreApp Application Configuration SQLite Source of Truth

### 1. Scope / Trigger

- Trigger: changing `StorageModule`, `StorageEvents.app`, application Settings persistence, startup app-setting reads, legacy config migration, or configuration rollback.
- This contract applies to application configuration under `modules/config`; plugin storage, secure storage, renderer override state, and business-domain tables remain separate owners.

### 2. Signatures

```ts
type AppConfigBackend = 'sqlite' | 'legacy'

interface AppConfigRecord {
  key: string
  data: object
  serialized: string
  revision: number
  deleted: boolean
  updatedAt: number
}

ApplicationConfigRepository.initialize(): Promise<{
  backend: AppConfigBackend
  records: AppConfigRecord[]
  fallbackReason?: 'sqlite-initialization-failed'
}>

ApplicationConfigRepository.persist(input: {
  key: string
  serialized: string
  revision: number
  deleted: boolean
}): Promise<void>
```

SQLite tables:

- `app_config_entries(key, value, revision, deleted, updated_at)`
- `app_config_migration_state(id, phase, backup_path, imported_count, skipped_count, failed_count, completed_at, updated_at)`

Environment controls:

- `TALEX_CONFIG_STORAGE_BACKEND=sqlite|legacy`; invalid or absent values select SQLite.
- `TALEX_CONFIG_LEGACY_MIRROR=0|1`; SQLite mode defaults to mirror enabled during the rollback window.

### 3. Contracts

- Main-process `StorageModule` is the only application-config writer. Renderer callers keep using typed `StorageEvents.app`; plugin storage never writes these tables.
- SQLite mode hydrates all rows before Storage readiness becomes `ready`. `getConfig()` remains synchronous and cache versions start from persisted `revision`.
- First migration creates an immutable `legacy-backups/app-config-v1` copy, excludes `plugins`, `startup-migrations`, backup directories, hidden files, and mirror `.tmp` files, then imports missing keys transactionally. Existing SQLite rows and tombstones always win.
- Saves retain the existing synchronous cache-mutation contract. Polling and `persistMainConfig()` serialize repository writes; a completed old revision must not clear a newer dirty cache revision.
- Delete persists a tombstone before removing the legacy mirror. A tombstone returns `{}` and must never fall back to an old file.
- SQLite commit precedes the best-effort legacy mirror. Mirror failure is observable but never rolls back SQLite.
- Explicit legacy mode reads and writes files only and must not mutate SQLite. Returning to SQLite mode keeps SQLite authoritative; legacy changes are not silently promoted.
- Startup silent-launch/window-bounds preflight reads SQLite through a short-lived client and closes it in `finally`. Missing database/table/row may fall back to legacy; a deleted row resolves to an empty SQLite value, not legacy resurrection.
- Logs expose stable backend/migration/fallback state and counts, never configuration values or raw error/path content.

### 4. Validation & Error Matrix

- SQLite schema/table missing during preflight -> close client, use legacy bootstrap snapshot, let DatabaseModule run migrations.
- SQLite migration or hydration failure -> select legacy for that process with reason `sqlite-initialization-failed`; never mix SQLite and file reads.
- Malformed/unreadable legacy file -> preserve source and immutable backup, mark migration failed, enter legacy fallback, retry migration on a later startup.
- Existing SQLite key or tombstone + stale legacy file -> skip import; SQLite wins.
- Persisted revision lower than current row -> reject the stale upsert and do not update memory or mirror.
- Cache revision advances while an older persist is in flight -> keep the key dirty until the current revision persists.
- SQLite write failure -> leave cache dirty for polling retry/quarantine; do not claim file fallback as SQLite success.
- Mirror write failure -> SQLite remains committed; emit stable mirror-failure diagnostics.
- Explicit legacy mode -> no import, upsert, tombstone, or migration-state write in SQLite.

### 5. Good / Base / Bad Cases

- Good: first upgraded launch reads legacy bootstrap settings, migrates two valid config files transactionally, creates backup, and the next launch restores silent mode and versions from SQLite.
- Base: a Settings save updates the synchronous cache, persists revision $n+1$, mirrors the file, broadcasts one typed update, and survives restart.
- Bad: reading `app-setting.ini` directly inside `TouchApp`, allowing file fallback after a SQLite tombstone, clearing dirty state after only revision $n$ persisted while cache is at $n+1$, or writing SQLite from renderer/plugin code.

### 6. Tests Required

- Full Drizzle migration plus schema constraints for non-negative revisions/counts, boolean tombstones, and migration phases.
- Legacy migration: nested valid files, exclusions, immutable backup, idempotent restart, existing-row precedence, malformed-file fallback, and no partial transaction.
- Runtime persistence: revision restart, stale-write rejection, mirror on/off, tombstone restart/no resurrection, and explicit legacy mode leaving SQLite byte-for-byte unchanged.
- Polling race: an in-flight old revision cannot clear a newer dirty revision; the matching revision can.
- Startup preflight: database missing, table/row missing, SQLite value, tombstone, explicit rollback, query failure, and post-preflight database reopen/write.
- Focused Storage transport/conflict, Settings state, startup/tray, onboarding admission, scoped lint/type diagnostics, Electron build, normal startup, and silent startup checks.

### 7. Wrong vs Correct

#### Wrong

```ts
// File and SQLite compete as runtime sources; delete can resurrect on restart.
const value = sqliteRow ?? readJsonSync(legacyPath)
await sqlite.upsert(value)
cache.clearDirty(key)
```

#### Correct

```ts
const initialized = await repository.initialize()
hydrateCache(initialized.records)

const persistedRevision = await persistCacheSnapshot(key)
if (cache.getVersion(key) === persistedRevision) {
  cache.clearDirty(key)
}
```
