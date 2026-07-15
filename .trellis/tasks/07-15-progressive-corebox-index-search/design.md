# Progressive CoreBox Search During First Index — Design

## Boundaries

This slice adds a post-commit notification path; it does not use indexing progress as a proxy for durability and does not create a second search implementation.

```text
AppProvider -> main SearchIndexService commit ----\
                                                   -> SearchIndexCommitHub
FileProvider -> SearchIndexWorkerClient success --/          |
                                                              +-> clear SearchEngineCore cache
                                                              +-> typed CoreBox commit stream
                                                                       |
                                                                       v
                                                            useSearch bounded refresh
                                                                       |
                                                                       v
                                                       existing CoreBox search query path
```

## Shared transport contract

Add a shared payload beside the existing CoreBox transport types:

```ts
interface CoreBoxSearchIndexCommitPayload {
  revision: number
  providerIds: string[]
  committedAt: number
}
```

Expose it as a typed `AsyncIterable` stream under `CoreBoxEvents.search`. The main process registers it with `transport.onStream`; the renderer subscribes with `transport.stream`. No raw IPC channel or preload surface is added.

## Commit ownership

A main-process `SearchIndexCommitHub` owns a monotonic in-memory revision and subscriptions.

- `SearchIndexService` accepts an optional post-commit callback. Public mutations call it only after all awaited SQLite work for that operation succeeds.
- The main SearchEngineCore service supplies the hub callback.
- Worker-thread FTS writes cannot invoke the main callback. `SearchIndexWorkerClient` marks the hub after successful worker mutation responses, using provider ids from the submitted index items when available.
- Failed or empty mutations emit nothing. Generic id-only removals conservatively emit a global invalidation after their transaction succeeds because that API cannot recover provider ids or an affected-row count.
- Provider ids are deduplicated and sorted for deterministic payloads; unknown-source removals use an empty list to mean global invalidation.

SearchEngineCore subscribes once. For every notice it clears its query cache synchronously, removes cancelled stream contexts, then emits the typed payload to live contexts. Shutdown unsubscribes and closes live streams.

## Renderer refresh state machine

`useSearch` owns one local refresh scheduler:

- Ignore notices when the query is empty, CoreBox is not visible, or a plugin feature activation owns the input.
- First notice opens a fixed 500 ms window. Further notices set a pending flag without postponing the deadline.
- At the deadline, if a UI query is in flight, retain the pending flag and retry after the same bounded delay.
- Otherwise start one forced search through the existing query path.
- Notices received during that search schedule one trailing refresh.
- Unmount cancels the timer and stream.

A progressive refresh captures the currently selected item id before starting. After the fresh complete snapshot is accepted, it restores focus to that id when present; otherwise focus resolves to the first result or `-1` for an empty result.

The existing backend cache has already been cleared before the notice reaches the renderer, so `force` only needs to bypass renderer duplicate suppression.

## Hint removal

Remove three non-terminal hint surfaces:

- the searching result-area card;
- the recommendation warm-up result-area card;
- the empty-query indexing status tag.

Delete their pure state resolver, dedicated tests, component, styles, and locale keys when no references remain. Simplify `useResize` by removing `.CoreBoxSearchState` measurement branches. Preserve `CoreBoxEvents.search.noResults` and its existing collapse/sizing behavior; it is terminal no-result behavior, not a transient hint.

## Failure and lifecycle behavior

- Commit stream failure is logged and does not break manual search.
- A failed refresh leaves the existing `executeSearch` error behavior authoritative.
- No commit event is emitted before a durable mutation succeeds.
- Renderer teardown leaves no timer or stream controller.
- Main shutdown clears hub subscription and stream contexts.

## Compatibility

The commit hub observes both current legacy writer paths and the future runtime-owned writer path. The later single-writer migration can keep the same post-commit callback/stream contract while deleting duplicate providers.
