# Error Route Inventory

## Legend

- **Raw**: may contain SQL, params, absolute path, stack, cause, or arbitrary
  exception text.
- **Safe**: projected through stable operational fields or a fixed literal.
- **Local**: worker/main-process diagnostic boundary or persistent local log.
- **Public**: main-to-renderer transport, renderer console/UI/clipboard, or
  remote telemetry boundary.

## Database Origins

| Route                     | Origin and propagation                                                                                                       | Reachable sinks                                                                                                           | State                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| F-DB-1 metadata update    | `file-provider.ts:3226-3253` executes Drizzle `UPDATE files`; executor rethrows (`indexing-write-update-executor.ts:81-133`) | incremental failure snapshot/evidence, local logs; reconciliation scan failure/status/task diagnostics; handler rejection | **Raw public reachable**                             |
| F-DB-2 enrichment update  | `file-index-persistence-repository.ts:219-268` updates `files.content/embeddingStatus` in search worker                      | structured search-worker error -> main reject -> flush evidence/runtime/status depending caller                           | **Raw local, raw public if caller fails to project** |
| F-DB-3 file upsert        | `file-index-persistence-repository.ts:120-155` inserts/on-conflict-updates `files`                                           | FTS write failure snapshot -> evidence -> diagnostics -> renderer                                                         | **Raw public reachable**                             |
| F-DB-4 app managed update | `app-managed-entry-service.ts:59-131` updates/inserts `files`                                                                | uncaught handler rejection -> transport `{name,message,stack}` -> renderer errorReply diagnostics                         | **Raw public reachable**                             |
| F-DB-5 app scan/update    | `app-provider.ts:602,624,2877,4030` updates `files`                                                                          | provider logs; scan/reconcile task diagnostics; app mutation/reindex transport depending entry point                      | **Mixed**                                            |

Drizzle failures can have the form `Failed query: UPDATE files ... params: ...`.
The propagation code does not redact this format before storing or crossing the
renderer boundary in the unsafe routes above.

## Worker Boundaries

| Route                   | Worker -> main payload                                                             | Main behavior                                                                                                                                                            | Downstream                                                  |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| W-1 search-index worker | full `name/message/stack/code/rawCode/cause` (`search-index-worker-error.ts:1-84`) | reconstructs full `Error`; operational report has `captureDetail:false`; status gets safe message; pending promise rejects raw (`search-index-worker-client.ts:714-736`) | safe worker status; raw caller propagation remains possible |
| W-2 file index task     | message string (`file-index-worker.ts:398-404`)                                    | stores raw `lastError/lastTask.error`, rejects raw-message `Error` (`file-index-worker-client.ts:230-263`)                                                               | dashboard; scheduling/local logs; scan failure chain        |
| W-3 file parser result  | per-file raw parser `error.message` (`file-index-worker.ts:248-272`)               | persisted to `file_index_progress.lastError`                                                                                                                             | failed-files DTO/dialog and dashboard                       |
| W-4 scan worker         | message string (`file-scan-worker.ts:133-143`)                                     | stores/rethrows raw (`file-scan-worker-client.ts:201-226`)                                                                                                               | scan runtime/task/status/broadcast                          |
| W-5 reconcile worker    | message string (`file-reconcile-worker.ts:133-143`)                                | stores/rethrows raw (`file-reconcile-worker-client.ts:172-205`)                                                                                                          | reconcile/full-scan runtime/task/status/dashboard           |
| W-6 icon worker         | message string (`icon-worker.ts:87-100`)                                           | stores/rethrows raw (`icon-worker-client.ts:140-173`)                                                                                                                    | dashboard and local logs                                    |
| W-7 thumbnail worker    | message string (`thumbnail-worker.ts:78-88`)                                       | stores/rethrows raw (`thumbnail-worker-client.ts:160-193`)                                                                                                               | dashboard and local logs                                    |
| W-8 worker crash event  | Node worker `Error`                                                                | clients set `lastError = error.message` and log full error                                                                                                               | dashboard plus controlled main local log                    |

W-1 is an intentional rich local diagnostic boundary. W-2 through W-8 carry
less structure, but their message remains untrusted/raw.

## Indexing Runtime

| Route                                 | Raw conversion/storage                                                                                             | Public route                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| R-1 source scan single                | catches raw only to record `error.message`, then rethrows (`indexing-runtime.ts:570-603`)                          | `indexed-source.scan` direct handler has no projection (`common.ts:1587-1618`); transport serializes raw Error/stack |
| R-2 source scan batch                 | scheduler stores `message = error.message` (`indexing-scan-scheduler.ts:382-439`)                                  | runtime task diagnostics via `recentTasks/lastScan`; diagnostics handler returns unchanged                           |
| R-3 reconcile single                  | scheduler/engine may throw; no runtime catch around call (`indexing-runtime.ts:670-713`)                           | `indexed-source.reconcile` direct handler has no projection (`common.ts:1563-1585`)                                  |
| R-4 reconcile batch/deltas            | converts error to strings and `sourceId:message` delta entries (`indexing-reconcile-engine.ts:130-194`)            | reconcile result `deltaErrors/reason`; task diagnostics                                                              |
| R-5 watch                             | router converts to string; runtime stores `event.path` plus `error.message` (`indexing-runtime.ts:1307-1333`)      | diagnostics lastWatch/recentTasks                                                                                    |
| R-6 task state                        | builders duplicate raw text to `error`, `errorMessage`, summary and path (`indexing-source-task-state.ts:177-475`) | diagnostics; settings chips/toasts                                                                                   |
| R-7 persisted task state              | `optionalString` only type-checks, no content redaction (`indexing-task-state-store.ts:241-435`)                   | replayed after restart into diagnostics                                                                              |
| R-8 source health catch               | `buildIndexedSourceErrorHealth` maps arbitrary message to `lastError` (`indexing-source-error-health.ts:16-32`)    | diagnostics -> source description                                                                                    |
| R-9 reset exception                   | `reportIndexedSourceResetFailure` maps to operational report (`indexing-runtime.ts:1510-1544`)                     | **Safe** `error/errorCode/retryable/reportId`, despite legacy `error` name                                           |
| R-10 reset precondition/source result | literals and `localResult.error` are returned (`indexing-runtime.ts:785-842`)                                      | public free-form `error` remains allowed                                                                             |
| R-11 flush snapshot                   | defaults to `error.message` (`indexing-write-flush-snapshot.ts:179-207`)                                           | evidence metadata `error` -> diagnostics -> settings display                                                         |
| R-12 roots/records                    | source roots, watch path, record path/subtitle are absolute paths (`indexing-source.ts:719-810`)                   | diagnostics and dashboard intentionally expose them                                                                  |

## FileProvider

| Route                       | Source                                                                                             | Sink                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| FP-1 failure broadcast      | raw `error.message` and `error.stack` (`file-provider.ts:1903-1919`)                               | raw `file-index:failed` renderer broadcast                                   |
| FP-2 status                 | `initializationError.message` and startup error (`file-provider.ts:1928-1964`)                     | `fileIndex.getStatus` -> settings `<pre>` and indexed-source health/progress |
| FP-3 failed files           | DB path plus `lastError` (`file-provider.ts:2173-2204`)                                            | `fileIndex.failedFiles` -> display/copy                                      |
| FP-4 rebuild preconditions  | fixed English strings in legacy `error` (`file-provider.ts:2222-2280`)                             | renderer raw fallback/log/toast; content currently safe but schema unsafe    |
| FP-5 rebuild reset failure  | forwards runtime reset fields (`file-provider.ts:2284-2303`)                                       | safe only when reset normalized upstream                                     |
| FP-6 rebuild thrown failure | operational service projection (`file-provider.ts:2304-2321`)                                      | **Safe** public fields; full detail local/Sentry pre-sanitize                |
| FP-7 index update failure   | records raw message in incremental/FTS snapshots (`file-provider.ts:1285-1336,2875-2918`)          | source evidence diagnostics and local log                                    |
| FP-8 scan failure           | stores raw Error, logs full detail, broadcasts, may rethrow (`file-provider.ts:1550-1580`)         | status, health, progress, raw broadcast, runtime task state                  |
| FP-9 worker snapshot        | returns clients' `lastTask.error/lastError` unchanged (`file-provider.ts:3496-3503`)               | raw dashboard                                                                |
| FP-10 dashboard progress    | returns absolute paths and persisted errors (`file-provider.ts:3430-3493`)                         | raw dashboard                                                                |
| FP-11 add path failures     | error logged with absolute path; public result uses stable literals (`file-provider.ts:2350-2417`) | **Safe public**, raw local log                                               |

## AppProvider

| Route                    | Source                                                                                                               | Sink                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| AP-1 path mutation       | operational projection in catch (`app-provider.ts:2946-2985`)                                                        | safe `reason` string, but no code/report ID in current DTO                                |
| AP-2 diagnose catch      | raw `error.message` becomes `reason` (`app-provider-diagnostics.ts:449-494`)                                         | app diagnose DTO -> manager/diagnostic toast/copy                                         |
| AP-3 target reindex      | no outer catch around find/sync (`app-provider-diagnostics.ts:497-566`)                                              | thrown Error -> transport message/stack; result also includes path/reason/error/message   |
| AP-4 managed entries     | DB/search methods throw (`app-managed-entry-service.ts:44-198`)                                                      | direct typed handlers -> transport raw Error/stack; successful DTOs include paths/targets |
| AP-5 app evidence        | scanner exception text embedded in evidence reason (`app-provider.ts:1773-1830`)                                     | indexed-source diagnostics -> renderer evidence chip                                      |
| AP-6 grouped evidence    | scanner `result.error` copied into reason (`app-provider.ts:1856-1875`; `indexing-source-grouped-evidence.ts:37-84`) | diagnostics -> renderer                                                                   |
| AP-7 app rebuild         | reset errors forwarded; catch uses operational projection (`app-provider.ts:3664-3707`)                              | generally safe, but local result schema retains legacy `error/message`                    |
| AP-8 app health reason   | row counts only (`app-provider.ts:960-974`)                                                                          | safe diagnostics classification                                                           |
| AP-9 diagnostics payload | paths, launch target, working directory, raw query, FTS query (`app-index.ts:89-172`)                                | renderer display and copied JSON; privacy-sensitive even without an exception             |

## Transport

| Route                             | Behavior                                                                                      | Exposure                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| T-1 settings domain SDK           | direct `transport.send`, no result normalization (`settings.ts:160-216`)                      | all provider/runtime DTO fields cross unchanged                       |
| T-2 typed main handler throw      | logs message and rethrows (`main-transport.ts:666-685`)                                       | ChannelCore receives original Error                                   |
| T-3 ChannelCore async error reply | replies with original Error (`channel-core.ts:514-525`)                                       | strict serializer emits name/message/stack                            |
| T-4 strict Error serialization    | `{name,message,stack}` (`structuredStrictStringify`, utils `index.ts:147-153`)                | raw stack crosses main -> renderer; cause omitted                     |
| T-5 renderer error reply handling | logs `replyPreview`, reports perf, resolves error data (`renderer channel-core.ts:275-335`)   | renderer console, main perf local log; declared DTO contract bypassed |
| T-6 file rebuild handler          | catches and operationally projects (`common.ts:1491-1508`)                                    | **Safe** handler exception result                                     |
| T-7 indexed-source handlers       | diagnostics/reset/reconcile/scan mostly pass runtime output unchanged (`common.ts:1511-1618`) | raw/free-form diagnostics and handler errors                          |
| T-8 app handlers                  | methods returned directly (`common.ts:1640-1686`)                                             | raw/free-form DTOs and handler errors                                 |
| T-9 file failure raw event        | event explicitly includes stack (`file-provider.ts:229-236`)                                  | raw broadcast                                                         |
| T-10 dashboard raw event          | `{ok,snapshot,error}` with unknown snapshot (`tuff-dashboard.ts:26-33`)                       | bypasses typed settings domain entirely                               |

## Renderer Sinks

| Sink                        | Raw input used                                                   | References                                                                                    |
| --------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| UI-1 renderer console       | transport catches, rebuild result errors, source actions         | `useFileIndexMonitor.ts:26-32,52-57,83-102,120-133`; `SettingFileIndex.vue:453-461,1012-1020` |
| UI-2 rebuild toast          | `errorCode` mapping falls back to raw `error/reason`             | `index-rebuild-flow.ts:19-38`; tests explicitly expect raw fallback                           |
| UI-3 status popover         | `indexStatus.error` verbatim                                     | `SettingFileIndex.vue:1059-1086`                                                              |
| UI-4 source description     | `health.lastError/reason`                                        | `SettingFileIndex.vue:384-391`                                                                |
| UI-5 task chips             | last scan/watch/reconcile/reset errors and task error            | `indexing-source-diagnostics-display.ts:548-657`                                              |
| UI-6 evidence chips         | `metadata.error` and reason                                      | `indexing-source-diagnostics-display.ts:372-405,708-724`                                      |
| UI-7 failed files           | path and `lastError` displayed/copied                            | `FailedFilesListDialog.vue:40-47,85-112`                                                      |
| UI-8 app manager            | raw result reason/error; full diagnostic JSON copied/rendered    | `SettingFileIndexAppIndexManager.vue:149-179,285-294,478`                                     |
| UI-9 app diagnostic         | raw reason/error and path/query evidence                         | `SettingFileIndexAppDiagnostic.vue:187-194,253-273,494-506`                                   |
| UI-10 dashboard             | response error, worker errors, watched/index paths, entry errors | `LingPan.vue:325-360,657-660,882-960`                                                         |
| UI-11 latent failure dialog | arbitrary `errorDetail`                                          | `FileIndexFailDialog.vue:6-9,65-68`; no current caller found                                  |

## Local Logs

Main logger intentionally persists full error stack and recursive cause
(`apps/core-app/src/main/utils/logger.ts:123-172`). This is compatible with the
task only if logs remain controlled main-process local diagnostics.

Raw local log routes include:

- operational error detail (`operational-error-service.ts:90-103`)
- all `FileProvider.logWarn/logError` calls (`file-provider.ts:900-938`)
- worker-client crash and task failures
- runtime health/evidence/scan failures
- AppProvider scan/diagnostic/update failures
- ChannelCore/TuffTransport handler errors
- renderer errorReply perf data after it is reported back to main
  (`perf-monitor.ts:576-641`)

Renderer console is not a controlled main-process local sink and therefore is
public for this audit.

## Sentry/Nexus Routes

| Route                             | Input to SDK/queue                                                                           | Final sanitizer behavior                                                                            | Result                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| OBS-1 main operational detail     | original Error, including stack/cause (`sentry-service.ts:865-882`)                          | exception values -> `redacted`; frame paths/context/vars removed (`telemetry-sanitizer.ts:419-459`) | raw reaches Sentry SDK pre-hook; known event output safe        |
| OBS-2 renderer operational detail | original Error (`sentry-renderer.ts:237-252`)                                                | same value/frame redaction (`sentry-renderer.ts:45-79`)                                             | not currently invoked by file-index UI; pre-hook raw if adopted |
| OBS-3 operational aggregate       | report domain/operation/code/retryability/context (`sentry-service.ts:840-853`)              | strict allowlist and sensitive-key filtering                                                        | **Safe Nexus path**                                             |
| OBS-4 search worker report        | raw reconstructed Error with `captureDetail:false` (`search-index-worker-client.ts:718-727`) | no Sentry detail; aggregate only                                                                    | **Safe remote, raw local**                                      |
| OBS-5 renderer errorReply perf    | raw reply preview + renderer stack returned to main (`renderer channel-core.ts:313-331`)     | kept/logged locally by PerfMonitor; nested `meta` is omitted by performance Nexus sanitizer         | no confirmed raw Nexus egress                                   |
| OBS-6 console breadcrumbs         | renderer console may become Sentry breadcrumb                                                | both sanitizers delete breadcrumbs                                                                  | final event safe under current hook                             |

Residual risk: no index canary verifies linked causes, exception mechanism data,
multiple exception values, or actual SDK event construction before the
sanitizer. No sink should be considered proven until such a test exists.
