# Design — File Index Update and Error Redaction #476

## Data Flow

```text
filesystem/reconcile record
  -> IndexedWriteUpdateExecutorService (bounded chunk)
  -> FilePersistencePort.updateFileMetadata
  -> SearchIndex worker serial queue
  -> SqliteFileIndexPersistenceRepository immediate transaction
  -> refresh rows
  -> side effects / IndexingRuntime

raw DB/worker Error
  -> main local logger + OperationalErrorService
  -> exact File Index public projection
  -> typed transport SDK decoder
  -> localized renderer message + reportId
```

Raw SQL, params, path, stack, and nested cause stop at the worker/main diagnostic boundary. The worker error serializer remains rich because main needs nested SQLite busy classification.

## Root-Cause Fix

Add a typed `FileMetadataUpdateRecord` and `updateFileMetadata(records)` operation across:

- `FileIndexPersistenceRepository`
- `SearchIndexWorkerClient` / worker protocol / worker handler
- `FilePersistencePort`
- `FileProvider` update executor

The repository validates exact scalar/finite values before SQL, then updates a bounded chunk by `files.id` inside one immediate worker transaction. Missing IDs are skipped, never resurrected by path upsert. FileProvider no longer executes metadata `UPDATE files` through its main-process connection.

Do not enable search split by default or migrate AppProvider writers in this task. External SQLite locks can still fail after retry; those failures must be classified and redacted.

## Public Failure Contract

File Index public surfaces use stable fields only:

```ts
interface FileIndexPublicFailure {
  errorCode: string
  retryable: boolean
  reportId?: string
}
```

- `FileIndexStatus` exposes stable status plus `errorCode/retryable/reportId`; raw `error/startupError` are removed.
- `FileIndexRebuildResult` keeps success, confirmation, battery, known reason, `errorCode/retryable/reportId`; raw `error/message` are removed.
- `FileIndexFailedFile` becomes a safe summary with `fileId`, basename/display name, stable `errorCode`, and timestamp; absolute `path` and `lastError` do not cross.
- The main common-channel handlers catch every File Index operation and return exact projected results. Provider internals may retain raw diagnostics locally.
- The unused `file-index:failed` raw broadcast is removed.
- Settings SDK applies runtime decoders/projectors so malformed unknown fields cannot reach renderer code as trusted DTOs.
- Renderer logging records only stable operation/code/reportId, never caught Error or transport payload. Failure copy comes from existing/new zh/en message keys.

Indexed-source and developer-dashboard diagnostics are not redesigned wholesale here. File Index failures entering those existing structures must be projected at their main-to-renderer handler boundary so raw exception text from this source cannot appear in task/evidence chips. Intentional user-selected path workflows remain out of scope; exception-derived paths do not.

## Telemetry

- Main local OperationalError logs retain the original Error/cause chain and report ID.
- Main and renderer Sentry `beforeSend` sanitizers remove request/breadcrumb/extra/module/server, transaction/spans/logentry, non-allowlisted tags/contexts, exception module/mechanism data, and every frame path/context/vars.
- Nexus operational aggregate remains stable classification only. Tests capture final sanitized payloads with SQL/params/POSIX+Windows path/stack/cause canaries.

## Error Classification

- nested SQLite busy/locked -> `FILE_INDEX_DATABASE_BUSY`, retryable `true`
- writer drain/admission timeout -> `FILE_INDEX_WRITER_DRAIN_TIMEOUT`, retryable `true`
- invalid metadata record -> `FILE_INDEX_METADATA_INVALID`, retryable `false`
- update/scan/rebuild unknown -> stable operation-specific generic code, retryable `false`
- transport handler failure -> `FILE_INDEX_<OPERATION>_FAILED`, no raw message

## Validation

- Real temporary libSQL file, two connections, WAL, synthetic rows only.
- Reproduce old Drizzle update under `BEGIN IMMEDIATE`; assert raw SQL/params exists only in captured local Error.
- Release lock and prove worker-owned update succeeds/idempotently refreshes row.
- Verify 11 records preserve bounded chunking and no main `db.update(files)` path.
- Exact serialized transport and renderer tests assert no `UPDATE files`, `params:`, synthetic POSIX/Windows absolute path, stack, or cause.
- Focused suites, CoreApp node/web typecheck, scoped lint, production build, isolated Electron smoke, `git diff --check`.

## Guardrails

- No real profile or user database.
- No raw SQLite/worker error in public DTO compatibility aliases.
- No increase in retry counts as the primary fix.
- No AppProvider/search-split/default flag refactor.
- No new dependency.
