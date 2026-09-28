# macOS watcher startup CPU: proposed design

Status: implemented and locally verified with partial host acceptance. Risk: **R2**, because filesystem event delivery crosses backend, indexing, lifecycle and platform boundaries.

## Decision

Preserve the existing file-search roots and move macOS depth-24 file-watch registration to an event-only FSEvents backend rather than enumerating all existing descendants merely to attach a watcher. Keep existing Chokidar behavior for shallow app-catalog watches and all Windows/Linux paths.

This is a candidate design, not a claim that the raw native research probe is a complete fix. The first implementation gate must verify the real watcher/consumer contract; if achieving parity requires a broader indexing redesign, stop and return with a revised scope rather than weakening freshness or widening this PR.

### Integration amendment: prefer foreground responsiveness over cold-scan throughput

The live beta investigation separated two costs: watcher registration is avoidable duplicate traversal, while the intentional cold full scan remains sustained background work. The integrated candidate therefore keeps the event-only watcher and also restores one fixed 100 ms cooperative pause after every persisted full-scan chunk. The existing proportional backoff still wins for chunks at or above 250 ms. Because the scan worker waits for each 500-record batch acknowledgement, this single pause backpressures traversal and writes without adding a queue or retaining another batch.

The shared directory vocabulary also excludes `uvcache`, `__pycache__`, and `site-packages` at traversal, watcher, write, and read-time boundaries. These are generated Python dependency/cache trees; ordinary context-dependent folders such as `build` retain the sibling-marker rule.

This deliberately increases first-index wall time. It does not change mutation ordering, the max-size 10 AIMD ceiling, the 250 ms congestion threshold, or the single-writer topology.


### Alternatives

- **Narrow the default roots:** low engineering cost, but silently reduces the current searchable/watchable scope. Rejected as the production fix; permitted only as a diagnostic comparison.
- **Disable scheduled auto-scan:** does not disable watcher registration. Rejected as a fix for this measured path.
- **Move unchanged Chokidar into a worker:** can reduce main-thread contention but retains cardinality-dependent startup CPU and memory. Not sufficient alone for the fan/high-total-CPU objective.
- **Use raw FSEvents without a compatibility layer:** avoids enumeration but loses write stabilization and synthesized descendant events. Rejected.
- **Event-only registration plus bounded incremental/subtree handling:** preferred, conditional on the compatibility gates below.

## Module interface and dependency decision

- Add a private macOS file-watch module next to `file-system-watcher.ts`; its interface exposes only the operations the owner needs: register a root, deliver typed changes/invalidation/errors, and asynchronously close. The existing Chokidar adapter and native adapter are the two concrete variations at this seam; do not introduce a reusable public framework or raw IPC.
- Use `fsevents@2.3.3`, already present transitively in `pnpm-lock.yaml`; declare it explicitly as a platform-optional CoreApp dependency instead of relying on a transitive/hoisted import. This manifest change is part of the implementation approval request. Do not upgrade native package versions or execute package install scripts casually.
- Runtime-load it only on macOS and only for deep file roots. Missing/unloadable native capability must be visible as degraded/error and recoverable; do not silently claim a working watcher or silently revert to an unbounded startup crawl.
- Retain the existing backend on other paths/platforms. Native load failure and packaging availability are mandatory tests.

## Event contract

1. Register the native stream before any optional diagnostic work. No initial recursive enumeration and no initial per-file event burst. Keep the current initial full indexing scheduler independent and unchanged.
2. Normalize root aliases/canonical paths without changing the application's logical indexed identity. Reuse existing case/path policies and prove `/var` versus `/private/var` behavior with actual filesystem fixtures.
3. Apply current traversal exclusions, Photos restrictions and depth policy before scheduling work. Preserve ordinary personal folders named `build` and the existing project-sensitive filtering behavior.
4. For file-level native events, use the native type/flags plus a bounded stat where necessary to distinguish current existence. Preserve creation/change/removal and rename/atomic-save outcomes. Reuse downstream indexed-source mutation ownership, coalescing and database writer paths.
5. Preserve the 500 ms write-settle intent without idle polling: only changed paths may schedule bounded follow-up checks. Tentative bounds for the acceptance fixture are four concurrent metadata checks and 1,024 distinct pending paths; overflow must invalidate a scope, not allocate without bound or silently drop changes.
6. Directory moves/creation/removal, native event loss and `MustScanSubDirs` cannot be treated as ordinary single-file changes. Add one typed internal subtree-invalidation event owned by the file source if existing events cannot carry that contract. Keep permission recovery semantically distinct; do not repurpose `FILE_WATCH_ROOT_RECOVERED` as a generic dirty notification.
7. Add a narrowly scoped, bounded subtree bridge at the existing file-provider/runtime boundary: stream admitted descendants through existing scan/write machinery, and page existing indexed descendants for disappearance/rename cleanup. Preserve original-root depth accounting and cancellation. Do not collect whole subtrees in memory or issue one unbounded database delete per event.
8. **Do not use the current `reconcileIndexedSource(request.roots)` as though it were scoped:** it ignores those roots. The subtree bridge must prove its actual I/O/write scope and must not schedule a whole-home scan for an ordinary directory event. This is necessary event parity, not permission to refactor generic reconciliation.
9. Handle symlinks/aliases explicitly. Do not silently change the existing admitted-target behavior, escape configured scope, or duplicate an unbounded number of native streams. If parity cannot be bounded without initial discovery, report that as a design-blocking case before release.

## Lifecycle and failure paths

- The watcher owner retains native stop functions and pending work. Teardown stops intake, cancels follow-up checks, awaits stream stops, and prevents late callbacks from reaching disposed consumers.
- Permission denial continues through the established pending-path/recovery lifecycle; do not trigger new consent prompts merely by launching.
- Root removal, permission revocation, duplicate registration, close-during-registration and failed native registration must have deterministic tests.
- New errors use existing logger/operational error conventions and redact personal root paths in published evidence.

## Validation and rollback

- Stage 1: dependency-level lower-bound research is complete; application-level causality is not.
- Stage 2: add a failing test across the real watcher boundary and exercise the consumer with synthetic create/change/delete/rename/subtree cases.
- Stage 3: compare baseline and candidate builds on identical generated data profiles and roots, at least three runs each. Use the existing isolated user-data guards and verify the effective profile before launch. No private profile copying, production database rebuilding, or installed-app replacement.
- Test startup with an existing synthetic index separately from a first full scan. Watcher registration must not be conflated with intentional indexing work.
- Revert the task patch or stop/delete only owned temporary test profiles to roll back. Keep the signed application and ordinary user profile untouched.

## Local acceptance budgets

- On 20,000 admitted existing files, deep-watch registration performs at most 64 instrumented stat/lstat/readdir calls per configured root, independent of fixture cardinality; median watcher-process CPU through registration plus 500 ms is at most 10% of the same-run baseline median.
- New synthetic files become observable through the production pipeline within 2 seconds after a settled write; subtree convergence has a bounded, measured deadline based on the fixture size and must remove stale old paths as well as insert new paths.
- After the synthetic app index is warm and all indexing work is confirmed idle, observe 60 seconds: main-process CPU median at most 10%, no event-loop stall of 2 seconds or more, and a material reduction in app-process-group CPU versus baseline. If unrelated modules prevent this, report partial improvement rather than claiming the user's symptom fixed.
- These are this-host acceptance budgets, not a new cross-platform product SLA. Windows/Linux runtime, Intel macOS, long-duration indexing and other macOS versions remain explicitly unverified.

## Expected write scope

`apps/core-app/src/main/modules/box-tool/file-system-watcher/`, its private backend/tests; the minimum typed event and indexed-source/subtree bridge consumers/tests needed for parity; `apps/core-app/package.json` and `pnpm-lock.yaml` only for the explicit existing native dependency; one reproducible benchmark/probe; focused main-process spec/task/release-note evidence required by upstream.

Do not change database schema, search ranking, clipboard/OCR, renderer animation, auto-update, installed-app binaries or permanent user settings.

## Upstream integration

The source baseline is not a claim about the newest upstream HEAD. Read `research/upstream-overlap.md` and refresh before implementation: upstream PR #1999 overlaps provider/diagnostic startup measurements, and native-addon preservation changed after this checkout. Rebase the eventual focused branch rather than bundling their changes or attributing their improvement to this fix.
