# Redaction Test Gap Matrix

## Existing Coverage

| Area                         | What is covered                                                                                                                                       | What it proves                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Operational error service    | SQL/path public-message rejection, nested SQLite busy cause, sensitive context removal, report ID, dedupe (`operational-error-service.test.ts:21-67`) | classifier can produce safe public output while retaining local Error |
| Operational sink lifecycle   | bounded pre-init detail, disabled delivery, sink failure isolation (`operational-error-service.test.ts:69-114`)                                       | observability failures do not alter business results                  |
| Main Sentry sanitizer        | request/breadcrumb/extra removal, user projection, message redaction, one stack frame path/context removal (`sentry-service.test.ts:203-247`)         | direct sanitizer handles one representative event                     |
| Nexus sanitizer              | search query/path filtering and identifier-shaped performance reasons (`sentry-service.test.ts:112-201`)                                              | known metadata allowlists work for those event types                  |
| Search worker client         | intentionally preserves raw Drizzle message and nested SQLite cause (`search-index-worker-client.test.ts:662-705`)                                    | worker-to-main diagnostic richness and busy detection are maintained  |
| File rebuild renderer helper | localized success wins; raw `error/reason` fallback is expected (`index-rebuild-flow.test.ts:28-95`)                                                  | documents current unsafe compatibility behavior                       |
| Source diagnostics display   | fixtures include paths and raw task/evidence errors (`indexing-source-diagnostics-display.test.ts`, e.g. `:227-286,446-537`)                          | display helpers intentionally consume free-form diagnostics           |
| Main channel handlers        | indexed-source/app results are passed through (`common.test.ts:1583-1622,1699-1766`)                                                                  | routing works, not redaction                                          |
| Domain SDK                   | asserts event mapping only (`transport-domain-sdks.test.ts:97-202,923-998`)                                                                           | typed events are selected, not result shape or safety                 |
| Task-state persistence       | preserves `errorMessage` strings (`indexing-task-state-store.test.ts:501-541`)                                                                        | persistence round trip currently retains raw detail                   |

## Missing Required Coverage

### 1. Deterministic database failure

Add isolated temporary-DB tests for both `UPDATE files` paths:

- metadata update in `FileProvider.updateFileRecord`;
- enrichment update in `SqliteFileIndexPersistenceRepository.persistChunk`;
- app managed-entry `UPDATE files` if app index remains in task scope.

Use a second real SQLite connection with `BEGIN IMMEDIATE` to force busy. Assert
stable classification, retryability, report ID correlation, lock release, and
successful retry without touching a real profile.

### 2. Exact serialized transport boundary

Test the complete main handler -> `ChannelCore.reply` ->
`structuredStrictStringify` -> renderer channel -> domain SDK path with a canary
Error containing all of:

```text
Failed query: UPDATE files SET name = ?
params: /Users/alice/Private/report.txt
C:\Users\alice\Private\report.txt
CANARY_STACK
CANARY_CAUSE
```

Required assertions:

- public result contains only the approved fields;
- serialized bytes contain none of the canaries;
- a thrown handler cannot resolve as an arbitrary response object;
- renderer errorReply logging/perf report contains no reply payload or stack;
- unknown fields are rejected/projected by the renderer SDK decoder.

No current transport test exercises error-result normalization for settings.

### 3. FileProvider public projections

Focused tests are missing for:

- `getIndexingStatus()` after raw initialization failure;
- `notifyIndexingFailure()` broadcast payload;
- `getFailedFiles()` redaction/path policy;
- `rebuildIndex()` every precondition/reset/catch branch exact shape;
- incremental/FTS failure snapshot exposure through source diagnostics;
- worker status snapshot exposure through dashboard.

Use exact-key assertions, not `toMatchObject`, so compatibility fields cannot
remain unnoticed.

### 4. Indexed-source runtime public projections

Add canary tests for single and batch scan, reconcile, watch, reset, diagnostics,
task history, persisted task-state reload, health fallback, and evidence.

Current tests often prove the opposite by expecting raw error text. New tests
must assert absence of `error`, `reason` carrying exception text,
`errorMessage`, `lastError`, `deltaErrors`, absolute watch path, stack, and
cause from public snapshots.

### 5. AppProvider and app diagnostics

Add thrown DB/search canaries to:

- diagnose;
- target reindex before and after confirmation;
- managed-entry list/upsert/remove/setEnabled;
- scanner evidence;
- app reset/rebuild.

Assert stable failure shape at the handler boundary and no raw path/query/FTS
content in error UI/log telemetry. Separately decide which successful app paths
are a functional requirement and document that policy.

### 6. Renderer UI, console, and clipboard

No focused test exists for `useFileIndexMonitor`. Add mocked SDK canaries and
spy on renderer logger/console, toast, rendered text, and clipboard for:

- status and rebuild;
- source scan/reconcile/reset;
- source diagnostics task/evidence chips;
- failed-files dialog;
- app manager/diagnostic;
- developer dashboard if it remains in scope.

The test should fail if SQL, `params:`, POSIX/Windows absolute path, stack, or
cause appears in any sink.

### 7. Sentry final event

Existing sanitizer unit coverage is insufficient. Add an event with:

- multiple linked exception values representing `Error.cause`;
- `mechanism.data` and module/type fields;
- multiple frames with filename/abs_path/source context/vars;
- SQL/params/path canaries in message, exception values, contexts, tags, extra,
  breadcrumbs, transaction, spans, and logentry;
- both main and renderer sanitizer implementations.

Assert the entire `JSON.stringify(finalEvent)` excludes every canary. Prefer a
test that captures the actual configured `beforeSend` callback from mocked
Sentry initialization, not only a direct helper call.

### 8. Nexus final payload

Add canaries to operational aggregate and renderer errorReply performance paths.
Capture the final payload queued to the persistent outbox/upload layer. Assert
only allowlisted stable primitives remain and nested `meta`, `replyPreview`,
payload previews, paths, SQL, params, and stack are absent.

### 9. Local-detail correlation

Verify that the main local log receives full raw diagnostics with the same
`reportId` returned to UI, while renderer/Sentry/Nexus public artifacts do not.
This protects the task's diagnostic requirement without preserving raw public
compatibility fields.

## Suggested Gate Order

1. Lock down public DTO exact types and handler projections.
2. Add transport serialization canary before changing renderer fallbacks.
3. Split local task/evidence detail from public diagnostics.
4. Remove renderer raw fallbacks, console payloads, and clipboard leaks.
5. Add Sentry/Nexus final-payload canaries.
6. Run focused tests, CoreApp node/web typecheck, scoped lint, production build,
   and `git diff --check` as required by the task PRD.

## Independent Review Result

At audit time there are open P1/P2 findings, so acceptance criterion
"independent review has no open P0/P1/P2" is not met. The principal blocker is
not a missing regex; it is the absence of one enforced public failure contract
at every main-to-renderer exit.
