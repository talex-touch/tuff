# SearchSDK Implementation Plan

1. Add RED tests under `packages/utils/__tests__/plugin-search-sdk.test.ts` for matching classes, weights, ranges, stable ties, duplicates, Unicode, limit, abort, and incremental-vs-one-shot equivalence.
2. Implement the generic in-process SearchSDK in `packages/utils/plugin/sdk/`, reusing `fuzzyMatch` and range conversion from `packages/utils/search/`.
3. Export the API from `packages/utils/plugin/sdk/index.ts`; avoid changing the existing `ISearchManager` in the same step.
4. Add focused API documentation and a Clipboard-shaped example without importing Clipboard domain types into the SDK.
5. Run focused tests, utils typecheck/lint available gates, and `git diff --check`.
6. Run a review for data ownership, bounded memory, deterministic ordering, Unicode ranges, and accidental CoreBox sorter coupling.

## Validation Commands

```bash
pnpm --filter @talex-touch/utils exec vitest run __tests__/plugin-search-sdk.test.ts __tests__/search/fuzzy-match.test.ts
pnpm --filter @talex-touch/utils lint
pnpm --filter @talex-touch/utils exec tsc --noEmit
pnpm plugins:validate
git diff --check
```

If the package has no standalone typecheck config accepted by the third command, record that as an existing tooling limitation and use the repository's canonical typecheck command discovered during execution.

## Rollback Points

- After tests but before export: implementation remains private and removable.
- After export but before Clipboard adoption: revert additive export only.
- No migration or persisted data rollback is required.
