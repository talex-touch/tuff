# Design

## Ordered implementation

1. Bound content admission and retained results, reuse existing WorkerStatusSnapshot, repair observation-induced idle extension, and distinguish cumulative scheduler counters from current backlog.
2. Remove bulk icon extraction, deliver generated file icons as cache paths through the existing tfile plane, and route writes to the owning SQLite writer.
3. Convert old file-icon data URLs in byte-bounded keyset pages with atomic file creation and compare-before-update semantics.
4. Add content-free native crash lifecycle diagnostics to the existing Sentry Electron integration and verify restart delivery in isolation.
5. Run focused validation, 100k file load and a three-hour isolated soak; preserve real profiles and all concurrent work.

## Memory ownership contract

- The shared IndexedWorkerSchedulerService owns a globally bounded queue: default one active batch plus one queued batch; chunkSize remains 30. schedule(batch) returns { accepted, deferred } record counts. Overflow is not retained in another timer or promise queue. getSnapshot() returns activeBatches, queuedBatches, pendingRecords and deferredRecords. Closed/cancelled scopes never launch work.
- FileProvider persists dirty enrichment status before admitting newly changed records. The existing file_index_progress and enrichment-resume service own overflow; no parallel queue database. Resume must not skip unadmitted page suffixes or duplicate active file versions.
- A batch's admission credit remains held until its content results have been persisted and published, not merely until Worker 'done'. FileIndexWorkerClient may use an optional second constructor callback afterBatch: () => Promise<void> for this barrier, while preserving cancellation and error settlement. It must not call the scheduler-wide drain from inside its own active batch.
- Each result has a 1 MiB conservative payload budget; admitted batch/results have a 32 MiB budget including pending and inflight ownership. Oversize output is an explicit failed file result, never a dropped successful result. Worker parsing remains serial. Byte estimates must not serialize/copy large objects solely to count them.
- Runtime getBufferSnapshot() reports pending, inflight, pendingBytes and inflightBytes. Capacity/credit failures must stop upstream, not discard authoritative work. Mutation leases fence stale results; new-version work must not be overwritten by an older deferred result.
- No waiting on a future foreign source lease while holding the current mutation gate. Same-lease publication and shutdown cancellation ordering stay explicit.

## Storage and native boundaries

- Preserve the existing icon value column and path rendering contract; no replacement media framework. New file-icon writes contain paths, not image strings. Generated files have bounded dimensions/bytes and opaque cache names.
- macOS AppKit remains on its approved main-thread native path and returns descriptors; no NSImage/Buffer round-trips. Migrate every existing consumer of a changed icon method, including native/Everything, openers and Windows app icons.
- Only exact owned cache subdirectories may be added to tfile roots. Never broaden home or the whole cache directory.
- New writes cut over first; bounded conversion verifies disk bytes before a compare-and-update of the old value. Conversion errors preserve original data; no mass deletion, VACUUM or real-profile migration in verification.

## Verification boundaries

Use isolated synthetic databases/profiles. Test authors own tests; production implementation owners skip validation until their mutation wave settles. Main runs verification and owns integration. Sentry server receipt requires authenticated access; an HTTP enqueue or local dump alone is not backend receipt proof.

## Icon cutover API contract

- IconService.getFileIconPath(filePath: string, size?: number): Promise<string | null> replaces extractFileIcon. Default size 64, maximum dimension 256. The result is a validated path, never a data URL or Buffer. Global file-icon admission is at most 64 distinct in-flight requests; deduplicate by canonical source identity and size, retain at most 256 lightweight cache entries, and return null when optional work cannot be admitted.
- IconWorkerClient.extractToFile(filePath: string, outputPath: string, size?: number): Promise<string | null> replaces extract. Request includes outputPath; done carries path, not buffer. Windows extraction writes its PNG inside the worker; macOS uses existing main-thread writeDarwinAppIcon and never calls extract-file-icon inside a worker.
- One Node-only file-icon-artifact helper owns PNG validation, content-hash naming and atomic writes, with FILE_ICON_MAX_BYTES = 1 MiB and maximum dimension 256. Export persistFileIconPng(bytes: Uint8Array, cacheDirectory: string): Promise<string> for bounded legacy conversion. IconService uses the same helper to promote bounded native output; no second storage implementation.
- IconService.getFileIconCacheDirectory(): string returns the exact owned file-icons cache root (under Electron cache, with a userData-owned fallback). Protocol changes allow only that directory, not the whole cache or home.
- Every caller migrates: FileProvider asset service, Everything/native cache, opener service and Windows app icon generation. Cached app-icon reads on Windows may return the already-supported file path rather than re-encoding it.
- Main owns FileProvider/asset/opener integration, metadata-only invalidation of stale icon references, writer routing, tfile policy and late-write shutdown fencing. IconPaths owner owns IconService, IconWorkerClient/worker and the artifact helper; IconContracts owns tests only.
- Do not bulk-generate file icons during full scan. Existing render callbacks provide lazy demand; preserve custom per-file identity (do not merge every file solely by extension). New resources use tfile delivery. Migration is the subsequent phase, not part of the extraction owner.
