# Design

## Boundaries

This task touches the app index to CoreBox recommendation path:

- Main process app search mapping.
- Main process recommendation item rebuilding.
- Renderer CoreBox icon and badge display.
- Focused tests around those boundaries.

The shared `TxIcon` component should remain behavior-compatible. This fix should pass better metadata into the existing component instead of changing global icon semantics.

## Data Flow

1. Platform app scanners store icon values in app row extensions.
2. `search-processing-service.ts` maps scanned rows into `TuffItem.render.basic.icon`.
3. Recommendation engine/rebuilder enriches those `TuffItem`s with recommendation metadata.
4. CoreBox list/grid components normalize and render `render.basic.icon`.
5. Badge components render `meta.recommendation.badge`.

## Icon Contract

App recommendation icons should resolve to one of:

- `{ type: 'url', value: <data-url>, colorful: true }`
- `{ type: 'url', value: <tfile-url>, colorful: true }`
- `{ type: 'url', value: <remote-or-existing-url>, colorful: true }`
- `{ type: 'class', value: 'i-ri-apps-line' }` for missing or empty icons

`file://` values should be converted to `tfile://` after verifying the decoded filesystem path exists. Existing `tfile://` values should be preserved as URL values without filesystem re-checking.

Plugin candidate icons should keep supported fields: `type`, `value`, `color`, `colorful`, `status`, and `error`.

## Badge Contract

Recommendation badges should store icon class names, not emoji. Renderer components should render them through `<i :class="...">` with `aria-hidden="true"`.

Suggested mapping:

- frequent: `i-ri-fire-line`
- time-based: `i-ri-time-line`
- recent: `i-ri-history-line`
- trending: `i-ri-line-chart-line`
- context: `i-ri-sparkling-line`
- plugin: `i-ri-puzzle-line`
- default: `i-ri-lightbulb-line`

## Compatibility

Existing cached app rows may contain old empty icon values, local paths, `file://`, or `data:` URLs. The resolver handles each input without requiring database migration.

Renderer fallbacks remain available for unrelated invalid icons, but app recommendations should avoid producing empty icon values.

## Rollback

Rollback is a code revert of the touched mapping/rendering files. No data migration or persistent state mutation is introduced.
