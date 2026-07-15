# Progressive CoreBox Search During First Index — Implementation

## Ordered implementation

1. Add the typed CoreBox search-index commit payload and stream event; include it in the existing MessagePort allowlist.
2. Add a main-process commit hub and wire post-success notifications from the main SearchIndexService and SearchIndexWorkerClient mutation paths.
3. Register the CoreBox stream, clear search cache before delivery, and clean up subscriptions/contexts during SearchEngineCore shutdown.
4. Subscribe in `useSearch`, implement fixed-window coalescing and trailing refresh, and preserve selection by item id.
5. Remove transient CoreBox search/recommendation/indexing hints and simplify result sizing code that only supported those cards.
6. Exercise the running CoreBox path after implementation. Only after the smoke succeeds, update focused tests required by the changed contracts and remove obsolete hint tests.
7. Run focused main/renderer tests, `typecheck:web`, `typecheck:node`, and `git diff --check`.
8. Commit only this task's code and Trellis artifacts; leave pre-existing Electron builder/package/lockfile changes untouched.

## Validation commands

```bash
corepack pnpm -C apps/core-app exec vitest run \
  src/main/modules/box-tool/search-engine/search-index-commit-hub.test.ts \
  src/main/modules/box-tool/search-engine/search-core.index-commit.test.ts \
  src/renderer/src/modules/box/adapter/hooks/useSearch.index-refresh.test.ts \
  src/renderer/src/modules/box/adapter/hooks/useResize.test.ts

corepack pnpm -C apps/core-app run typecheck:web
corepack pnpm -C apps/core-app run typecheck:node
git diff --check
```

Exact test filenames may follow the nearest existing harness if those modules use a shared contract test instead of one-file tests.

## Risk and rollback points

- Transport event type and allowlist must land together.
- Cache invalidation must happen before stream emission.
- Worker notifications must occur after successful replies, never at queue submission.
- Continuous commits must use a fixed coalescing window rather than debounce-until-idle.
- Rollback can remove the commit stream/subscription while retaining manual search; hint removal is independent.
