# Design: Runtime log and reliability remediation

## Architecture

The work is split by ownership boundary. Each child task owns its source contract and verification. The parent owns integration ordering and the final clean-run log audit.

1. Storage integrity fixes the renderer-storage/main-storage contract before any other task that persists configuration.
2. Clipboard and Intelligence fixes remove main-loop stalls and config churn that interact during OCR.
3. Download reliability makes error classification and capacity allocation deterministic.
4. Runtime lifecycle fixes plugin host, search stream, translation gating, and development process shutdown.
5. Log-signal fixes remove duplicated sinks and downgrade/rate-limit expected states.

## Shared Contracts

### Logical storage keys

Namespaced keys remain logical identifiers used by renderer storage and Sync. Disk resolution accepts only safe relative segments, verifies containment, and creates parents. Validation occurs before cache/version mutation. Invalid input is a terminal request failure, not a polling failure.

### Scheduling

A task is counted against capacity before asynchronous status persistence begins. Completion/failure releases exactly one reservation. Retry logic handles operation failures, not scheduler saturation.

### Process lifecycle

Every child process/controller has explicit `starting`, `running`, `stopping`, and `stopped` semantics where applicable. Planned termination must be distinguishable from crashes. Restart counters reset only after stable readiness.

### Logging

The custom logger owns terminal presentation. Log4js owns persistent files only. Transient expected states use debug/info plus rate limiting. Terminal failures and persistent error files each receive one logical event.

## Compatibility and Migration

- Keep logical keys `intelligence/prompt-library` and `division-box/preferences`; change only safe path resolution, preserving sync identity.
- Existing flat storage keys keep their current file paths.
- If any namespaced config already exists, load it in place; no alias or dual-write path.
- Existing download event payloads remain typed; only error type/retry behavior changes.
- Existing plugin-host isolation environment flag remains authoritative.

## Rollback

Each child task is independently revertible. Storage changes are first because later tasks may rely on persisted state. No data-destructive migration is allowed. If a clean smoke run reveals regression, revert the owning child change rather than adding a compatibility shim.
