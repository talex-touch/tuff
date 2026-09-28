# File Watcher and Scoped Reconciliation Contracts (main process)

These contracts define the deep macOS file watcher boundary and its indexed-file consumer. They apply to `FileSystemWatcherModule`, `MacOSFileWatcher`, `IndexedSourceEventRouter`, and the file provider's subtree reconciliation path.

## 1. Deep macOS registration is event-only

The macOS watcher used for `FILE_SCAN_MAX_DEPTH` roots registers an FSEvents stream against the canonical root without recursively enumerating existing descendants. Shallow application watches and non-macOS watchers retain their existing Chokidar selection. The native module loads `fsevents` lazily and treats an unavailable optional binary as an explicit registration error.

`fsevents` is a CommonJS wrapper around a native addon and MUST stay external in the main-process Electron Vite build. If Rollup bundles it, the addon becomes an ESM namespace and `flags.SinceNow` is undefined at runtime even though source-level tests pass. Keep it in `externalizeDepsPlugin.include` and verify the built output retains `import("fsevents")` plus one real Electron registration/add/delete smoke.

The application may still schedule its independent initial index scan. That scan is separate from watcher registration and must not be used to justify recursive work performed by the watcher constructor or `add` method.

## 2. Logical paths remain stable

The watcher canonicalizes the native stream root only for event subscription. It emits the configured logical root and logical descendant paths so indexed identity remains stable across aliases such as `/var` and `/private/var`. A native path outside the canonical root, an excluded path, or a path deeper than the configured depth is ignored.

The watcher applies the existing traversal exclusion predicate to every path and its ancestors. It does not follow child symlinks into a second configured scope. A symlink event invalidates the smallest affected logical subtree so the provider can apply its own admitted-path and filesystem semantics.

## 3. File events are bounded and settled

File `add`, `change`, and `unlink` events are emitted only after bounded metadata inspection. At most four metadata checks run concurrently and at most 1,024 paths remain pending. Changed files use the existing 500 ms write-settle behavior with a bounded 30 second escape hatch. Overflow emits one root invalidation and resumes delivery after the invalidation has been queued.

The watcher does not poll idle paths. A metadata error other than `ENOENT` or `ENOTDIR` is emitted as an error and does not become a deletion. Native event loss, `MustScanSubDirs`, root changes, and directory changes are invalidations rather than ordinary file events.

## 4. Invalidations reconcile one admitted subtree

`FILE_WATCH_SUBTREE_INVALIDATED` carries `path`, `rootPath`, and one of `directory-change`, `event-loss`, `overflow`, or `symlink-change`. The router validates containment, coalesces descendants under an ancestor, bounds pending scopes, and routes each resulting scope to the file indexed source with reason `file-watch-subtree`.

The provider branch for this reason is the only scoped reconciliation path. It fixes a high-water database id before streaming scan batches, writes through the existing incremental mutation service, and pages existing file rows through that id for disappearance cleanup. SQL conditions match the exact scope or an escaped descendant prefix and retain `type = 'file'`. Permission and I/O errors propagate; only `ENOENT` and `ENOTDIR` mean that a path is absent.

Scoped reconciliation preserves the configured watch-root depth when a nested directory is scanned, passes cancellation through every scan/read/write/delete boundary, and never falls back to provider-wide indexing for an ordinary directory event. Batch sizes, page sizes, existence checks, and queued scopes remain bounded.

## 5. Lifecycle is awaited

Watcher shutdown stops intake before closing native streams, awaits registration and metadata work, and suppresses late callbacks. Router unsubscribe detaches producers, drains file/app queues and pending subtree reconciliations, then disposes the queues. Reconciliation uses the runtime's mutation lease and streaming sinks; it must not publish side effects through a second uncoordinated writer.

## Verification limits

The contract is verified by injected-backend lifecycle, overflow, alias, symlink, depth, cancellation, queue, and scoped-delete tests plus a live macOS native event test and the production watcher benchmark. A live symlink-heavy home tree, native kernel-overflow reproduction, and candidate packaged Electron idle-energy comparison remain host-acceptance gaps; they must be reported as partial evidence rather than silently promoted to product-wide guarantees.
