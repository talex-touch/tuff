# Error Propagation Audit

## Scope

Independent read-only audit for task `07-30-fix-file-index-update-redaction-476`.
The audit traced database writes, file/search workers, indexing runtime state,
`FileProvider`, `AppProvider`, typed/raw transport, settings renderer surfaces,
local logging, and Sentry/Nexus delivery. No product code or spec was changed.

The target contract from `prd.md` is stricter than the current implementation:
only stable `errorCode`, safe/localized public message, `retryable`, and
`reportId` may cross to the renderer. SQL, params, absolute paths, stack, and
cause must remain in controlled main-process diagnostics.

## Verdict

The contract is not currently met. There are open P1/P2 propagation routes.
The operational-error service is a sound normalization primitive, but it is
applied only to selected rebuild/reset branches. Existing DTOs, runtime
diagnostics, raw broadcasts, and transport-level thrown-error handling still
allow raw diagnostics to cross into the renderer.

No confirmed route was found that places raw index SQL/path/stack content in a
Nexus upload after the current Nexus sanitizer. Sentry detail handling does
receive the original `Error` object before `beforeSend`; the current main and
renderer sanitizers replace exception values and strip stack-frame paths before
upload. This is defense at the final sink, not proof that the process-boundary
contract is safe. There is no end-to-end canary test for the index path.

## Findings

### P1: Public index contracts still admit raw diagnostics

- `FileIndexStatus.error/startupError`, `FileIndexRebuildResult.error/message`,
  and `FileIndexFailedFile.path/lastError` are public renderer DTOs
  (`packages/utils/transport/events/types/file-index.ts:44-50,89-109`).
- `IndexedSourceScanRuntimeResult.error` and aliased reset/reconcile/diagnostics
  results retain free-form error fields
  (`packages/utils/transport/events/types/indexed-source.ts:27-48`).
- Shared indexed-source diagnostics contain `health.lastError`, reconcile
  `deltaErrors`, reset `error`, task `errorMessage/error`, watch paths, and four
  last-task `error` fields
  (`packages/utils/search/indexing-source.ts:672-683,875-913,932-947,1094-1157`).
- `AppIndexDiagnoseResult` and `AppIndexReindexResult` retain free-form
  `reason/message/error` and absolute application paths
  (`packages/utils/transport/events/types/app-index.ts:89-188`).
- The settings SDK directly returns `transport.send(...)`; it performs no
  runtime projection or canary filtering
  (`packages/utils/transport/sdk/domains/settings.ts:160-216`).

Impact: type correctness does not imply privacy correctness. Any raw string
placed into one of these structures is cloned to renderer unchanged.

### P1: A raw failure broadcast explicitly crosses message and stack

`FileProvider` defines raw event `file-index:failed` with `{ error, stack,
timestamp }` and broadcasts `error.message` plus `error.stack`
(`apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:229-236,
1903-1919`). No current renderer listener was found, but the main-to-renderer
broadcast itself violates the boundary and remains available to future/raw
listeners.

### P1: Typed handler rejection serializes raw Error and stack

Typed transport does not safely normalize handler exceptions:

1. `TuffMainTransport.on` logs only the raw message and rethrows the original
   error (`packages/utils/transport/sdk/main-transport.ts:666-685`).
2. `ChannelCore` replies to an async rejection with the original `Error`
   (`apps/core-app/src/main/core/channel-core.ts:499-525`).
3. `structuredStrictStringify` serializes `Error` as `{ name, message, stack }`
   (`packages/utils/common/utils/index.ts:123-153`). It drops `cause`, but raw
   message/SQL/params/path and stack cross to renderer.
4. Renderer channel logs an error reply, includes a raw `replyPreview`, reports
   it back to main perf diagnostics, and then resolves with `res.data` instead
   of rejecting (`apps/core-app/src/renderer/src/modules/channel/channel-core.ts:
275-335`).
5. `TuffRendererTransport.send` therefore cannot wrap this remote failure; the
   domain SDK receives an object that does not satisfy its declared DTO.

Directly exposed index handlers that can throw include indexed-source scan and
reconcile, app diagnose/reindex, app managed-entry mutations/listing, file
status/stats/failed-files, and diagnostics (`apps/core-app/src/main/channel/
common.ts:1477-1517,1539-1618,1640-1686`). Only file rebuild has its own catch
projection (`common.ts:1491-1508`).

Impact: raw stack and Drizzle messages can cross even when a result DTO no
longer has an `error` field. Error replies also have incorrect success-path
runtime semantics.

### P1: File update failures populate raw public diagnostics

The metadata-update path is:

`FileProvider` incremental/reconcile work -> `IndexedWriteUpdateExecutorService`
-> `updateFileRecord()` -> Drizzle `UPDATE files`.

References:

- wiring: `file-provider.ts:647-699,787-792`
- executor propagation: `packages/utils/search/indexing-write-update-executor.ts:81-133`
- write: `file-provider.ts:3226-3253`

An incremental update failure is converted to `error.message` in a flush
snapshot (`file-provider.ts:2875-2918`; `packages/utils/search/
indexing-write-flush-snapshot.ts:179-207`), copied into evidence metadata
(`packages/utils/search/indexing-write-flush-evidence.ts:22-46`), returned by
indexed-source diagnostics, and exposed by settings UI.

A reconciliation/full-scan failure bubbles into `startIndexing`, which stores
the raw `Error`, logs it, broadcasts message/stack, and exposes the message in
status/health/progress (`file-provider.ts:1550-1580,1903-1955`;
`apps/core-app/src/main/modules/box-tool/search-engine/file-indexed-source.ts:
69-100,119-139`). The runtime also stores raw messages in scan/reconcile/watch
task state.

The search worker persistence path performs another `UPDATE files` while
persisting extracted content (`file-index-persistence-repository.ts:219-268`).
Its errors return through the structured search-worker boundary and may then be
stored in flush evidence or rejected upward.

### P1: Runtime diagnostics persist and replay raw messages and paths

- scan/reconcile/watch engines call `error.message`/`String(error)`
  (`indexing-scan-scheduler.ts:382-439`, `indexing-reconcile-scheduler.ts:
97-130`, `indexing-watch-router.ts:288-290`, `indexing-reconcile-engine.ts:
130-194`).
- runtime writes those strings and watch `event.path` into last-task/history
  state (`indexing-runtime.ts:589-602,636-652,1307-1333,1423-1448`).
- task-state builders duplicate errors into `error`, `errorMessage`, and
  `summary.errorMessage`; watch state also stores the absolute path
  (`packages/utils/search/indexing-source-task-state.ts:177-248,258-329,
339-475`).
- the persistence "sanitizer" validates shape/timestamps but clones strings and
  watch paths unchanged (`indexing-task-state-store.ts:241-333,389-435`).
- health catch fallback maps arbitrary `Error.message` directly to
  `health.lastError` (`packages/utils/search/indexing-source-error-health.ts:
16-32`).
- diagnostics handler returns snapshots unchanged (`common.ts:1511-1537`).

Reset failures are the partial exception: thrown reset work uses
`reportIndexedSourceResetFailure()` and returns safe operational fields
(`indexing-runtime.ts:864-899,1510-1544`). Precondition strings and any
source-provided `localResult.error` are still permitted.

### P1: Renderer logs and displays raw returned values

- `useFileIndexMonitor` logs caught transport errors and `result.error`
  (`useFileIndexMonitor.ts:26-32,52-57,83-102,120-133`). Renderer logger writes
  directly to `console` (`renderer-log.ts:5-31`).
- rebuild resolution deliberately falls back to raw `error`/`reason`
  (`index-rebuild-flow.ts:19-38`), and `SettingFileIndex` turns the result into
  a logged/displayed `Error` (`SettingFileIndex.vue:951-1020`).
- file status raw error is rendered verbatim in a `<pre>`
  (`SettingFileIndex.vue:1059-1086`).
- source actions wrap returned `error/reason`, log it, and interpolate it into
  a toast (`SettingFileIndex.vue:398-461`).
- source health/task/evidence display helpers interpolate `lastError`, task
  errors, and `metadata.error` (`indexing-source-diagnostics-display.ts:
548-657,708-724`; `SettingFileIndex.vue:1395-1537`).
- failed-files dialog displays and copies absolute path plus `lastError`
  (`components/FailedFilesListDialog.vue:40-47,85-112`).
- app index manager/diagnostic toasts use `result.reason || result.error`, and
  diagnostics JSON includes paths and query evidence
  (`SettingFileIndexAppIndexManager.vue:149-179,285-294,478`;
  `SettingFileIndexAppDiagnostic.vue:187-194,253-273,494-506`).
- `FileIndexFailDialog` can render arbitrary `errorDetail` but no current caller
  was found (`components/file-index/FileIndexFailDialog.vue:6-9,65-68`).

### P1: Developer dashboard is a separate raw transport bypass

`tuff:dashboard` is a raw event. Main returns raw build errors, watched paths,
scan paths, persisted `lastError`, and worker task/errors
(`apps/core-app/src/main/modules/system/tuff-dashboard.ts:26-33,56-78,
216-247,451-483`). `LingPan` declares the same raw event and displays response
errors, worker errors, watched paths, index-entry paths, and entry errors
(`apps/core-app/src/renderer/src/views/base/LingPan.vue:177-187,325-360,
657-660,882-960`).

This route may be an intentional advanced local diagnostic surface, but it is
still a main-to-renderer process boundary and conflicts with the task's absolute
"renderer must not receive raw path/error" requirement. It needs an explicit
policy decision, not accidental exemption.

### P2: AppProvider remains mixed safe/unsafe

Safe example: `processAppPath` reports through `operationalErrorService` and
returns `report.publicMessage` (`app-provider.ts:2946-2985`). App rebuild/reset
also partially forwards safe reset fields (`app-provider.ts:3664-3707`).

Unsafe routes:

- app diagnostic catch returns the raw exception message as `reason`
  (`app-provider-diagnostics.ts:449-494`).
- app reindex performs DB/search work with no outer catch; thrown errors use the
  transport-level raw-Error path. It also returns paths and free-form fields
  (`app-provider-diagnostics.ts:497-566`).
- managed-entry list/upsert/remove/setEnabled can throw DB/search failures and
  handlers return them directly (`app-managed-entry-service.ts:44-198`;
  `app-provider.ts:1331-1353`; `common.ts:1650-1686`).
- app source evidence embeds scanner exception text in `reason`, and scanner
  result errors are copied into grouped evidence (`app-provider.ts:1773-1830,
1856-1875`).
- app diagnostic/result DTOs intentionally expose absolute paths, launch
  targets, working directories, raw query/FTS data, and reasons
  (`app-index.ts:37-172`).

### P2: Worker boundaries preserve raw local diagnostics by design

Search worker errors deliberately preserve name, message, stack, code,
rawCode, and recursive cause; the client reconstructs the full `Error`
(`search-index-worker-error.ts:1-84`). This is appropriate for the controlled
worker-to-main diagnostic boundary and enables SQLite-busy classification.
However, the client rejects pending calls with the reconstructed raw error even
after recording a safe public status (`search-index-worker-client.ts:714-736`),
so every caller must normalize before any renderer DTO/state.

File scan/index/reconcile/icon/thumbnail workers send raw message strings. Their
clients store the message in `lastError/lastTask.error` and reject with a new
raw-message `Error` (for example `file-index-worker.ts:398-404` and
`file-index-worker-client.ts:230-263`; equivalent paths exist in the other four
clients). Parser failures are also persisted as per-file `lastError`
(`file-index-worker.ts:248-272`).

## Operational Error Comparison

The service already provides the target building blocks:

- stable report ID/domain/operation/code/retryability/public message
- nested cause traversal and SQLite-busy detection
- SQL/path rejection for public messages
- allowlisted primitive context and sensitive-key filtering
- deduplicated local detail plus aggregate sinks

References: `apps/core-app/src/main/modules/observability/
operational-error-service.ts:48-124,228-324`. Tests cover SQL/path public
redaction, nested SQLite busy metadata, context filtering, dedupe, bounded
pre-init delivery, and sink isolation (`operational-error-service.test.ts:
21-114`).

Current gaps are adoption and boundary projection, not the core classifier:

- provider/runtime APIs can still forward old free-form fields;
- no shared public index-failure DTO is enforced at all transport handlers;
- typed SDKs do not validate/project responses;
- renderer still accepts old `error/reason` fallback behavior;
- task/evidence state has no local-detail versus public-summary split.

## Sentry and Nexus

### Sentry

Main operational detail calls `Sentry.captureException(error)` with the
original `Error` (`sentry-service.ts:865-882`). Renderer operational reporting
does the same (`sentry-renderer.ts:237-252`), although no current file-index
renderer flow calls that reporter.

Both `beforeSend` implementations delete request/breadcrumb/extra data,
replace event and exception values with `redacted`, and remove filename,
absolute path, source context, and variables from stack frames
(`telemetry-sanitizer.ts:419-459`; `sentry-renderer.ts:45-79`). Thus the known
serialized event is safe, but the raw object reaches the Sentry SDK before this
hook. Existing tests cover one flat exception and one frame; they do not cover
linked `cause` exception values, `mechanism.data`, multiple frames, index SQL
canaries, or an actual SDK `beforeSend` cycle.

### Nexus

Operational aggregates send only stable report classification and sanitized
primitive context (`sentry-service.ts:840-853`). Nexus sanitization allowlists
operational fields and drops sensitive keys (`telemetry-sanitizer.ts:102-125,
315-332,357-397`).

Renderer error replies do report raw `replyPreview` and renderer stack back to
main perf diagnostics (`renderer channel-core.ts:313-331`). `PerfMonitor` keeps
and logs these raw fields locally (`perf-monitor.ts:576-641`), but its Nexus
performance payload nests incident metadata under `meta`, which the performance
sanitizer does not emit (`perf-monitor.ts:254-274`; `telemetry-sanitizer.ts:
282-312`). No confirmed raw Nexus egress was found.

## Recommended Boundary Shape

Use one exact public failure shape for file rebuild/update, indexed-source
maintenance, app mutation/reindex, status failure, task history, and evidence:

```ts
interface PublicOperationalFailure {
  errorCode: string
  message: string
  retryable: boolean
  reportId: string
}
```

`message` must be generated from a stable localization key/code projection,
not supplied from caught `Error.message`. Do not retain compatibility aliases
such as `error`, `reason`, `errorMessage`, `lastError`, `stack`, or `cause` on
public failure DTOs. Keep paths only in explicitly user-selected path workflows;
failed-file and diagnostic transport should use opaque IDs, basename/category,
or a separately confirmed local-diagnostics action.

Normalization must occur at main transport handlers even if providers already
normalize. This closes direct provider throws and future regressions. A
renderer-side exact decoder should reject unknown/raw fields and show a generic
failure without logging the received payload.

## Release Gate

Do not mark the task's redaction acceptance complete until:

- all P1 routes above are removed or explicitly policy-exempted;
- serialized success and thrown-handler error paths are canary tested;
- renderer logs/UI/clipboard are canary tested;
- Sentry `beforeSend` and Nexus final payload are tested with SQL, `params:`,
  POSIX/Windows paths, stack, and nested cause canaries;
- the advanced dashboard has an explicit renderer-boundary decision.
