# Screenshot tool workflow implementation plan

## Guardrails

- Work only in the screenshot tool workflow and the minimum capture-core extension required for frozen composition.
- Do not start annotation/long/OCR/pin persistence internals in this task.
- Do not restore legacy screenshot facade, Assistant selector ownership, data URL, raw path, raw carrier, or runtime fallback.
- Do not expose native/generation/window IDs, titles, paths, attachment bytes, or image payloads to renderer/plugin.
- Do not install global packages, change system permissions/settings, commit, archive, or clean the shared worktree without explicit approval.
- Keep ordinary screenshot addon restored after every deterministic build.

## Phase 0 - Baseline and contracts

### RED 0A - Preserve current protocol/public hard cut

- [x] Re-run screenshot public surface, service, transport, addon export, strict macOS integration, and `git diff --check` baseline.
- [x] Add source contracts proving new session code cannot import raw addon/carrier and old Assistant selector cannot remain after migration.

### GREEN 0A - Planning/runtime setup

- [x] Validate Trellis context manifests and activate this task with the session-scoped context ID.
- [x] Record baseline commands/evidence without rewriting unrelated dirty files.

## Phase 1 - Typed session contracts and window roles

### RED 1A - Shared event contracts

- [x] Add failing shared tests for start request normalization, session phases, renderer-safe state, commands, terminal result, unknown fields, invalid rects/delay/options, and forbidden sensitive fields.
- [x] Assert plugin/caller identity is absent from caller-authored payloads.

### GREEN 1A - Shared contracts

- [x] Add `ScreenshotSessionEvents` and types under the existing utils transport event ownership.
- [x] Export only typed control/descriptor contracts; do not add screenshot bytes or raw identifiers.
- [x] Update SDK mirror/transport event registration tests.

### RED 1B - Window role routing

- [x] Add failing tests for screenshot overlay/editor roles and invalid screenshot subtype fallback.

### GREEN 1B - Window role routing

- [x] Add `--touch-type=screenshot --screenshot-type=overlay|editor` parsing.
- [ ] Lazy-load `ScreenshotOverlay.vue` and `ScreenshotEditorShell.vue` from `AppEntrance`.
- [ ] Update app entrance diagnostics without logging resource URLs or session payloads.

## Phase 2 - Main session manager lifecycle

### RED 2A - Single-active state machine

- [x] Add fake-service/window tests for snapshot preparation, selecting, cancel, duplicate start, partial-load rollback, owner-bound wait, and module dispose.
- [ ] Add delay, confirming, editor/return/direct completion, caller abort, display change, and child-window close cases when those transitions are implemented.
- [x] Prove duplicate start creates no second generation/window group and brings existing overlays forward.
- [x] Prove cancel/dispose terminal paths remove current windows and sender bindings once; extend to streams/drafts in their owning phases.

### GREEN 2A - Manager core

- [x] Add `ScreenshotSessionManager` as a main-owned module/service with injected native service, window factory, clock, and resource actions.
- [x] Implement explicit reducer/state transitions and one active session record.
- [x] Keep terminal/result ownership main-only and bounded.

### RED 2B - Sender/owner authorization

- [x] Add tests rejecting overlay events from unknown senders and result waits from wrong owners before service work.
- [ ] Extend sender/owner authorization coverage to stale/replaced/destroyed/cross-session/plugin/editor paths with handler registration.

### GREEN 2B - Handler registration

- [ ] Register typed session handlers through TuffTransport.
- [ ] Bind every created `webContents.id` to the active session and expected surface.
- [ ] Return only renderer-safe state projections.

## Phase 3 - Frozen resources and native composition

### RED 3A - Native operation contract

- [ ] Add Rust tests for `compose_frozen_region`: input attachment correlation, generation/display validation, local-first negative-origin crop, mixed scale, cross-display segments, transparent holes, rounded clip, border/shadow bounds, output/working-set budgets, cancellation, malformed PNG, and late-result suppression.
- [ ] Assert all existing operations still reject unexpected input attachments.

### GREEN 3A - Rust composition

- [ ] Add a main-only composition request variant and operation descriptor.
- [ ] Decode bounded source PNG attachments, verify dimensions against current generation displays, reuse region planner, compose/effect in Rust, PNG encode, and chunk output through existing attachment helpers.
- [ ] Keep logs/errors metadata-only.

### RED 3B - Main resource adapter

- [ ] Add service tests for canonical frozen `tfile` reads, source attachment ordering, output promotion, stale generation, namespace escape, oversize, and cleanup.
- [ ] Prove public `NativeScreenshotCaptureRequest/Result` and plugin SDK are unchanged.

### GREEN 3B - Main adapter

- [ ] Add `captureProtocolTarget()` and `composeFrozenRegion()` as main-only service methods.
- [ ] Reuse controlled resource read/materialization; never return input/output bytes past main.
- [ ] Add main-only clipboard/delete/quick-save resource actions with canonical containment.

## Phase 4 - Overlay window factory

### RED 4A - Multi-display windows

- [ ] Add tests for one window per display, negative origins, exact bounds, hardened preferences, sender binding before load/show, all-spaces/top level, hidden-until-ready, focus routing, and partial creation rollback.
- [ ] Add topology-change teardown tests.

### GREEN 4A - Window factory

- [ ] Add screenshot overlay/editor `TouchWindow` options without broad preload or web preferences.
- [ ] Create and bind overlays from the native snapshot, then show them together after ready/frozen resources.
- [ ] Broadcast only per-display safe projections.

## Phase 5 - Selection model and overlay UI

### RED 5A - Pure selection reducer

- [ ] Add table/property tests for free drag in every direction, move, eight resize handles, half-open bounds, min size, display/desktop clamp, negative origins, keyboard nudge/resize, manual dimensions, aspect ratio, candidate select/cycle, and escape.
- [ ] Add cross-display projection tests.

### GREEN 5A - Selection model

- [ ] Implement one pure exhaustive reducer shared by renderer interaction tests and main command normalization.
- [ ] Keep global DIP as source of truth; renderer only projects local display segments.

### RED 5B - Overlay interaction

- [ ] Add component tests for semantic controls, pointer drag/resize, keyboard focus/shortcuts, size label, handles, toolbar modes, delay/aspect controls, cursor/effect options, candidate highlight, magnifier frozen-only behavior, disabled future capabilities, confirm, and cancel.
- [ ] Add visual assertions at Retina and negative-origin fixture sizes with no overlap/text overflow.

### GREEN 5B - Overlay UI

- [ ] Build `ScreenshotOverlay.vue` as a full-bleed scene with frozen `tfile` background or transparent live mode.
- [ ] Use TuffEx/icon primitives, semantic buttons, tooltips, i18n, stable dimensions, and no nested cards.
- [ ] Implement pointer/keyboard commands and small frozen-image magnifier without serializing pixel data.

## Phase 6 - Frozen/live and object selection

### RED 6A - Mode lifecycle

- [ ] Add tests for initial frozen capture, frozen->live resource visibility, live->frozen recapture/replacement, cursor toggle recapture, confirm source correctness, cancel during recapture, and resource cleanup.

### GREEN 6A - Mode lifecycle

- [ ] Snapshot displays before overlay visibility.
- [ ] Live mode reveals desktop while retaining self-exclusion; frozen mode refreshes managed frames.
- [ ] Frozen confirm uses Rust composition; live confirm uses fresh native target capture.

### RED 6B - Window/UI hit-test privacy

- [ ] Add tests that hover/cycle/confirm use internal opaque target identity while renderer receives kind/bounds/fallback only.
- [ ] Prove AX denied/timeout preserves the window candidate.

### GREEN 6B - Object selection

- [ ] Debounce/bound pointer hit tests in main.
- [ ] Project candidate geometry to all overlays and keep opaque target in manager only.

## Phase 7 - Editor shell and output actions

### RED 7A - Completion modes

- [ ] Add tests: macOS standalone always enters editor; typed `return-resource` skips editor; Windows/Linux direct PNG skips editor; invalid combinations fail before windows/native work.
- [ ] Add cancel-before-action draft cleanup and first-action completion tests.

### GREEN 7A - Editor shell

- [ ] Build managed-resource preview plus copy/save/quick-save/complete/cancel actions.
- [ ] Render annotation/long/OCR/pin action entries from capabilities and disable unavailable children with stable reasons.
- [ ] Keep save path and clipboard image main-only.

## Phase 8 - Entrypoint migration and permissions

### RED 8A - Shortcut/tray/System/Assistant

- [ ] Add tests proving all entrypoints call the same manager and none directly captures or creates legacy selector windows.
- [ ] Add shortcut registration failure/degraded tests and tray action tests.

### GREEN 8A - Entrypoints

- [ ] Register configurable global shortcut through existing shortcut module.
- [ ] Add tray Screenshot item.
- [ ] Change System Action to start the tool.
- [ ] Migrate Assistant selection to manager `return-resource` and delete `ScreenshotRegionSelector` plus obsolete events/window options.

### RED 8B - Plugin permission matrix

- [ ] Cover unverified, missing permission runtime, only `window.capture`, only background permission, both, stale SDK marker, wrong owner, clipboard without `clipboard.write`, and success.

### GREEN 8B - Plugin boundary

- [ ] Add visible session facade only through verified typed context and `window.capture`.
- [ ] Do not expose stream/history/OCR/pin or infer background permission.

## Phase 9 - Verification and demo video

### GREEN 9A - Focused quality gates

- [ ] Rust fmt/clippy/workspace tests and ordinary release build/dlopen.
- [ ] Node protocol/package/addon contracts and production engine verifier.
- [ ] Utils transport/SDK tests.
- [ ] CoreApp session manager/window/selection/overlay/editor/entry/permission tests.
- [ ] CoreApp node/web typecheck, scoped lint, UI contract, docs verify, YAML, pack dry-run, sensitive-field grep, and `git diff --check`.
- [ ] Strict real macOS protocol integration after the final ordinary rebuild.

### GREEN 9B - Real Electron visual/video evidence

- [ ] Launch CoreApp with an isolated profile and CDP port.
- [ ] Show a generated non-sensitive target in a separate process/full-screen surface.
- [ ] Record shortcut/tool start, object/free selection, move/resize, frozen/live/freeze, cancel, confirm, editor preview, and one copy/save result.
- [ ] Capture desktop/mobile-equivalent overlay screenshots or canvas pixel checks proving nonblank frozen resource, correct framing, no overlap, and stable controls.
- [ ] Convert recording to H.264/yuv420p MP4 and validate codec, duration, dimensions, frame count, and non-zero size with `ffprobe`.
- [ ] Place final user-deliverable video under `/tmp/tuff-screenshot-demo/`; keep raw recording/profile/logs uncommitted and sanitized.

## Validation commands

```bash
cargo fmt --manifest-path packages/tuff-native/Cargo.toml --all -- --check
cargo clippy --manifest-path packages/tuff-native/Cargo.toml --workspace --all-targets --all-features -- -D warnings
cargo test --manifest-path packages/tuff-native/Cargo.toml --workspace --all-features

node packages/tuff-native/scripts/build-screenshot.js
corepack pnpm -C packages/tuff-native run verify:screenshot-production
node --test packages/tuff-native/*.test.js

corepack pnpm -C packages/utils exec vitest run __tests__/transport-domain-sdks.test.ts
corepack pnpm -C apps/core-app exec vitest run <focused screenshot files>
corepack pnpm -C apps/core-app run typecheck:node
corepack pnpm -C apps/core-app run typecheck:web
node scripts/check-coreapp-ui-contract.mjs
mise run docs:verify
git diff --check

TUFF_SCREENSHOT_MACOS_INTEGRATION=1 TUFF_SCREENSHOT_MACOS_REQUIRE_AX=1 \
  corepack pnpm -C apps/core-app exec vitest run \
  src/main/modules/native-capabilities/native-screenshot-macos.integration.test.ts

/usr/sbin/screencapture -v -V45 -D1 /tmp/tuff-screenshot-demo/raw.mov
/opt/homebrew/bin/ffmpeg -y -i /tmp/tuff-screenshot-demo/raw.mov \
  -vf 'scale=trunc(iw/2)*2:trunc(ih/2)*2' \
  -c:v libx264 -pix_fmt yuv420p -crf 20 \
  /tmp/tuff-screenshot-demo/screenshot-tool-demo.mp4
/opt/homebrew/bin/ffprobe -v error -show_streams -show_format \
  -of json /tmp/tuff-screenshot-demo/screenshot-tool-demo.mp4
```

## Rollback points

1. Before entrypoint migration, the manager/UI may remain unreachable while tests are built.
2. After manager migration, rollback may unregister new entries and report unavailable; do not restore Assistant selector ownership.
3. If frozen composition fails, disable frozen confirmation with an explicit reason; do not silently recapture and claim snapshot semantics.
4. If recording permissions block video, retain code/test evidence and report video blocked; do not record personal desktop or alter system privacy settings.

## Evidence gaps that cannot be closed locally

- Real mixed 1x/2x negative-origin hardware, rotated display, and cross-screen window.
- Windows/Linux runtime and UI capture.
- Signed/notarized packaged Electron.
- macOS 12.3-13 static stream fallback.

These stay open for `07-29-screenshot-packaged-evidence`; local fixtures/video must not be relabeled as those results.

## Delivered status - 2026-07-30

The original phase checklist above records the initial editor-handoff plan. The accepted product flow changed to same-overlay editing; the implementation and current evidence supersede the editor-window steps.

- `ScreenshotSessionManager` owns one active session, all per-display overlays, owner-bound results, lazy composition, copy/save/Done, invalidation, and first-wins teardown. Copy/save retain the overlay and selection; Done completes without a second BrowserWindow.
- `ScreenshotOverlay.vue` provides free/object selection, frozen/live, move/eight-handle resize, keyboard/manual/aspect adjustment, cursor/effects, magnifier, safe-area placement, copy, save, Done, and cancel. Vue selection payloads are snapshotted into plain transport objects.
- Save uses an overlay-parented native dialog. A real run exposed Escape propagation from a closed native sheet into the overlay; Save now suppresses overlay Escape while pending and for 300 ms after close. Real cancellation validation shows the sheet closes while the `900x540` selection and frozen frame remain. A separate confirm run saved `/tmp/tuff-screenshot-demo/inline-save-confirmed-20260730.png` as a valid `1800x1080` RGBA PNG (48,403 bytes, SHA-256 `fbfcf6b1d841ca83573a4e3110b151321b2dd1934636dcfdf514fc6a1eb0e69e`), retained the same overlay/selection, and then Done closed the session.
- Native `compose` performs frozen multi-display crop/composition and effects from managed PNG attachments. Public renderer/plugin boundaries remain descriptor-only; stable public display IDs hide generation-scoped native IDs.
- Shortcut (`CommandOrControl+Shift+A`), tray delays, System Action, Assistant, and verified plugin entrypoints use the same manager. Managed temp `tfile://` access remains confined to the explicit temp base.
- Real isolated demo: `/tmp/tuff-screenshot-demo/screenshot-tool-demo.mp4`; H.264/yuv420p, `4096x2648`, `18.883333s`, 258 frames, 3,237,732 bytes, SHA-256 `e88d57d20b0d76f8233ce013495982b53818ec9fcaebfb5ae85ed643b26f09d8`.
- Contact sheet: `/tmp/tuff-screenshot-demo/video-contact-sheet-direct.png`, SHA-256 `a42048aa981af464a8aa34e047172ce81173fc611afc43565a1ceea17a5dd85d`. Visual review confirms no DevTools, personal content, or editor popup.

### Final local quality gate

- Rust workspace: screenshot `63/63`, audio `16/16`, native-core `17/17`; fmt and clippy `-D warnings` pass.
- CoreApp focused suites: 11 files, `139/139`; utils focused suites: 5 files, `60/60`; Node protocol/package/addon contracts: `35/35`.
- Strict ordinary-addon macOS integration: `1/1`; production engine verifier passes.
- CoreApp `typecheck:node`, `typecheck:web`, and `git diff --check` pass.
- This local evidence does not close Windows/Linux runtime, mixed-DPI/negative-origin/rotation hardware, macOS 12.3-13 fallback, macOS x64, or signed/notarized packaged runtime gaps.
