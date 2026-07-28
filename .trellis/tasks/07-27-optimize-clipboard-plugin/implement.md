# Clipboard History Implementation Plan

1. Add RED view tests for keyword request construction, debounce, query+filter composition, page reset, stale-response isolation, clear query, empty results, history-update refresh, and retry.
2. Add focused SDK/host contract coverage only if existing tests do not prove keyword + type/favorite + timestamp-desc pagination behavior.
3. Refactor the current load function just enough to centralize request generation and stale-result guards; do not introduce a generic search framework.
4. Add the search input to the existing control area and preserve the current list/detail layout and action bar.
5. Replace populated-state whole-page blur with restrained inline loading feedback; add query-specific empty/error/retry states.
6. Verify keyboard selection, copy, paste, favorite, delete, image resolution, pagination, and live history refresh while a query is active.
7. Run plugin tests, typecheck, build, manifest validation, scoped lint where available, and `git diff --check`.
8. Perform final UI checks in light/dark and wide/narrow plugin windows.

## Validation Commands

```bash
pnpm --filter @talex-touch/clipboard-history-plugin test
pnpm --filter @talex-touch/clipboard-history-plugin typecheck
pnpm --filter @talex-touch/clipboard-history-plugin build
pnpm plugins:validate
git diff --check
```

## Guardrails

- No SearchSDK or new shared abstraction.
- No database schema, transport, permission, or host search-engine changes unless a focused failing contract test proves the current SDK path cannot satisfy the PRD.
- Keep changes centered on `plugins/clipboard-history` and the smallest necessary existing contract tests.

## Rollback Points

- Request-state refactor before UI wiring.
- Search control before loading/error visual changes.
- No data migration rollback is required.
