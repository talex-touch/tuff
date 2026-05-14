# Windows Search Diagnostics and Performance Report (2026-05-05)

## Scope

- Runtime: Core App on Windows.
- Issues covered: production crash observability, ChatApp launch failure, Windows Store app indexing, Everything backend fallback, startup/search lag, titlebar controls, and left logo spacing.
- Data safety: production logs were read only; database snapshot inspection was attempted but not performed because approval service returned 503.

## Findings

- Production main logs are effectively missing. `D.2026-04-20.log` through `D.2026-05-05.log` and matching `E.*.err` files under `%APPDATA%/@talex-touch/core-app/tuff/logs` are all 0 bytes.
- A crash dump exists at `%APPDATA%/@talex-touch/core-app/tuff/logs/crashes/reports/2628961b-d606-4d61-9933-b116968898ee.dmp`, around 34 MB, last written on 2026-05-05 11:34:24.
- The logging gap was caused by two combined behaviors:
  - `createLogger()` formatted to console and depended on the console/log4js bridge to persist.
  - `app-provider` and `file-provider` module loggers were disabled by default, hiding the most useful launch and Everything diagnostics.
- ChatApp was present in Start Menu as a `.lnk`, but the Windows scanner resolved shortcuts to target `.exe` and discarded the original shortcut path, args, cwd, and description. Launching the target directly can fail for shortcut-driven apps even when search finds the item.
- Windows Store apps were not indexed because the scanner only walked Start Menu `.lnk/.exe` paths. Store apps such as Codex and Apple Music surface via `Get-StartApps` / AppsFolder AUMID instead of traditional executable paths.
- The ChatApp square/garbled title was not a renderer-wide font failure. In the dev index snapshot, `name` for `D:\ChatApp\ChatApp.exe` was valid (`U+5FAE U+4FE1`), but `display_name` was stale corrupted data (`U+03A2 U+FFFD U+FFFD`). Search rendering preferred `display_name`, so the bad persisted value hid the clean app name.
- Startup lag risk is concentrated in app scan/backfill/full sync competing with renderer loading and active search. Existing code already tracked recent search activity, but app maintenance did not use it as a deferral signal.
- Everything already had `sdk-napi -> cli -> unavailable` fallback, but per-candidate backend errors were not retained for status diagnostics.
- Windows titlebar controls could become low contrast and visually covered by the header pseudo background. Flat layout also did not pass the Windows layout flag, so spacing fixes only applied to Simple layout.
- Windows active-app logs showed repeated PowerShell command failures without stderr/exit metadata. The likely trigger was an `out uint` Win32 binding receiving a default Int32 `[ref]` value, and the failure path logged the full command instead of the useful process output.

## Changes Implemented

- Persisted main diagnostics:
  - `createLogger()` now writes directly to log4js file appenders and serializes error stacks.
  - `console.info` now participates in the main process log bridge.
  - module logger output writes to main-process log4js sinks when available.
  - `app-provider` and `file-provider` default to enabled INFO logging.
- Fixed Windows app launch metadata:
  - `ScannedAppInfo` now carries `launchPath`, `shortcutPath`, `shortcutArgs`, `shortcutCwd`, `appUserModelId`, and `launchKind`.
  - Windows `.lnk` scanning preserves shortcut details while keeping existing target-path compatibility.
  - Execution logs item id, path, launch kind, shortcut path, target, cwd/args, `shell.openPath` return values, and stack traces.
  - Launch order is now shortcut `.lnk` first, then target path, then spawn fallback for args/cwd cases.
- Added Store app indexing:
  - Windows scanner reads `Get-StartApps` output with explicit UTF-8 encoding and stores AppsFolder launch paths.
  - package Appx manifests are inspected for `Square44x44Logo`/`Logo` assets and converted to data URL icons.
  - URL/PWA Start menu entries are stored as URL launches instead of invalid `shell:AppsFolder\\https://...` paths.
  - Traditional desktop apps returned by `Get-StartApps` with absolute-path AppIDs are treated as path launches, preventing fake AppsFolder paths and preserving better `.lnk` scan records during dedupe.
  - Store apps launch through `shell.openExternal('shell:AppsFolder\\AUMID')`.
  - AUMID and description are included in keyword generation and post-processing.
- Repaired corrupted app display names:
  - `display_name` values containing Unicode replacement characters or square glyphs are treated as unreliable.
  - Search rendering now falls back to the clean `name` field instead of showing corrupted `display_name`.
  - Startup backfill/full sync rewrites corrupted display names when scanner output has a clean value.
- Reduced startup/search contention:
  - production startup backfill is deferred an additional 15 seconds.
  - app backfill and full sync skip/defer when search was active in the last 5 seconds.
  - slow app search and post-processing timing logs already exist and now persist.
- Improved Everything diagnostics:
  - status payload now includes `backendAttemptErrors` for sdk/cli candidate failures.
  - existing fallback chain remains `sdk-napi -> cli -> unavailable`.
- Fixed Windows UI:
  - titlebar overlay uses a visible dark symbol color and 40 px main-window height.
  - header reserves 138 px for native caption controls on Windows.
  - Simple and Flat layouts both apply Windows logo spacing.
- Fixed Windows active-app diagnostics:
  - foreground process id is now declared as `[uint32]` before calling `GetWindowThreadProcessId`.
  - PowerShell stdout is parsed from the last JSON-looking line to tolerate warnings/noisy output.
  - command failures log compact `message`, `code`, `signal`, `stderr`, and `stdout` metadata with cooldown/backoff instead of repeating the full script.

## Verification

- Passed: `pnpm -C "apps/core-app" run typecheck:node`.
- Passed: `pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/apps/display-name-sync-utils.test.ts" "src/main/modules/box-tool/addon/apps/search-processing-service.test.ts" "src/main/modules/box-tool/addon/apps/app-provider.test.ts"`.
- Blocked by sandbox/approval service:
  - `vitest` target tests failed to start workers with `spawn EPERM`; escalated retry was blocked by approval service 503.
  - `typecheck:web` failed during tuffex build with `spawn EPERM`; escalated retry was blocked by approval service 503.
  - production database snapshot enumeration was blocked by approval service 503.
  - `git fetch origin`, merge, commits, and dev app launch were not completed for the same approval-service reason.

## Expected Performance Impact

- Startup: app maintenance no longer starts immediately after main boot in production and is more conservative during active search, reducing renderer/startup contention.
- Search: precise/FTS/post-processing paths are unchanged, but slow stage logs now persist and app AUMID keywords reduce Store-app recall misses.
- Index writes: app metadata updates remain batched through existing adaptive queues and SQLite retry/scheduler paths; no schema migration is required because launch metadata is stored in `file_extensions`.

## Follow-up Measurements

- After dev launch succeeds, collect:
  - app scan duration and app count.
  - `files`, `file_extensions`, `keyword_mappings`, and FTS table row counts from a copied database snapshot.
  - searches for `聊天应用`, `chatapp`, `codex`, and `apple music`, including candidate count and slow stages.
  - Everything status payload, especially `backend`, `backendAttemptErrors`, and `lastBackendError`.
  - before/after first result latency and startup lag traces over a 2 minute window.
