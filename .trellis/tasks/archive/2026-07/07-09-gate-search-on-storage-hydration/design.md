# Technical Design: Gate Search on Storage Hydration

## 1. Scope

This child task introduces one storage-readiness and onboarding-admission contract shared by SearchEngineCore, SearchProviderRegistry, and CoreBox. It does not change onboarding UI, search sessions, SQLite/FTS ownership, or real-profile data.

## 2. Current Failure Modes

- `BaseModule.init()` sets `filePath` before `StorageModule.onInit()` finishes, so `Boolean(storageModule.filePath)` can report ready while migrations or warmup are still pending or have failed.
- `SearchProviderRegistry.hasCompletedOnboarding()` currently returns `true` when the app-setting read throws.
- `CoreBoxModule` and `CoreBoxManager` independently catch app-setting failures and continue opening CoreBox.
- Provider loading starts file/app provider work, then `onProvidersReady` starts maintenance. Those transitions must occur only after an allowed gate decision.

## 3. Storage Readiness Contract

`StorageModule` owns a stable state machine:

```ts
type StorageReadiness =
  | { state: "pending" }
  | { state: "ready" }
  | { state: "failed"; reason: "storage-init-failed"; recoverable: false };
```

Rules:

- State starts as `pending` before module initialization.
- `ready` is published only after startup migrations and app-setting warmup complete.
- Any initialization exception publishes terminal `failed` before the exception is rethrown to ModuleManager.
- `waitUntilReady()` returns one shared promise for the current initialization attempt and resolves with `ready` or `failed`; callers do not catch readiness exceptions.
- `subscribeReadiness()` immediately returns the current snapshot, then reports state transitions.
- `isMainStorageReady()` derives from the explicit state, never from `filePath`.
- Snapshots contain only state, stable reason, and recovery capability; no setting values or paths.

## 4. Onboarding Gate

A single `OnboardingGate` evaluates admission after storage readiness:

```ts
type OnboardingDecision =
  | { state: "allowed" }
  | { state: "blocked"; reason: "onboarding-incomplete"; recoverable: true }
  | {
      state: "degraded";
      reason:
        | "storage-pending"
        | "storage-init-failed"
        | "onboarding-read-failed";
      recoverable: boolean;
    };
```

Rules:

- `evaluate()` is synchronous and fail-closed for UI/search entrypoints.
- `waitForDecision()` awaits the storage terminal state, then evaluates onboarding.
- A storage failure maps to `degraded/storage-init-failed` and remains terminal for the current module lifecycle.
- An app-setting read failure maps to recoverable `degraded/onboarding-read-failed`; `retry()` re-evaluates without fabricating settings.
- `subscribe()` follows storage readiness and app-setting updates. It emits only distinct decisions and never exposes setting contents.

## 5. Consumer Flow

### Search provider startup

`SearchProviderRegistry` delegates onboarding decisions to the shared gate:

1. `ALL_MODULES_LOADED` calls `loadWhenAllowed()`.
2. `allowed` calls existing single-flight `ensureLoaded()`.
3. `blocked` or `degraded` installs one gate subscription.
4. The first later `allowed` decision clears the subscription and calls `ensureLoaded()`.
5. Existing `providerLoadPromise`, `providersLoaded`, and `startupServicesStarted` guards prevent duplicate provider and maintenance starts.

Provider registration and IndexedSource descriptor registration may happen before admission; provider `onLoad`, scans, startup backfill, and search maintenance may not.

### Search execution

`SearchEngineCore.search()` checks the shared gate before cache lookup, recommendation generation, or provider aggregation. A non-allowed decision fails closed with a typed low-sensitivity admission error.

### CoreBox activation

`CoreBoxManager.trigger(true)` and `CoreBoxManager.search()` use the same decision. Blocked/degraded activation shows and focuses the existing main window rather than opening CoreBox. The shortcut path may continue emitting the existing beginner shortcut event for the blocked state, but no path catches a readiness error and opens CoreBox.

## 6. Recovery and Exactly-Once Behavior

- App-setting updates or an explicit gate retry can transition `blocked/degraded` to `allowed`.
- Gate subscriptions are single-instance and cleared after allowance.
- Provider loading remains single-flight in `SearchProviderRegistry`.
- Runtime maintenance remains guarded by `SearchEngineCore.startRuntimeServicesOnce()`.
- Destroy clears gate subscriptions before provider/runtime cleanup.

## 7. Compatibility and Rollback

- Existing app-setting shape and `beginner.init` semantics remain unchanged.
- Existing onboarding/main-window UI is reused; no renderer transport schema is added.
- No database schema, migration, scan-progress, FTS, or real-profile operation is introduced.
- Rollback may change UI presentation or retry timing, but must retain explicit readiness and fail-closed admission.

## 8. Verification

- Existing storage init/warmup focused test.
- Existing SearchEngineCore contracts, regression baseline, gather ordering, and provider-registry tests.
- Existing CoreBox module/manager tests.
- CoreApp Node typecheck.
- A direct smoke scenario covering pending, ready/incomplete, ready/complete, recoverable read failure, terminal storage failure, and repeated allowance.
