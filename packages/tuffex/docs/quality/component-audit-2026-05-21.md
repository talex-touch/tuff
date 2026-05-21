# TuffEx Component Audit - 2026-05-21

## Scope

This audit covers the current `packages/tuffex` docs build rendered through VitePress preview.

## Inventory Reconciliation

| Surface | Count | Result |
| --- | ---: | --- |
| Source directories | 108 | PASS |
| UI component source directories | 107 | PASS |
| Non-UI source directories | 1 | PASS |
| `packages/components/src/components.ts` exports | 107 | PASS |
| Component docs pages | 110 | PASS |
| VitePress sidebar component links | 110 | PASS |
| Component index links | 110 | PASS |

Notes:

- `utils` is a non-UI source directory and is excluded from component export / docs page requirements.
- `avatar-variants`, `chat-composer`, and `typing-indicator` are split documentation pages / sub-component pages, not missing source directories.
- Every UI source component directory is exported and has a docs page.
- Every docs page except the component index is reachable from the sidebar and component index page.

## Browser Evidence

| Check | Result | Artifact |
| --- | --- | --- |
| Inventory and page matrix | PASS | `output/playwright/tuffex-component-audit/2026-05-21/inventory-report.json`, `packages/tuffex/docs/quality/component-page-matrix-2026-05-21.md` |
| Desktop static component pages | 111/111 PASS | `output/playwright/tuffex-component-audit/2026-05-21/desktop-static-report.json` |
| Mobile focused component pages | 37/37 PASS | `output/playwright/tuffex-component-audit/2026-05-21/mobile-focused-report.json` |
| Light / dark theme component pages | 222/222 PASS | `output/playwright/tuffex-component-audit/2026-05-21/theme-static-report.json` |
| Interactive smoke checks | 26/26 PASS | `output/playwright/tuffex-component-audit/2026-05-21/interaction-smoke-report.json` |

Interactive smoke coverage:

- Select basic selection
- FlatSelect open/select
- Checkbox toggle
- Radio standard selection
- FlatRadio selection
- Switch toggle
- Textarea input update
- NumberInput step control
- DataTable sort and row selection
- Modal open/close
- Tooltip click toggle / outside close
- Popover click toggle / Escape close
- Drawer open/close
- CommandPalette filter and select
- Toast show/dismiss
- DatePicker open/confirm
- Cascader single selection
- TreeSelect single selection
- Transfer move item
- Slider keyboard update
- VirtualList scroll windowing
- FileUploader drop/remove
- ImageUploader input/remove
- CopyButton clipboard state
- ChatComposer send
- Tabs switch

## Fixes Covered

- Reworked the GlassSurface basic example into an isolated Vue demo so the rendered preview no longer leaks Markdown / HTML source text.
- Reworked the Input affix-slot example into an isolated Vue demo so the rendered preview no longer emits raw slot markup or mobile page overflow.
- Stabilized docs runtime and hydration for ChatMessage, Scroll, and Stagger demos.
- Fixed Input flex shrink overflow, StatCard stable visible value / insight rendering, and Tabs active content synchronization.
- Reconciled component source, exports, docs pages, sidebar links, and component index entries.
- Added `packages/tuffex/scripts/audit-docs-inventory.mjs` and `packages/tuffex/docs/quality/component-page-matrix-2026-05-21.md` so component inventory and page evidence can be regenerated from the current repository state.
- Added `packages/tuffex/scripts/audit-docs-interactions.mjs` so the 26 interaction smoke checks can be rerun against a live docs preview and Chrome CDP session.
- Added `packages/tuffex/scripts/audit-docs-pages.mjs` so desktop, mobile, and light/dark theme screenshot audits can be rerun against a live docs preview and Chrome CDP session.

## Completion Evidence And Scope Limits

- Full component inventory is reconciled from the source directories, package exports, docs pages, VitePress sidebar, and component index.
- Every docs component page, including the component index, has desktop screenshot evidence.
- Every docs component page has both light and dark theme screenshot evidence.
- The mobile pass is focused on high-risk pages where narrow layouts commonly fail: form controls, navigation, overlays, uploaders, virtualized content, chat, and the newly added small primitives.
- Interaction smoke is focused on stateful or overlay-heavy components. It covers representative user-visible flows rather than every prop permutation.
- The audit is considered complete for rendered docs quality and representative component usability; exhaustive prop-level behavior remains covered by focused unit tests and future component-specific work.

## Known Gaps

- This is a broad rendered-page and focused interaction audit, not exhaustive behavioral coverage for every prop combination of all 107 source components.
- The browser artifacts under `output/playwright/...` are ignored local evidence and are not committed.
