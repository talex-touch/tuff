# Search latency repair design

## Decision

Short-lived `core-box:search:session` streams use existing typed channel transport by default. Remove that event from the Port allowlist; preserve explicit environment policy and existing subscription Port channels. No new live-upgrade protocol, retries, timeout suppression or event payload changes.

Keep SearchIndexService's public query methods and SQL source authoritative. Add an optional read executor supplied only by the runtime owner. A dedicated host-only worker executes those reads on the exact database file selected by DatabaseModule; existing index writer and main schema initialization remain unchanged. The connection asserts file existence before opening and enables query_only. No reader performs migrations, repair, indexing or writes.

## Shared interfaces and ownership

`search-index-service.ts` exports:

```ts
export interface SearchIndexReadExecutor {
  all<T>(query: SQL, signal?: AbortSignal): Promise<T[]>
}
```

`SearchIndexServiceOptions.readExecutor?: SearchIndexReadExecutor`. FTS/exact/prefix/ngram/subsequence/count/visibility methods route through one read helper; writer-side instances continue using their original DB. Existing query methods gain an optional trailing AbortSignal (subsequence retains scanLimit before signal). SQL aliases must preserve existing result shapes and numeric types.

`workers/search-index-read-worker-client.ts` exports:

```ts
class SearchIndexReadWorkerClient implements SearchIndexReadExecutor {
  constructor(databasePath: string, options?: {
    workerPath?: string
    timeoutMs?: number
    maxQueueDepth?: number
  })
  all<T>(query: SQL, signal?: AbortSignal): Promise<T[]>
  close(): Promise<void>
}
```

Use Drizzle's existing SQLite dialect to compile parameterized SQL; pass only host-owned SQL/arguments to the worker, never AbortSignal or Drizzle objects. One active native read, bounded parent queue, no unbounded worker mailbox. A queued abort removes/rejects its request. An active abort rejects its caller promptly but retains the physical slot until the worker completes or is terminated. No subsequent request starts on top of it. A finite operation timeout/worker error/exit and close settle every pending caller and clean listeners. No automatic replay or main-thread query fallback. Preserve original DB errors via existing worker error serialization where suitable.

Main owns port-policy.ts, CoreBox integration, provider AbortSignal callsites, runtime verification and existing docs updates. ReaderWorker owns new read worker/client/protocol and its electron-vite build registration. SearchQueries owns search-index-service.ts only. SearchTests owns test files only. No agent runs formatters/linters/build/tests during concurrent editing.

## Lifecycle and consistency

Core constructs a reader using getSearchDatabaseFilePath(), supplies it to SearchIndexService, and still awaits searchIndexWriter readiness before reader use. Existing waitUntilReadable commit barrier also traverses the reader connection. Destroy cancels sessions, disposes the reader and preserves the existing writer drain order. No persistent read transaction/snapshot may hide later commits. Query rules, full ranking and result payloads are unchanged.

## Verification

Permanent regressions target nonblocking search start, query parity, SQLite read-only enforcement, missing-file rejection, aborted queue/active-result fencing, timeout/shutdown and event-loop responsiveness. Real runtime verification uses an isolated app/profile and separately built artifacts, not the user's live instance. No production data mutation.

## Follow-up: ready data must already be visible

Remove the grid/list out-in mount gate from CoreBox. Render the current branch directly in the same patch as the selected-result footer, with the existing stable grid/list and item identities. Keep optional result-transition and list-stagger motion as cosmetic transform-only CSS on already-visible elements; remove opacity-zero entry states and the obsolete leave animation. Respect low battery and prefers-reduced-motion without requiring animation callbacks to make content available.

Main owns CoreBox.vue and isolated pixel verification. ResultPaintTests owns CoreBox.result-switch.test.ts regressions using the real Vue Transition (not VTU's automatic stub) with unserviced requestAnimationFrame callbacks, switching recommendation grid to list and rapidly replacing queries. NativePaintAudit is read-only over native window/frame scheduling and records whether additional changes are justified; no native changes without evidence. All agents skip builds/lint/test execution during editing.
