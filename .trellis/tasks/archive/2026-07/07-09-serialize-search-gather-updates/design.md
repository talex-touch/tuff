# Technical Design

## Design Intent

Make the gather callback a real asynchronous boundary. Provider searches remain
concurrent, but every update callback is observed in emission order and a single
terminal update owns completion.

The task does not introduce request-scoped sessions or a new renderer protocol.
It fixes the ordering contract that those later changes depend on.

## Invariants

1. `TuffAggregatorCallback` may return `void` or `Promise<void>`.
2. Only one dispatcher invokes the callback.
3. Callback invocation is FIFO for updates that remain valid.
4. The first terminal update wins and is invoked at most once.
5. A terminal request waits for the callback already running, skips queued
   non-terminal updates, and prevents future updates.
6. Normal completion and external cancellation settle `IGatherController.promise`
   only after the winning terminal callback settles.
7. Callback rejection preserves the original error, aborts provider work, and
   rejects the controller. It does not emit a cancellation callback.
8. Producers await dispatch, so pending callback work is bounded by configured
   provider worker concurrency.

## Current Race

```text
provider result
  -> onUpdate(async) starts merge/rank
  -> gather ignores returned Promise
  -> gather emits final update
  -> SearchCore sends search.end
  -> earlier merge/rank finishes
  -> SearchCore sends search.update after search.end
```

Cancellation has the same structural problem. `cancelSearch()` sends
`search.end` immediately, while an in-flight callback can still finish and
publish an update. The gather abort listener also invokes a terminal callback,
creating two completion owners.

## Shared Callback Contract

Change the shared signature only:

```ts
export type TuffAggregatorCallback = (update: TuffUpdate) => void | Promise<void>
```

`IGatherController` remains compatible:

```ts
export interface IGatherController {
  abort: () => void
  promise: Promise<number>
  signal: AbortSignal
}
```

Synchronous consumers continue to work without adapters.

## Ordered Update Dispatcher

Add a small CoreApp-local dispatcher used by `search-gather.ts`. Its state is:

```ts
type DispatchState = 'open' | 'terminal-pending' | 'terminal-delivered' | 'failed'
```

The dispatcher owns a Promise tail and a terminal generation:

```ts
interface GatherUpdateDispatcher {
  emit: (update: TuffUpdate) => Promise<'delivered' | 'skipped'>
}
```

### Non-terminal emission

1. Reject immediately if the dispatcher has failed.
2. Return `skipped` if a terminal update is already pending or delivered.
3. Append the callback invocation to the Promise tail.
4. Before invocation, compare the captured generation with the current terminal
   generation. A mismatch means cancellation/finalization invalidated this
   queued update, so return `skipped` without calling the consumer.
5. Await the callback and return `delivered`.

### Terminal emission

1. The first `isDone: true` update changes state to `terminal-pending` and
   increments the terminal generation.
2. Existing queued non-terminal tasks remain in the tail but skip callback
   invocation when they observe the generation change.
3. The currently running callback is not preempted; the terminal callback runs
   immediately after it settles.
4. Duplicate terminal calls share the first terminal Promise and do not invoke
   the callback again.
5. Successful terminal delivery changes state to `terminal-delivered`.

### Failure

If the consumer rejects, store the original error and change state to `failed`.
The dispatcher and controller reject with that same error. Later emissions also
reject with it and do not invoke the callback.

## Bounded Backpressure

Do not add a detached array of result callbacks. Every result-producing path
awaits `dispatcher.emit()`:

- late fast provider result;
- deferred provider result;
- immediate fast batch;
- empty-provider terminal;
- final terminal;
- cancellation terminal.

Fast and deferred provider workers still execute up to their configured
concurrency. Once a worker has a result, it waits for ordered delivery before
taking another provider. Therefore outstanding dispatcher calls are bounded by
the active worker counts plus the coordinator's current emission.

Provider execution errors and callback errors remain separate. Record provider
status inside the provider try/catch, then await result delivery outside that
catch. A callback rejection must not be rewritten as `provider failed`.

## Controller Settlement

Keep explicit, idempotent resolve/reject functions in `createGatherController()`.
The layered executor remains responsible for normal and cancellation resolution:

```text
normal terminal callback settled -> resolve(totalCount)
cancellation callback settled    -> resolve(0)
callback rejected                -> abort providers internally -> reject(error)
```

Use an internal abort reason for callback/executor failure. The abort listener
checks this reason and does not enqueue a cancellation update for an internal
failure. External `abort()` remains idempotent and requests the cancellation
terminal update.

The controller may resolve cancellation before providers that temporarily
ignore `AbortSignal` return, but only after the cancellation callback settles.
Those late providers cannot publish because the dispatcher is terminal.

## SearchCore Completion Ownership

The async gather callback remains the owner of merge/rank and transport sends.
Because gather awaits it, earlier update work settles before the final callback
sends `CoreBoxEvents.search.end`.

Cancellation follows the same path:

1. `cancelSearch(searchId)` aborts the current controller and clears current
   ownership state.
2. It does not send `search.end` directly.
3. The ordered cancellation update carries `cancelled: true`.
4. SearchCore handles that terminal update without running merge/rank on an
   aborted signal, resolves the initial search result if still pending, performs
   cleanup, and sends exactly one `search.end` with `cancelled: true`.
5. Any callback already running finishes before this cancellation callback.
   Queued and future non-terminal callbacks are skipped.

This changes completion timing, not destination routing. SearchCore still uses
the current legacy window transport until the session/stream child replaces it.

## Ordering Matrix

| Scenario | Callback order | Controller result |
| --- | --- | --- |
| No providers | terminal empty | resolves `0` after callback |
| Fast only | fast terminal | resolves count after callback |
| Fast plus deferred | fast, deferred results, final terminal | resolves count after final callback |
| Fast timeout | fast partial, late/deferred results, final terminal | resolves final count |
| External abort while idle | cancellation terminal | resolves `0` |
| External abort during callback | running callback, cancellation terminal | resolves `0` after terminal |
| Callback rejection | callbacks through failing callback only | rejects original error and aborts providers |
| Duplicate abort/final request | first terminal only | first settlement wins |

## Compatibility

- No event names or payload shapes change.
- Synchronous callbacks remain valid.
- Provider concurrency settings retain their meaning.
- Search result ranking and provider priority are unchanged.
- `cancelSearch()` remains a synchronous command; only completion publication is
  deferred until the ordered cancellation callback.

## Rollback

The callback type, dispatcher, awaited emission sites, and SearchCore completion
ownership form one atomic change. Do not roll back only selected emission paths;
mixed awaited and unawaited callbacks recreate the race.

If callback latency causes unacceptable evidence, revert the child as one unit
and keep the failing async-order tests for the next design. Do not restore split
cancellation completion ownership.

## Test Strategy

- Shared contract test accepts both synchronous and asynchronous callbacks.
- Dispatcher/gather tests deliberately delay callbacks and assert completion
  order, not only invocation order.
- Late-fast and deferred providers prove result producers await delivery.
- A blocked callback plus `abort()` proves queued updates are skipped and one
  cancellation terminal runs next.
- A rejecting callback proves original-error rejection and provider abort.
- A provider barrier proves configured provider searches still overlap.
- A SearchCore-focused test proves `search.update` cannot follow terminal
  `search.end` and cancellation sends one end with `cancelled: true`.
