# Implementation Plan — File Index Update and Error Redaction #476

## RED 1 — Writer Ownership

- [x] Add a real two-connection temporary-libSQL regression reproducing the old main `UPDATE files` busy error and lock-release recovery.
- [x] Add repository/worker/client/port tests for bounded metadata update, exact validation, missing IDs, rollback, and retry classification.
- [x] Add a FileProvider source contract proving metadata updates use `FilePersistencePort` and no main direct update.

## GREEN 1 — Worker-Owned Metadata Update

- [x] Add `FileMetadataUpdateRecord` and `updateFileMetadata` to repository, worker protocol/client, and `FilePersistencePort`.
- [x] Validate scalar strings, finite IDs/numbers/dates, duplicate IDs, nonnegative size, and bounded batch size before SQL.
- [x] Route FileProvider update chunks through the worker-owned port, preserving refresh/side-effect ordering.

## RED 2 — Public Boundary

- [x] Add exact DTO/projector tests for status, rebuild, failed-file summary, dashboard, and handler exceptions with SQL/params/path/stack canaries.
- [x] Add serialized main-to-renderer/settings SDK tests proving unknown/raw fields are rejected or projected.
- [x] Add renderer tests proving toast, status popover, logger, dashboard, and clipboard receive only localized copy/code/reportId/basename.

## GREEN 2 — Public Boundary

- [x] Replace raw File Index DTO fields with stable code/retryable/reportId projections.
- [x] Catch/project every File Index common-channel operation and File Index failures inside indexed-source diagnostics.
- [x] Remove the unused raw `file-index:failed` broadcast.
- [x] Remove renderer raw Error/payload logging and error/reason fallbacks; add zh/en report-ID copy.
- [x] Return failed-file basename/category only, without absolute path or raw lastError.
- [x] Project File Index dashboard entries/watch roots/scan rows/worker state to basename and stable code only.

## RED/GREEN 3 — Telemetry

- [x] Add main/renderer Sentry final-event canaries for SQL, params, POSIX/Windows paths, stack, cause, mechanism data, tags, contexts, spans, and logentry.
- [x] Add Nexus operational aggregate final-payload canary.
- [x] Harden sanitizers only where tests prove a residual field survives.

## VERIFY

- [x] Run writer/repository/FileProvider/transport/renderer/Sentry focused tests (`140/140`).
- [x] Run CoreApp node and web typecheck, package-scoped ESLint/Prettier, production build, and `git diff --check`.
- [x] Run a synthetic real-native-libSQL temporary DB smoke with a second-connection `BEGIN IMMEDIATE`; prove busy classification and recovery after release without touching a user profile.
- [x] Independent review found two P1 boundary leaks; both were fixed. Final source/canary gates show no known open P0/P1/P2. Targeted reviewer rerun was unavailable because the local Pi extension registry had duplicate tool names.

## Guardrails

- No real user database or filesystem mutation.
- No default search-split flag change.
- No AppProvider or full indexed-source diagnostics redesign.
- No raw error compatibility aliases at the File Index public boundary.
- No new dependency.
