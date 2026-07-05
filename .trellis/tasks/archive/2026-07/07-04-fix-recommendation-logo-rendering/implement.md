# Implementation Plan

1. Read relevant frontend specs and app/recommendation tests.
2. Update app icon resolution in `search-processing-service.ts`.
   - Add helpers for `file://`, `tfile://`, `data:`, and local path handling.
   - Return stable app fallback for empty/missing icons.
   - Mark real image icons as `colorful: true`.
3. Update app icon drift handling if needed so `file://` paths are checked against the decoded filesystem path.
4. Update recommendation item rebuilding.
   - Preserve full supported plugin icon metadata.
   - Replace emoji fallback icon with a class icon.
   - Replace recommendation badge emoji with icon class names.
5. Update renderer badge components.
   - Render badge icons as icon classes in list view.
   - Include badge icon support in grid view.
6. Add or update focused tests.
   - `search-processing-service.test.ts`
   - `app-provider-metadata-sync.test.ts`
   - `item-rebuilder.test.ts`
   - CoreBox renderer icon/badge tests as needed
7. Run focused validation:

```bash
pnpm -C apps/core-app test -- src/main/modules/box-tool/addon/apps/search-processing-service.test.ts src/main/modules/box-tool/addon/apps/app-provider-metadata-sync.test.ts src/main/modules/box-tool/search-engine/recommendation/item-rebuilder.test.ts src/renderer/src/components/render/box-item-icon-color.test.ts
```

8. Run targeted type/lint only if implementation changes make focused tests insufficient or type contracts shift.

## Risk Points

- `file://` decoding must tolerate malformed URLs without throwing.
- `tfile://` values may not be directly checkable from main process; preserve them rather than treating them as missing.
- Badge icon changes should not change `meta.recommendation.source` or existing source labels.
