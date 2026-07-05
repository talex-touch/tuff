# Fix recommendation logo rendering

## Goal

Recommendation results in CoreBox should show the correct app/plugin logo and use a consistent recommendation badge style. The fix should preserve real logo colors, avoid generic fallback icons when valid icon data exists, and keep recommendation source indicators visually aligned with the app icon system.

## Confirmed Facts

- App recommendation items are built from app rows in `apps/core-app/src/main/modules/box-tool/addon/apps/search-processing-service.ts`.
- `resolveAppIcon()` currently returns `{ type: 'file', value: '' }` for empty app icons and falls back to `i-ri-apps-line` when `fs.existsSync(rawIconValue)` fails.
- Linux app scanning stores icon paths as `file://...` in `apps/core-app/src/main/modules/box-tool/addon/apps/linux.ts`, which `fs.existsSync()` does not treat as a filesystem path.
- CoreBox rendering only preserves original SVG colors when icon metadata sets `colorful: true`.
- Plugin recommendation rebuilding currently copies only `type` and `value`, dropping optional icon metadata such as `color`, `colorful`, `status`, and `error`.
- Recommendation badges currently use emoji strings for source icons.

## Requirements

- Valid app icon inputs must remain valid through recommendation mapping:
  - `data:` image URLs.
  - `file://` local file URLs.
  - `tfile://` local file URLs.
  - Existing local filesystem paths.
- Missing or empty app icons must use a predictable app fallback icon, not an empty file icon or unrelated puzzle fallback.
- Real app and plugin image logos must preserve source colors when rendered in CoreBox recommendation results.
- Plugin recommendation icon metadata must be preserved when rebuilding plugin candidates.
- Recommendation source badges must use the existing icon class system instead of emoji text.
- The change must not alter recommendation ranking, candidate selection, pinning, or action execution behavior.

## Acceptance Criteria

- [x] App recommendation mapping preserves valid `data:`, `file://`, `tfile://`, and local path icons.
- [x] Empty and missing app icons resolve to a stable app fallback icon.
- [x] Real app/plugin image icons pass `colorful: true` through to CoreBox renderers where needed.
- [x] Plugin recommendation rebuild keeps all supported icon metadata.
- [x] Recommendation badges render class-based icons in list and grid views.
- [x] Focused unit tests cover icon normalization, drift handling, plugin rebuild metadata, and renderer color forwarding.

## Out Of Scope

- Recommendation scoring or ordering changes.
- Re-scanning the user's local app index.
- Redesigning CoreBox layout beyond the logo and badge treatment.
- Changing unrelated icon rendering behavior outside CoreBox recommendation results.
