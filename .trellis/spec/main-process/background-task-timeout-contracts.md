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
  them, and per-item retries just burn one timeout each;
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

`[Perf:EventLoop]` reports name the culprit directly:

- `pollingActive` / `pollingRecent` carry `durationMs` and `maxDurationMs` per
  task — a `maxDurationMs` in the tens of seconds is an unbounded task.
- `queueDepthByLane` with a deep `serial` queue plus
  `suspectedCause=polling_queue_backlog` is the default-lane trap above.
- `contexts=[]` means no `Search.*` perf context was open, i.e. the stall is
  _not_ the search engine — look at the polling tasks.
