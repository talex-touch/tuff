# Implementation Plan: Gate Search on Storage Hydration

## 1. Storage readiness

- Add the explicit pending/ready/failed readiness state to `StorageModule`.
- Publish ready only after startup migration and app-setting warmup.
- Publish terminal failure before rethrowing initialization errors.
- Add snapshot, single-flight wait, and subscription APIs; derive `isMainStorageReady()` from the state.

## 2. Shared onboarding gate

- Add the allowed/blocked/degraded decision contract with stable reason codes.
- Evaluate app settings only after storage is ready.
- Add wait, retry, and distinct-decision subscription behavior without returning raw settings.

## 3. Search startup and execution

- Replace `SearchProviderRegistry` fail-open onboarding reads with the shared gate.
- Gate provider `onLoad`, consent-sensitive source startup, and maintenance until allowed.
- Preserve the existing single-flight provider load and runtime-service guards.
- Gate `SearchEngineCore.search()` before cache, recommendation, or provider execution.
- Clear gate subscriptions during destroy.

## 4. CoreBox entrypoints

- Replace shortcut and manager fail-open catches with the shared gate.
- Route blocked/degraded activation to the existing main/onboarding surface.
- Prevent AI quick-call follow-up when CoreBox activation is denied.
- Gate direct CoreBox search calls as defense in depth.

## 5. Validation

Run the smallest existing focused set covering the changed surfaces:

```bash
corepack pnpm -C "apps/core-app" exec vitest run \
  "src/main/modules/storage/index.test.ts" \
  "src/main/modules/box-tool/search-engine/search-provider-registry.test.ts" \
  "src/main/modules/box-tool/search-engine/search-core.contracts.test.ts" \
  "src/main/modules/box-tool/search-engine/search-core.regression-baseline.test.ts" \
  "src/main/modules/box-tool/core-box/manager.test.ts" \
  "src/main/modules/box-tool/core-box/index.test.ts"
corepack pnpm -C "apps/core-app" run typecheck:node
```

Then run a direct state-machine smoke covering pending, blocked, allowed, recoverable degraded, terminal degraded, and repeated allowed transitions.

## Risks and Rollback Points

- Existing explicit Vitest mocks of `../../storage` may need new gate/readiness exports added without changing their behavioral assertions.
- Do not start provider work from a storage callback before `ALL_MODULES_LOADED`; the registry owns that transition.
- Do not add retry timers. Recovery is event- or caller-driven, avoiding unbounded startup loops.
- Do not change onboarding settings, renderer schemas, database schema, or profile data.
