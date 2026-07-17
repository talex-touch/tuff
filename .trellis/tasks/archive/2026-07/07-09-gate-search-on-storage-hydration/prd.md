# Gate Search on Storage Hydration

## Goal

Create one explicit storage/onboarding readiness contract and fail closed while
consent-sensitive state is pending or failed. CoreBox visibility, provider
startup, and automatic indexing must never infer completed onboarding from a
storage read error.

## Parent and Dependency

- Parent: `07-09-audit-search-system-architecture`.
- Priority: P1.
- Explicit prerequisite: none.
- Downstream dependency: production enablement of
  `07-09-establish-single-search-index-writer` waits for this gate.

## Background

- Before this task, `SearchProviderRegistry.hasCompletedOnboarding()` and both
  CoreBox activation entrypoints interpreted an app-setting read exception as
  permission to continue.
- `BaseModule.init()` assigns `filePath` before `StorageModule.onInit()` settles,
  so the former `Boolean(storageModule.filePath)` readiness check could report
  ready while migrations/warmup were pending or after initialization failure.

## Requirements

- `StorageModule` exposes a single-flight readiness result with `pending`,
  `ready`, and `failed` states plus a wait primitive.
- A failed state includes a stable reason and whether retry/recovery is possible;
  it does not fabricate configuration data.
- An `OnboardingGate` reads app settings only after storage is ready and returns
  `allowed`, `blocked`, or `degraded` with a reason.
- Provider loading, consent-sensitive scans, indexing maintenance, and CoreBox
  search activation wait for `allowed`.
- CoreBox shortcut handling routes blocked/degraded users to onboarding or
  recovery UI rather than opening the search surface.
- Recovery may transition to allowed and start services exactly once.
- Readiness and gate diagnostics contain no sensitive setting values.
- Gate decisions use stable low-sensitivity reasons: `storage-pending`,
  `storage-init-failed`, `onboarding-incomplete`, and `onboarding-read-failed`.
- Storage initialization failure is terminal for the current module lifecycle;
  a transient app-setting read failure is recoverable by re-evaluating the gate.
- Blocked and degraded CoreBox activation reuses the existing main/onboarding
  surface; this slice does not introduce a second recovery UI.

## Acceptance Criteria

- [x] Pending storage cannot start indexing/providers or open CoreBox search.
- [x] Ready storage with incomplete onboarding remains blocked.
- [x] Ready storage with completed onboarding starts services once.
- [x] Recoverable failure exposes degraded state and retry; successful retry
      re-evaluates onboarding without duplicate services.
- [x] Terminal failure remains fail closed with a visible diagnostic reason.
- [x] SearchCore and CoreBox no longer contain independent fail-open catches.
- [x] Storage, CoreBox startup, first-run, and repeated-init tests pass.

## Out of Scope

- Redesigning onboarding UI beyond routing to an existing recovery/onboarding
  surface.
- General storage persistence refactors unrelated to readiness.
- Search session or FTS writer ownership.
