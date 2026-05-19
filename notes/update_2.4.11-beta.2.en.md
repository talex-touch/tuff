# Tuff v2.4.11-beta.2 Release Notes

## Highlights

- Added the Translation image flow: `touch-translation` can read clipboard images, call the configured local Intelligence image translation adapter, and open the result in a dedicated DivisionBox window.
- Fixed the DivisionBox open failure path and added layout options to hide the header and input chrome for lightweight plugin tool windows.
- App Index management now includes scanned app entries. Users can view, diagnose, enable, and disable scanned apps from Settings; disabled entries are removed from CoreBox indexing and recommendation mapping, while scanned entries remain non-removable.
- Everything now supports a custom `es.exe` CLI path and filters results through File Index watch roots before they reach CoreBox. Diagnostic evidence includes CLI path and path-filtering status.
- Added first versions of the official `touch-browser-data` and `touch-emoji-symbols` plugins, and added a `{{uuid}}` placeholder to `touch-snippets`.
- CoreBox PreviewSDK now supports explicit `calc`, `calculator`, `calculate`, `计算`, and `换算` calculator prefixes; ActionPanel can render actions from regular result items.
- Refreshed the Nexus plugin SDK workflow docs and TuffEx CommandPalette scenario demo, and added a Raycast/uTools capability gap matrix.
- Stabilized CoreBox scroll fallback to reduce native scrollbar fallback layout impact in the result area.

## Validation

- Passed focused Node tests for `plugins/touch-snippets`, `touch-emoji-symbols`, and `touch-browser-data`.
- Passed focused CoreApp Vitest coverage for Preview, App Index, and Everything.
- Passed `pnpm -C "apps/core-app" run typecheck:node` and `pnpm -C "apps/core-app" run typecheck:web`.
- `git diff --check` and per-batch `git diff --cached --check` passed.

## Known Limitations

- This is a `2.4.11` beta test build and does not mean the stable release gate is complete.
- Windows real-device evidence, performance baselines, and Nexus Release Evidence for Everything/App Launcher remain follow-up work.
- `typecheck:web` still prints the existing TuffEx dts warning about the `TouchScroll` entry export, but it does not block the current CoreApp typecheck.
