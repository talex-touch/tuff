# Clipboard History Implementation Plan

## Dependency Gate

Complete and verify `07-27-expose-plugin-search-sdk` before starting Clipboard History adoption.

## Ordered Checklist

1. Add RED tests for progressive full-history search: 100-item pages, incremental results, final coverage, stable Top-K, query/filter generation isolation, history-update restart, and transport errors.
2. Add RED component tests for Quick/Detail segmented mode, first-launch Quick default, preference restore, shared query/filter/selection, keyboard commands, coverage copy, and retry.
3. Extract a typed history/search orchestration composable from `ClipboardManagerView.vue`; retain one owner for SDK calls, generations, pagination, selection, and action errors.
4. Map Clipboard item types to SearchSDK fields without passing data URLs, binary content, or irrelevant serialized metadata.
5. Implement shared toolbar with search, filters, mode control, and truthful progress state using existing TuffEx primitives where suitable.
6. Implement Quick mode and adapt Detail mode to consume the same result projection and highlighted ranges.
7. Replace full-page blur loading with stable loading/progress states; preserve visible results on recoverable failures.
8. Verify copy, paste, favorite, delete, image resolution, live history updates, empty states, dark mode, focus, keyboard behavior, narrow layout, and reduced motion.
9. Run plugin tests/typecheck/build, SearchSDK tests, plugin manifest validation, scoped lint, and `git diff --check`.
10. Perform final integration review against the parent task before moving to Translation.

## Validation Commands

```bash
pnpm --filter @talex-touch/clipboard-history-plugin test
pnpm --filter @talex-touch/clipboard-history-plugin typecheck
pnpm --filter @talex-touch/clipboard-history-plugin build
pnpm --filter @talex-touch/utils exec vitest run __tests__/plugin-search-sdk.test.ts __tests__/search/fuzzy-match.test.ts
pnpm plugins:validate
git diff --check
```

## Visual Validation

Run the plugin dev surface and capture desktop plus narrow-window screenshots. Verify no overlap, clipped toolbar controls, blank detail pane, focus loss, or layout shift while search pages arrive. Exercise both light and dark themes.

## Rollback Points

- Search orchestration composable before UI adoption.
- Quick mode before moving filters/actions.
- Detail mode adaptation before removing old footer filters.
- No database or transport migration rollback is needed.
