# Background Task Timeout Contracts

Rules for anything that runs periodically or shells out on the main process.
Every search IPC, provider fan-out and DB read shares that one thread, so an
unbounded background task is a search latency bug.

## Scenario: Streaming requests declare timeout ownership

### 1. Scope / Trigger

This contract applies whenever `NetworkService` returns a response body as a
Node `Readable`, including Provider streams, downloads, and manually handled
redirects.

### 2. Signatures

```ts
requestStream(options: NetworkRequestOptions): Promise<NetworkStreamResponse>
requestStreamManualRedirect(options: NetworkRequestOptions): Promise<NetworkStreamResponse>

type NetworkStreamTimeoutMode = 'deadline' | 'caller-signal'

interface NetworkStreamResponse {
  stream: Readable
  complete(): void
  cancel(): void
}
```

`options.timeoutMs` is resolved once per attempt. A finite caller value is
floored and clamped to at least 100ms; otherwise the network setting supplies
the fallback.

### 3. Contracts

- `streamTimeoutMode` defaults to `deadline`. Start one absolute deadline before
  `session.fetch`; headers and body share it and partial deltas never extend it.
- A caller cancellation signal does not replace the default deadline. Combine
  the caller and deadline sources, and classify the winner by composite
  `signal.reason` identity. A caller-first abort remains `NetworkAbortError`
  even if the deadline fires later; a deadline-first abort remains
  `NetworkTimeoutError`.
- `caller-signal` disables the internal deadline and therefore requires
  `options.signal`. Use it only when the caller owns a resettable timeout, such
  as the single-stream download idle window. A missing signal fails before any
  request or cooldown mutation.
- Map caller cancellation to stable `NETWORK_ABORTED`, do not retry it, and do
  not write a cooldown failure. Do not infer cancellation from error names or
  messages: a real upstream can emit `AbortError` / `ABORT_ERR` and must still
  count as a failure.
- In deadline mode, expiry after headers destroys the bridged Node stream with
  `NetworkTimeoutError(timeoutMs)`. EOF calls the success settlement; native
  stream errors call failure; `cancel()` and an early close are neutral.
- `complete()` and `cancel()` are idempotent lifecycle operations. Protocol
  consumers call `complete()` before yielding a terminal frame, then call
  `cancel()` from `finally`; the latter is a no-op after success or failure.
- Consumers that may return before physical EOF must iterate with
  `stream.iterator({ destroyOnReturn: false })` and call `cancel()` in
  `finally`. Native `for await...break` can synthesize the same `AbortError`
  shape as a genuine upstream failure and is not a valid cancellation signal.

### 4. Validation & Error Matrix

| Condition                                                   | Required result                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| Caller signal exists; headers exceed default deadline       | `NetworkTimeoutError`; caller cannot bypass the deadline                  |
| Caller aborts before headers or while awaiting body data    | `NetworkAbortError`; no retry or cooldown mutation                        |
| Headers and partial data arrive, then deadline body stalls  | Stream errors with `NetworkTimeoutError`; partial bytes remain observable |
| `caller-signal` stream remains active beyond `timeoutMs`    | No internal timeout; caller-owned signal governs it                       |
| Protocol terminal frame arrives while physical body is open | `complete()` settles success and closes the bridge                        |
| Body emits upstream `AbortError` without caller abort       | Original error reaches the consumer and records failure                   |
| Consumer calls `cancel()`                                   | Neutral settlement; no success/failure accounting                         |

### 5. Good / Base / Bad Cases

- Good: a Provider emits one delta and hangs; the original request deadline
  tears down the stream and the failure reaches audit and usage exactly once.
- Good: a download receives a chunk inside every idle window and may run longer
  than the numeric idle timeout without an absolute-deadline failure.
- Base: headers and body EOF both arrive inside the same default deadline.
- Bad: use `options.signal ?? AbortSignal.timeout(...)`, classify all aborted
  messages as timeout, or return from a native stream iterator without the
  controlled `cancel()` lifecycle.

### 6. Tests Required

- A post-header stream fixture must enqueue partial data and remain open long
  enough for the request deadline to produce `NetworkTimeoutError`; include a
  real local-fetch case, not only a mocked `Response`.
- Cover caller-first and deadline-first provenance, pre-header and post-delta
  cancellation, missing caller signal, caller-owned long streams, protocol
  completion, explicit cancellation, and upstream AbortError-shaped failure.
- Provider tests must keep the physical body open after a terminal frame and
  cancel while `next()` is pending after a delta.
- Download tests must assert `caller-signal` ownership for the resettable idle
  path so a healthy slow transfer is not bounded by an absolute deadline.
- Packaged Provider failure acceptance must include a post-delta hang and
  preserve server-side proof that headers, a partial delta, and an open body
  were all observed, plus UI and audit/day/month failure deltas.

### 7. Wrong vs Correct

```ts
// Wrong: the caller signal silently disables the request deadline.
signal: options.signal ?? AbortSignal.timeout(timeoutMs)

// Correct: keep explicit source provenance and first-winner identity.
const signal = AbortSignal.any([callerAbort.signal, deadlineAbort.signal])
if (signal.reason === deadlineAbort.signal.reason) throw new NetworkTimeoutError(timeoutMs)
if (signal.reason === callerAbort.signal.reason) throw new NetworkAbortError()

// Protocol consumers own their early-return lifecycle.
try {
  for await (const chunk of response.stream.iterator({ destroyOnReturn: false })) {
    if (isTerminal(chunk)) {
      response.complete()
      yield terminalChunk
      return
    }
  }
} finally {
  response.cancel()
}
```

## Scenario: Native OCR belongs to a one-shot utility process

### 1. Scope / Trigger

CoreApp `vision.ocr` recognition invokes a native/N-API addon. A native timeout or
abort must fail one request, never terminate the Electron main process. A Node
worker thread is not a crash boundary: its native code shares the main process.

### 2. Signatures

```ts
recognizeImageTextIsolated(
  options: NativeOcrOptions,
  invocation?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<NativeOcrResult>

type OcrProcessMessage =
  | { type: 'ocr.success'; requestId: string; result: NativeOcrResult }
  | { type: 'ocr.error'; requestId: string; code?: string; message: string }
```

The runtime entry is `ocr-process.js`; `LocalProvider.visionOcr` calls the client.
`OcrService` invokes the configured `vision.ocr` provider route once. It must not
run a second native worker first or fall back to native recognition on main.

### 3. Contracts

- One request owns one `utilityProcess.fork`. Wait for `spawn` before sending
  `{ type: 'ocr.request', requestId, options }`; the deadline also covers that wait.
- Default deadline: 30,000 ms. A finite positive caller deadline overrides it.
  Timeout, cancellation and application quit reclaim only the owned OS process.
- Structured clone yields `Uint8Array`; the child restores a Buffer view with
  `Buffer.from(value.buffer, value.byteOffset, value.byteLength)`.
- Only the matching request identity can settle. Success requires string `text`,
  a supported native engine and finite `durationMs`. Preserve native error codes.
- A terminal frame clears the deadline and disarms cancellation/quit hooks, but
  never kills the child. The child detaches its request listener and schedules
  exit after the N-API callback has unwound (`setImmediate`, not inline exit).
- Settle once. Late frames cannot turn timeout/abort into success; an observed
  failing/exited child must not receive a second kill.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Valid matching success | Resolve; no parent kill |
| Matching native error | Reject with its native code/message; no parent kill |
| Malformed matching success | `OCR_PROCESS_INVALID_RESPONSE` |
| Foreign request identity | Ignore; original deadline remains armed |
| Deadline before result, including before spawn | Kill child once; `OCR_PROCESS_TIMEOUT` |
| Caller abort or application quit | Reclaim active child; `OCR_PROCESS_ABORTED` |
| Fatal child error/nonzero exit | `OCR_PROCESS_EXITED`; main stays alive |
| Clean child exit without a result | `OCR_PROCESS_INVALID_RESPONSE` |

### 5. Good / Base / Bad Cases

- Good: hung Vision recognition is killed in its utility process; the same main
  process can accept another native request.
- Base: normal recognition returns native text/layout through the same client.
- Bad: terminating a worker thread while its N-API callback is pending, or
  retrying that recognition directly on main after the worker timed out.

### 6. Tests Required

- Matching success/error, malformed result and foreign identity boundaries.
- Never-spawning child, deadline/result races, abort/quit and fresh request after
  child failure. Assert request outcome and reclamation, not forwarding alone.
- Service persistence/defer/failure must follow one provider invocation per job.
- Actual Electron smoke: native error projection, silent-child reclamation and
  child `SIGABRT`; the original main PID must survive and handle another request.
- Normal native text recognition needs a healthy system OCR engine. On this host,
  a standalone Node control also failed in Apple Vision's ANE model-compilation
  XPC call. Fault-containment proof is not proof that the OS recognizer is healthy.
- Independent macOS Electron smoke with this client and the production child returned
  `TUFF OCR ISOLATION 2026` with one layout block in 24,950 ms. After a child
  `SIGABRT`, the same main PID returned the same text in a new child in 175 ms.
  This proves normal recognition and post-fault recovery; one slow first sample
  does not establish a per-request cold-start cost. The default deadline stays 30 s.

### 7. Wrong vs Correct

```ts
// Wrong: both native calls share the Electron main process' crash boundary.
await workerNativeOcr().catch(() => recognizeImageText(options))

// Correct: provider selection stays authoritative; native OCR lives in a child.
await recognizeImageTextIsolated(options, { timeoutMs, signal })
```

## PollingService: bounded by default

`packages/utils/common/utils/polling.ts`

- Omitting `timeoutMs` yields `DEFAULT_POLLING_TASK_TIMEOUT_MS` (30s). It is not
  "no timeout" — that used to be the default and is what let one task park a
  lane indefinitely.
- `timeoutMs: null` (or any non-positive number) is the explicit opt-out. Do not
  write `timeoutMs: 0` expecting a tiny budget; it means unbounded.
- Omitting `lane` yields `serial`, which is **concurrency 1**. A long task
  registered with `{ interval, unit }` alone therefore blocks every other
  default-lane task behind it. Pick a lane deliberately; `maintenance` is right
  for periodic IO sweeps.

**The timeout releases the lane slot; it does not cancel the callback.** It buys
scheduler liveness, nothing else. Two consequences:

1. Work that must actually stop needs its own budget at the call site.
2. After a timeout the same task can have two runs in flight. Prefer
   `backpressure: 'latest_wins'` + `dedupeKey` for anything non-idempotent.

When a task legitimately runs longer than the default, give it an explicit
larger `timeoutMs` rather than opting out — a wedged task should still surrender
its slot eventually. See `app_provider_full_sync` (10min) and
`temp-file.cleanup` (60s).

## Network drains need a round budget, not just a per-request timeout

A per-request `timeoutMs` bounds one call. A loop over a queue multiplies it by
the queue length, which is how `startup-analytics.outbox.flush` reached 599s and
`sentry.nexus.flush` 638s on an unreachable endpoint.

Any outbox/queue drain must:

- take a wall-clock `deadline` before the loop and check it each iteration;
- keep that budget **under** the polling bound, so the task finishes on its own
  terms instead of being timed out mid-write;
- stop the round on the first network failure — the endpoint is down for all of
  them, and per-item retries just burn one timeout each. An endpoint-wide HTTP
  answer (5xx, 403, 429) stops it too, behind a cooldown: while Nexus answered
  500 to every batch (database out of daily writes, 2026-10-08), walking on sent
  about one batch a second per client. Only an item-level 4xx moves on to the
  next item;
- when the queue is rewritten wholesale (rather than per-item removal), carry
  every unreached item back verbatim. Breaking out of a loop that builds a
  `remaining` array silently drops the tail otherwise.

## Failing child processes need backoff, not just error handling

`execFile`'s `timeout` kills the child instead of rejecting with a distinct
code: the error carries `killed: true` and `signal: 'SIGTERM'`, and stderr is
empty. A handler that only classifies permission/ENOENT/EBADF errors will let a
timeout fall through to the generic branch — and if that branch has no backoff,
a poll on a short interval respawns the doomed process forever.

Contract for a polled child-process probe:

- classify timeouts explicitly (`isCommandTimeoutError` in
  `modules/system/active-app.ts`);
- back off after N _consecutive_ failures, not the first, so a transient hang
  still retries immediately (see #770, which requires the next lookup to re-run);
- reset the counter and the backoff window on success;
- throttle the failure log. 278 unthrottled ERROR entries in one session, each
  embedding an AppleScript source dump, is its own main-thread IO cost.

## `waitForIdle()`: bounded or not depends on who is waiting

`appTaskGate.waitForIdle()` with no argument waits forever. That is **correct**
for background work — yielding to app tasks is the entire point of the gate, and
bounding an indexing worker would just put it back in contention. It is a bug
for anything a user is waiting on. Classify before touching one:

| Caller                                                    | On timeout                                               | Bound                                 |
| --------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------- |
| Repeatable hot-path work (per-capture clipboard refresh)  | **skip** — there is another chance next keystroke        | `CLIPBOARD_APP_TASK_WAIT_MS` (200ms)  |
| One-shot startup work (watcher start, cache hydrate, OCR) | **proceed anyway** — skipping means it never initializes | `APP_TASK_GATE_STARTUP_WAIT_MS` (10s) |
| Interactive entry point (`recommend()` on empty query)    | **proceed anyway**, under the renderer's own give-up     | 300ms (renderer gives up at 400ms)    |
| Background indexing / maintenance                         | n/a                                                      | none — leave unbounded                |

Two traps found in the one-shot category, both worse than "it's slow":

- A latch set before the wait and cleared only in the `.then()`
  (`coreBoxBaselineCaptureQueued`) stays stuck for the whole session if the gate
  never drains, so the work can never even be _scheduled_ again.
- Failing to start the native clipboard watcher disables
  `shouldSkipUnchangedCapture`, which pushes a synchronous main-thread clipboard
  read onto every CoreBox show — a startup-path stall that degrades the search
  path.

The renderer awaits a clipboard refresh _before_ it builds the query, so an
unbounded wait on that path stalls the entire search for as long as the
app-index scan runs.

### Adding an export to `app-task-gate` breaks its mocks silently

`vi.mock('../service/app-task-gate', () => ({ appTaskGate }))` factories list
exports explicitly. A module that starts importing a second binding
(`APP_TASK_GATE_STARTUP_WAIT_MS`) throws on _access_, and if that access sits
inside a promise chain with a `.catch()`, the error is swallowed — the symptom
is an unrelated spy "never called", not an import failure. Update every mock
factory when adding an export here.

## Diagnosing

`[Perf:EventLoop]` records timer lateness; contexts are attribution clues, not sampled stacks.

- `lagMs` is the observed event-loop delay. A long-lived `FileProvider.fullScan` context is
  scan wall time, not proof that directory traversal blocked the main thread.
- `mode: 'blocking'` is an explicit caller label. If the span encloses an `await`, its full
  duration can include asynchronous waiting. Confirm the synchronous boundary with a stack
  sample or an event-loop responsiveness probe before changing scheduling.
- `pollingRecent` and `lastSlowIpc` describe past work; inspect age and overlap before
  assigning causality. `contexts=[]` does not exclude uninstrumented main-thread work.
- High swap usage can outlive memory pressure. Compare current CPU, memory pressure and
  page-in/out activity; allocated swap capacity is not a fixed resource-exhaustion threshold.

## Index watch and shutdown lifecycle

- Watch admission reads current health and roots, not a full diagnostic report. Explicit
  source events query only that source; unscoped events still consider all sources. Never
  cache permission/enabled decisions to optimize this path. Preserve stored task history
  before recording the first watch result after a runtime restart.
- `SearchEngineCore.destroy()` closes admission and initiates scan cancellation/provider
  shutdown before awaiting session or event-router drains. A queued watch can hold up a
  router drain while waiting on the scan mutation gate; placing cancellation after that
  await creates a cycle. Attach rejection handlers when concurrent drains are created,
  collect failures, and keep the writer alive until every required drain succeeds.
- The before-quit flow stops native file watchers first (`BEFORE_QUIT_STOP_WATCHERS`, own 2s
  bound, shared promise), before renderer quiesce and `BEFORE_APP_QUIT`. Every exit path ends
  in `app.exit` (`process.exit` is `app.exit` in the main process), which tears the Node
  environment down without waiting for module unload, and an FSEvents stream still running at
  that point aborts the process from its own thread. The dev force-exit path runs the same stop
  before destroying windows.
- `BEFORE_MODULES_UNLOAD` listeners run before `unloadAll` starts, so they must not wait on the
  network: the CoreBox focus telemetry flush persists to the outbox only, and the next launch's
  poll uploads it (same as Sentry's `onDestroy` on app close).
- After before-quit cleanup finishes, set the completed latch **before** handing off to
  DevProcessManager. Its synchronous `app.quit()` re-enters the same handler; otherwise
  the pending cleanup promise prevents that second quit and the force-exit timer wins. That
  timer is the before-quit budget plus a tail grace (`GRACEFUL_SHUTDOWN_TIMEOUT_MS`, 12s), not
  a flat value: at 5s it fired first on every slow shutdown and destroyed windows while modules
  were still loaded.
- Sentry teardown closes telemetry admission and detaches producer subscriptions/timers
  before its first await. Flush already accepted events while Storage is still live.
  Late module lifecycle events and previously queued polling callbacks must not read
  destroyed storage or re-arm work. Re-initialization reopens admission explicitly.
- Both telemetry outbox flush tasks (`sentry.nexus.flush`, `startup-analytics.outbox.flush`)
  register an explicit `timeoutMs` of round budget + one request timeout + 5s slack. The round
  budget is only checked between items, so one more request may start just under it; at the
  polling default (30s) the Sentry task was timed out at 30,002ms with a request still in flight.
  A failed startup upload records a stable code on the row (`NETWORK_TIMEOUT`, `HTTP_403`,
  `STARTUP_REPORT_FAILED`) and sends `X-Idempotency-Key: startup:<sessionId>` so Nexus
  de-duplicates the retry; consent is re-read every round and an opt-out discards the queue.

## Scenario: macOS translation reuses a readiness-gated Swift helper

### 1. Scope / Trigger

CoreApp `text.translate` can use Apple Translation on macOS 26 or newer. The
translation plugin obtains this provider through the existing controlled host
service; there is no second plugin-side native route.

### 2. Signatures

`@talex-touch/tuff-native/translation` exports:

```ts
getSystemTranslationStatus(options?: { timeoutMs?: number; signal?: AbortSignal }):
  Promise<{ supported: boolean; ready: boolean; installedLanguages: string[]; reason?: string }>
isSystemTranslationAvailable(): boolean
translateSystemText(
  payload: { text: string; sourceLang?: string; targetLang: string },
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<{ text: string; sourceLang: string; targetLang: string; durationMs: number }>
closeSystemTranslation(): void
```

Build the host executable with `node packages/tuff-native/scripts/build-translation.js`.
Use `--universal` for the release's arm64 and x86_64 slices. The build requires
SDK 26+; runtime never compiles Swift or downloads translation assets.

### 3. Contracts

- `LanguageAvailability.installed` alone is insufficient: the first observation
  can precede translationd asset synchronization. Only actual `TranslationSession.isReady`
  enables the runtime provider. Initialization bounds the probe at 5,000 ms.
- The provider is `local-system-translation`, type `local`, model `system-translation`,
  capability `text.translate` only, priority 0. Provider and binding injection
  never mutate the stored configuration. Effective capability options and the
  plugin catalog use the same runtime binding. A ready native translation route
  sorts first; other providers and capabilities retain their existing alphabetical order.
- A persistent helper processes request-id-addressed JSONL. Source text is at
  most 64 KiB; at most 32 requests can be pending. The helper retains at most
  eight language-pair sessions. Source and target languages are explicit except
  auto-detection through `NLLanguageRecognizer`.
- Installed Chinese script hints resolve short shared-character ambiguity;
  they do not override an explicitly selected source language. A fresh helper
  probes once before its first automatic detection, including after cancellation
  or timeout; callers must not need a separate status call to restore those hints.
- Each request owns an absolute deadline, default 30,000 ms, including queue
  time. Timeout or cancellation reclaims the owned helper and rejects its pending
  requests; a later request may start a fresh process. Module destruction closes
  the helper. Late exit callbacks cannot affect a replacement process.
- Results retain the SDK trace and latency, with zero tokens and zero cost.
  The native provider never calls a chat endpoint. Explicit provider selection
  remains strict; a missing language pack does not silently send text to a cloud route.
- `build/Release/tuff-native-translation` is a required macOS packaged artifact,
  unpacked from asar and included in the Resources native module copy. The existing
  rebuild-preservation and after-pack gates cover it, including executable mode.

### 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| Other platform, macOS <26, or missing executable | `supported: false`, `ready: false`; no runtime injection |
| Language assets absent or not yet ready | `SYSTEM_TRANSLATION_NOT_INSTALLED` |
| Unsupported language or pairing | `SYSTEM_TRANSLATION_UNSUPPORTED_LANGUAGE` |
| No identifiable source language | `SYSTEM_TRANSLATION_UNABLE_TO_IDENTIFY_LANGUAGE` |
| Empty text | `SYSTEM_TRANSLATION_EMPTY_TEXT` |
| Deadline / caller cancellation | `SYSTEM_TRANSLATION_TIMEOUT` / `SYSTEM_TRANSLATION_ABORTED` |
| Child exit or malformed frame/result | `SYSTEM_TRANSLATION_PROCESS_EXITED` / `SYSTEM_TRANSLATION_INVALID_RESPONSE` |

### 5. Good / Base / Bad Cases

- Good: installed English and Simplified Chinese enable the route; repeated
  plugin translations reuse the helper and return a complete widget result.
- Base: unsupported hosts retain their existing translation providers.
- Bad: advertise availability from an OS check alone, use a SwiftUI-only session
  as a background provider, or spawn and compile Swift for every keystroke.

### 6. Tests Required

- Release regressions remove only the translation helper from an otherwise
  complete Resources tree and reject it; rebuilding preserves helper bytes and mode.
- Real native smoke covers automatic and explicit language selection, multiline
  text, same-language requests, missing packs, cancellation, deadline and recovery.
  Recovery includes ambiguous Chinese immediately after helper termination,
  without an intervening readiness probe.
- Real Electron smoke executes the unmodified translation prelude through the
  production host intelligence service and SDK, observes `system-translation`
  widget results, and confirms the stored config contains neither provider nor binding.
- Process-level network denial is not whole-machine offline evidence: translationd
  is a separate system service. Report that distinction. macOS 27 was exercised;
  macOS 26 hardware and signed installed-app verification remain separate release gates.

### 7. Wrong vs Correct

```ts
// Wrong: a synced platform flag claims that the machine has usable language packs.
provider.enabled = process.platform === 'darwin'

// Correct: probe before the first runtime config application; do not persist it.
await getSystemTranslationStatus({ timeoutMs: 5_000 })
if (isSystemTranslationAvailable()) providers.unshift(nativeTranslationProvider)
```
