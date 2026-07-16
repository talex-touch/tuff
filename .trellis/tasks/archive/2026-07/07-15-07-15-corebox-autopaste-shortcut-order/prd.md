# Fix CoreBox shortcut AutoPaste ordering

## Goal

Preserve shortcut-trigger intent until the CoreBox show lifecycle runs so fresh clipboard content auto-fills; verify AutoClear and app indexing with a live Electron smoke test.

## Requirements

- Opening CoreBox through its global shortcut must mark the show lifecycle as shortcut-triggered before AutoPaste evaluates the latest clipboard item.
- A fresh, eligible native-watcher text item must auto-fill the CoreBox query exactly once when the hidden window is opened by shortcut.
- Programmatic/non-shortcut shows must retain their existing behavior and must not gain implicit AutoPaste.
- AutoClear must continue to clear stale query, mode, provider, and clipboard state after the configured hidden interval while preserving state inside the interval.
- App discovery, indexing, search, and launch behavior must remain unchanged.

## Acceptance Criteria

- [x] Shortcut-origin notification reaches the renderer before the canonical `show: true` trigger is applied.
- [x] Existing CoreBox shortcut and visibility tests pass.
- [x] Live Electron smoke test auto-fills fresh short clipboard text after a hidden-to-shown shortcut transition.
- [x] Live AutoClear smoke test preserves a recent session and clears an expired session.
- [x] Live App smoke test indexes a newly installed `.app`, returns it from search, and launches it.

## Notes

- Root cause reproduced in the live Electron runtime: the main process emits `CoreBoxEvents.ui.trigger { show: true }` before `CoreBoxEvents.ui.shortcutTriggered`, so renderer `onShow()` consumes a false shortcut flag and skips AutoPaste.
- Keep the change local to event ordering; do not weaken clipboard freshness or eligibility checks.
- The isolated smoke profile is under `/tmp/tuff-corebox-index-smoke-9444`; no user profile settings are modified.

## Verification Evidence

- Before the fix, a fresh eligible `native-watch` item remained in `clipboardOptions.last` while `searchVal` stayed empty after shortcut show.
- After the fix, `FIXED_AUTOPASTE_7F39A1` appeared verbatim in the live CoreBox textbox after the same hidden-to-shown shortcut sequence.
- With isolated `autoClear: 1`, reopening after 0.35 seconds retained `AUTOCLEAR_KEEP_7F39A1`; reopening after 1.35 seconds cleared the query, reset mode to `input`, and removed pending/active clipboard state.
- A temporary signed `.app` was observed by the watcher after about 57 ms, indexed after about 1.67 seconds, returned from a query in 204 ms, and launched successfully through CoreBox.
- Moving the temporary app out of `~/Applications` removed it from the database and subsequent search results.
- Four focused CoreBox test files passed: 27 tests total. `typecheck:node` and `lint:changed` also passed.
