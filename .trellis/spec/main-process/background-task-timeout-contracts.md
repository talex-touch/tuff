# Background Task Timeout Contracts

Rules for anything that runs periodically or shells out on the main process.
Every search IPC, provider fan-out and DB read shares that one thread, so an
unbounded background task is a search latency bug.

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
- back off after N *consecutive* failures, not the first, so a transient hang
  still retries immediately (see #770, which requires the next lookup to re-run);
- reset the counter and the backoff window on success;
- throttle the failure log. 278 unthrottled ERROR entries in one session, each
  embedding an AppleScript source dump, is its own main-thread IO cost.

## `waitForIdle()`: bounded or not depends on who is waiting

`appTaskGate.waitForIdle()` with no argument waits forever. That is **correct**
for background work — yielding to app tasks is the entire point of the gate, and
bounding an indexing worker would just put it back in contention. It is a bug
for anything a user is waiting on. Classify before touching one:

| Caller | On timeout | Bound |
|---|---|---|
| Repeatable hot-path work (per-capture clipboard refresh) | **skip** — there is another chance next keystroke | `CLIPBOARD_APP_TASK_WAIT_MS` (200ms) |
| One-shot startup work (watcher start, cache hydrate, OCR) | **proceed anyway** — skipping means it never initializes | `APP_TASK_GATE_STARTUP_WAIT_MS` (10s) |
| Interactive entry point (`recommend()` on empty query) | **proceed anyway**, under the renderer's own give-up | 300ms (renderer gives up at 400ms) |
| Background indexing / maintenance | n/a | none — leave unbounded |

Two traps found in the one-shot category, both worse than "it's slow":

- A latch set before the wait and cleared only in the `.then()`
  (`coreBoxBaselineCaptureQueued`) stays stuck for the whole session if the gate
  never drains, so the work can never even be *scheduled* again.
- Failing to start the native clipboard watcher disables
  `shouldSkipUnchangedCapture`, which pushes a synchronous main-thread clipboard
  read onto every CoreBox show — a startup-path stall that degrades the search
  path.

The renderer awaits a clipboard refresh *before* it builds the query, so an
unbounded wait on that path stalls the entire search for as long as the
app-index scan runs.

### Adding an export to `app-task-gate` breaks its mocks silently

`vi.mock('../service/app-task-gate', () => ({ appTaskGate }))` factories list
exports explicitly. A module that starts importing a second binding
(`APP_TASK_GATE_STARTUP_WAIT_MS`) throws on *access*, and if that access sits
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
  *not* the search engine — look at the polling tasks.
