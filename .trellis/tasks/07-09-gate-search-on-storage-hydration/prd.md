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

- Search fabricates `{ beginner: { init: true } }` after a storage read failure
  at `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:450`.
- CoreBox shortcut handling catches the same readiness problem independently at
  `apps/core-app/src/main/modules/box-tool/core-box/index.ts:84`.
- Storage readiness is exposed only as a boolean or thrown error at
  `apps/core-app/src/main/modules/storage/index.ts:784`.

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

## Acceptance Criteria

- [ ] Pending storage cannot start indexing/providers or open CoreBox search.
- [ ] Ready storage with incomplete onboarding remains blocked.
- [ ] Ready storage with completed onboarding starts services once.
- [ ] Recoverable failure exposes degraded state and retry; successful retry
  re-evaluates onboarding without duplicate services.
- [ ] Terminal failure remains fail closed with a visible diagnostic reason.
- [ ] SearchCore and CoreBox no longer contain independent fail-open catches.
- [ ] Storage, CoreBox startup, first-run, and repeated-init tests pass.

## Out of Scope

- Redesigning onboarding UI beyond routing to an existing recovery/onboarding
  surface.
- General storage persistence refactors unrelated to readiness.
- Search session or FTS writer ownership.
