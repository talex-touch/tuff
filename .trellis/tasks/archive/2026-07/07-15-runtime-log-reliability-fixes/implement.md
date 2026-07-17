# Implementation plan

## Order

1. Complete `07-15-storage-persistence-integrity` and prove namespaced persistence plus invalid-key rejection.
2. Complete `07-15-clipboard-main-loop-stalls` and exercise unchanged, image, file, and text clipboard paths.
3. Complete `07-15-intelligence-config-idempotency` and prove repeat-load idempotency.
4. Complete `07-15-download-scheduling-reliability` and exercise terminal HTTP status plus burst concurrency.
5. Complete `07-15-runtime-process-lifecycles` and exercise planned/crash shutdown paths.
6. Complete `07-15-runtime-log-signal-quality` and confirm one terminal record per event.
7. Run one clean CoreApp development smoke session, exercise all changed paths, and scan new logs for every audited signature.

## Integration Gates

- No child may weaken path containment, transport typing, plugin permission boundaries, or process isolation.
- Storage is complete only after restart/reload evidence, not after a save response.
- Performance is complete only after exercising the real clipboard path.
- Lifecycle work is complete only after observing process/controller termination.
- Logging work is complete only after inspecting terminal and persistent files from a fresh run.

## Validation Commands

Use the smallest existing package checks covering each changed module, followed by CoreApp type checking/build validation. Final proof is a clean development launch and targeted interaction, not source inspection alone.
