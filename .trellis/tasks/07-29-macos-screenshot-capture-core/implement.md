# macOS Screenshot Capture Core - TDD Implementation Plan

> Protocol-only amendment approved 2026-07-29: remove every legacy screenshot export, package subpath, CoreApp raw-addon loader, and fallback. Historical Phase 0-3 evidence below records the pre-amendment baseline; Phase 3C supersedes its compatibility assumptions.

## Phase 0 - Baseline and task start

- [x] Record the dirty worktree and preserve all protocol/Trellis/user changes; do not stage, commit, archive, or remove unrelated files.
- [x] Re-run the focused screenshot legacy baseline before touching production code.
- [x] Confirm protocol v1 Rust/Node/CoreApp tests still pass from the shared dirty worktree.
- [x] Start only `07-29-macos-screenshot-capture-core`; leave the screenshot parent and all sibling tasks in `planning`.
- [x] Update `task.json` notes with the approved scope and the protocol task’s uncommitted dependency.

Baseline commands:

```bash
cargo test --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-screenshot
cargo test --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-core
node --test \
  packages/tuff-native/protocol-contract.test.js \
  packages/tuff-native/protocol-carrier.test.js \
  packages/tuff-native/protocol-napi.test.js \
  packages/tuff-native/protocol-package.test.js
corepack pnpm -C packages/test exec vitest run src/native/tuff-native-screenshot.test.ts
corepack pnpm -C apps/core-app exec vitest run \
  src/main/modules/native-capabilities/screenshot-service.test.ts \
  src/main/modules/native-capabilities/native-transport.test.ts \
  src/main/modules/native-capabilities/native-transport-stream.test.ts \
  src/main/modules/native-capabilities/index.test.ts
```

Baseline evidence from the shared dirty worktree on 2026-07-29:

- `tuff-native-screenshot`: 9/9 Rust tests passed.
- `tuff-native-core`: 17/17 Rust tests passed.
- protocol v1 Node contracts: 21/21 tests passed.
- package screenshot facade: 3/3 tests passed.
- CoreApp screenshot/transport/module focus: 32/32 tests passed.

## Phase 1 - Lock protocol and geometry contracts

### RED 1A - Shared topology fixtures

- [x] Add `packages/tuff-native/fixtures/screenshot-v1/topologies.json` with deterministic cases:
  - primary 2x Retina + left negative-origin 1x display;
  - display above primary;
  - topology hole between displays;
  - 90-degree and 270-degree rotated display mode;
  - non-equal display sizes and fractional region edges;
  - region crossing 1x/2x boundary;
  - window crossing two display scales.
- [x] Add Rust fixture decode tests that fail because screenshot geometry models do not exist.
- [x] Add TS fixture contract tests that fail because main screenshot protocol types/validators do not exist.
- [x] Assert fixtures contain no image bytes, titles, paths, or platform-specific secrets.

### GREEN 1A - Coordinate model

- [x] Add `model.rs`, `geometry.rs`, and serde contracts for finite global DIP/point rects, local point rects, local pixel rects, output pixel rects, axis scale, rotation, and descriptor IDs.
- [x] Reject NaN/infinity, zero/negative dimensions, invalid rotations, out-of-range scales, and arithmetic overflow before allocation.
- [x] Implement half-open intersection/containment and local-first transforms.
- [x] Implement oriented pixel-size normalization for 0/90/180/270 rotation.
- [x] Make topology fixture decode/round-trip tests pass.

### RED 1B - Region planner

- [x] Add failing tests for one-display planning, mixed-scale split, negative origins, shared output edges, transparent topology holes, fractional edge rounding, and no-display intersection.
- [x] Add failing property tests over deterministic generated display grids: every source segment stays within its display and every destination segment stays within the output canvas.
- [x] Add failing budget tests for pixel count, working-set estimate, per-part bytes, attachment count, and packet bytes.

### GREEN 1B - Region planner and chunks

- [x] Implement `region_plan.rs` with deterministic display intersection order and per-axis `native-max` output scale.
- [x] Use one relative output-edge conversion so adjacent segments share exact destination edges.
- [x] Use floor source-min and ceil source-max after display-local scaling.
- [x] Preserve transparent holes and reject empty plans.
- [x] Implement bounded 32 MiB attachment chunk descriptors and contiguous offset validation.
- [x] Make region/budget/property tests pass without platform APIs.

### RED 1C - Window candidate rules

- [x] Add failing pure tests for exact SCK/CG ID join, front-to-back order, duplicate IDs, PID/layer/bounds disagreement, sharing none, alpha, zero/small rects, system bundles, self PID/bundle/window, panels, overlapping windows, and max-candidate truncation.
- [x] Prove title/owner name/bounds similarity cannot join a window when IDs differ.
- [x] Add failing tests for cross-display coverage IDs and maximum intersected scale.

### GREEN 1C - Window candidates

- [x] Implement `window_candidates.rs` with exact native-ID join and deterministic classification.
- [x] Keep all plain descriptors generation-scoped; default hit test excludes system/self/transient windows and includes normal layer-0 windows.
- [x] Allow bounded panel candidates only when requested.
- [x] Return all containing candidates in z-order for later cycling.
- [x] Make candidate tests pass.

Verification:

```bash
cargo test --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-screenshot geometry
cargo test --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-screenshot region_plan
cargo test --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-screenshot window_candidates
```

Phase 1 evidence from 2026-07-29:

- `tuff-native-screenshot`: 30/30 tests passed.
- Rust workspace fmt check and screenshot clippy `-D warnings` passed.
- CoreApp screenshot geometry contract plus legacy service: 6/6 tests passed.
- CoreApp node typecheck, focused ESLint, and scoped `git diff --check` passed.

## Phase 2 - Capability registry with a mock backend

### RED 2A - Request/response validation

- [x] Add failing tests for `probe`, `refresh`, `hit_test`, `capture`, and `frames` tagged payloads.
- [x] Cover unknown fields compatibility, missing required fields, invalid opaque/generation IDs, title opt-in, self list bounds, invalid FPS/output scale/max-frame bytes, and input attachments (all operations reject them in v1).
- [x] Add failing tests for stable screenshot error code/category/retryability mapping and fixed safe messages.

### GREEN 2A - Model/error/limits

- [x] Implement `limits.rs`, `error.rs`, and strict serde payload conversion from `serde_json::Value`.
- [x] Add sanitized screenshot `ProtocolError` constructors; never include raw system errors or payload values.
- [x] Keep all limits in `ScreenshotLimits`, with public allowlisted values returned by `probe`.
- [x] Make payload/error tests pass.

### RED 2B - Backend-owned generation state

- [x] Define test expectations for a fake `ScreenshotBackend` without implementing it.
- [x] Add failing tests for backend-atomic refresh swap, old generation invalidation, retained opaque target lookup, refresh failure preserving prior generation, topology-changed failure, and element map cap/clear.
- [x] Add failing tests for protocol feature matrices: macOS full, macOS AX-denied, Windows/Linux basic, unsupported OS, env-disabled.

### GREEN 2B - Capability implementation

- [x] Introduce a generic async `ScreenshotBackend` trait and test `FakeBackend` without a new async-trait dependency.
- [x] Keep retained handles and generation lookup inside each backend/actor; the generic capability validates and dispatches without a duplicate target map.
- [x] Register `screenshot.capture@1.0.0` descriptors/operations in `capability.rs`.
- [x] Return `degraded/basic-backend-only` for xcap without removing basic routability.
- [x] Make generation/feature-matrix tests pass.

### RED 2C - Binary output and stream behavior

- [x] Add failing registry tests for one/multi-part PNG attachment correlation and raw BGRA frame part correlation.
- [x] Add failing frame tests for protocol credit, latest-frame replacement/drop count, source error, cancel, deadline, dispose, oversized frame, and exactly one terminal.
- [x] Add a race test where cancel competes with a callback and assert no late data after terminal.

### GREEN 2C - Output/stream bridge

- [x] Convert backend image/frame outputs to `OperationOutput` attachments with stable IDs, media type, purpose, and counters.
- [x] Implement a one-frame latest slot (overwrite + drop counter), never an unbounded callback queue.
- [x] Select frame wait against protocol cancellation and always invoke bounded backend stop through a guard.
- [x] Make attachment/stream/race tests pass.

Verification:

```bash
cargo test --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-screenshot capability
cargo test --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-screenshot stream
cargo test --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-core
```

Phase 2 evidence from 2026-07-29:

- `tuff-native-screenshot`: 47/47 tests passed after the final single-part PNG case.
- `tuff-native-core`: 17/17 tests passed.
- Screenshot fmt and clippy `-D warnings` passed.
- CoreApp screenshot geometry/legacy focus: 6/6 tests passed.
- CoreApp node typecheck, focused ESLint, and scoped `git diff --check` passed.

## Phase 3 - Protocol N-API exports and Node carrier surface

### RED 3A - Addon export contract

- [x] Extend/add Node contract tests that expect all five legacy exports plus all six protocol-v1 exports from a real screenshot addon.
- [x] Add failing tests for `./screenshot-protocol`: binding absent, env-disabled, legacy-only export mismatch, full binding, handshake cache, and package export conditions.
- [x] Assert renderer/browser/default package resolution cannot access `./screenshot-protocol`.

### GREEN 3A - Rust adapter and package loader

- [x] Add `tuff-native-core`, `tuff-native-napi`, serde, serde_json, tokio, and required napi `tokio_rt` dependencies to `native-screenshot`.
- [x] Create the production `OnceLock<NapiRuntimeAdapter>` and expose the six versioned functions exactly like the fixture addon.
- [x] Keep legacy exports/signatures unchanged.
- [x] Add Node-only `screenshot-protocol.{js,d.ts}` that loads the screenshot binding, validates six exports, and constructs `NapiCarrier`.
- [x] Preserve `TUFF_DISABLE_NATIVE_SCREENSHOT=1` for both protocol and legacy paths.
- [x] Narrow package `files`/exports and make package tests pass.

### RED 3B - Real addon protocol integration

- [x] Add a deterministic fake-backend build/test mode or injected registry path for the real screenshot addon.
- [x] Add a failing Node integration that runs refresh, PNG capture parts, frame data/end/error/cancel/dispose through `.node -> NapiCarrier -> NativeTransport`.
- [x] Assert malformed/correlated attachment faults fail closed and Buffer ownership is stable.

### GREEN 3B - Integration

- [x] Wire the deterministic backend only in tests/fixture configuration; production handshake reflects the actual platform backend.
- [x] Make real addon protocol integration pass without screen permission or hardware dependency.
- [x] Confirm loading screenshot addon does not initialize audio/OCR addons.

Verification:

```bash
cargo build --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-screenshot --release
node packages/tuff-native/scripts/build-screenshot.js
node --test packages/tuff-native/protocol-*.test.js packages/tuff-native/screenshot-protocol*.test.js
corepack pnpm -C apps/core-app exec vitest run \
  src/main/modules/native-capabilities/native-transport-napi.integration.test.ts
```

Phase 3 evidence from 2026-07-29:

- Feature-gated real screenshot addon: Rust 47/47, protocol/screenshot Node 27/27, CoreApp real N-API + focused contracts 8/8.
- `.node -> NapiCarrier -> NativeTransport` passed refresh, PNG attachment, three BGRA frames, ACK, cancel, dispose, and retained output Buffer checks.
- Screenshot all-features clippy `-D warnings`, Rust fmt, CoreApp node typecheck, focused ESLint, package contract, and dry-run passed.
- Dry-run excludes deterministic backend and standalone Rust contract fixtures.
- Default addon was rebuilt without the test feature; handshake reports `unavailable/backend-not-built` until Phase 4/7 backends replace it.

## Phase 3C - Protocol-only hard cut

### RED 3C - Forbid legacy surfaces

- [x] Change the real addon contract to require exactly six protocol exports and reject all five synchronous screenshot exports.
- [x] Add package/import tests that forbid `./screenshot`, `screenshot.{js,d.ts}`, CoreApp `native-screenshot-addon.ts`, raw `.node` imports outside the Node-only carrier, and legacy display-scaling helpers.
- [x] Add CoreApp initialization tests proving absent, disabled, unavailable, old, or conflicting screenshot carriers remain explicitly unavailable with no fallback.

### GREEN 3C - Delete legacy implementation

- [x] Remove xcap/legacy N-API types and functions from `native-screenshot/src/lib.rs`; xcap will return only as the Phase 7 protocol backend.
- [x] Remove `packages/tuff-native/screenshot.{js,d.ts}` and the `./screenshot` export/files entries.
- [x] Remove `native-screenshot-addon.ts` and rewrite `NativeScreenshotService` as protocol-only initialization/cache/resource policy.
- [x] Delete display-pair scoring, global-origin scaling, monitor-local conversion, and every runtime fallback branch.
- [x] Keep outer typed screenshot events fail-closed while Phase 4/5 backend work proceeds.

Verification:

```bash
node --test packages/tuff-native/screenshot-addon-contract.test.js packages/tuff-native/protocol-package.test.js packages/tuff-native/screenshot-protocol.test.js
corepack pnpm -C apps/core-app exec vitest run \
  src/main/modules/native-capabilities/native-screenshot-carrier.test.ts \
  src/main/modules/native-capabilities/screenshot-service.test.ts \
  src/main/modules/native-capabilities/index.test.ts
corepack pnpm -C apps/core-app run typecheck:node
```

Phase 3C evidence from 2026-07-29:

- Ordinary screenshot addon rebuilt with exactly six protocol exports; Node protocol/package/addon contracts passed 32/32.
- Screenshot Rust all-features suite passed 38/38 after deleting nine legacy facade tests and the xcap dependency.
- CoreApp protocol-only/service/module focus passed 18/18; package-level screenshot protocol contract passed 2/2; node typecheck passed.
- `NativeScreenshotService` now initializes through routable capability `probe -> refresh`, preserves `global-dip-v1`, validates attachment correlation, and has no runtime fallback.
- Default addon intentionally remains `unavailable/backend-not-built` until Phase 4/7 installs a real platform backend.

## Phase 4 - macOS system adapters and content refresh

### RED 4A - objc2 build/availability contract

- [x] Add a build contract test/script that fails if Apple dependencies are not exact-pinned or leak into non-macOS target dependencies.
- [x] Add failing unit tests for OS feature selection at 12.2/12.3/13/14/15.1/15.2.
- [x] Add a test that forbids a Swift bridge/custom `.swift`/`.m`/`.mm` build target in `native-screenshot`.

### GREEN 4A - Narrow system layer

- [x] Add exact target-specific objc2 dependencies and minimum deployment-target build metadata.
- [x] Implement `backend/macos/system.rs` wrappers for availability, screen permission preflight, shareable content, displays, CG display modes/rotation, CG window list, filters, and sanitized NSError handling.
- [x] Wrap Objective-C callback/capture entry points in autorelease pools and retain all objects with typed ownership.
- [x] Keep unsafe platform calls in the system layer; add `SAFETY` comments for pointer/block/CF ownership invariants.
- [x] Make build/availability contracts pass on macOS and keep Apple crates target-scoped away from Linux/Windows.

### RED 4B - Screen actor snapshot

- [x] Add actor mailbox tests for serial FIFO order, callback timeout/cancel, disconnect cleanup path, closed-state rejection, and command queue admission limit.
- [x] Add actor-boundary fake sessions proving disconnect/dispose stops retained streams, and an atomic commit test proving canceled refresh cannot swap generation; no fake ObjC/SCK handle crosses the system layer.
- [x] Add snapshot/geometry fixtures for display pixel scale and front-to-back exact window join.
- [x] Add tests proving old generation targets fail stale and are never re-resolved from native numeric IDs.

### GREEN 4B - MacScreenActor refresh

- [x] Implement the bounded `MacScreenActor` thread/command channel.
- [x] Fetch `SCShareableContent(excludingDesktopWindows: true, onScreenWindowsOnly: true)` without blocking N-API/JS.
- [x] Build display descriptors from `SCDisplay.frame` + `CGDisplayBounds` + current `CGDisplayMode.pixelWidth/Height` + rotation.
- [x] Build window descriptors from exact SC/CG ID join and self policy; title is read only when explicitly authorized and never formatted/debug-logged.
- [x] Store retained display/window objects behind opaque generation IDs.
- [x] Make actor/snapshot contracts and real refresh smoke pass.

### RED 4C - AX fallback behavior

- [x] Add AX failure-category, window-frame coherence, containment, invalid-resource, generation, and 512-entry-cap tests; strict opt-in smoke requires a real returned AX element.
- [x] Assert the AX adapter only requests `AXWindow`, role/subrole, position/size, enabled/focused, and PID; title/value/description/text are never requested or serialized.
- [x] Add tests for element generation invalidation and 512-entry cap.

### GREEN 4C - MacAxActor

- [x] Implement a separate serialized AX actor using non-prompting trust probe and 200 ms messaging timeout.
- [x] Resolve the system-wide element at point, query its allowlisted `AXWindow`, and verify PID plus SCK/CG window-frame coherence; no parent walk means cycle/depth traversal is not part of this implementation.
- [x] Retain only bounded generation-scoped handles and return role/subrole/bounds/enabled/focused.
- [x] Return a window-level fallback on every AX permission/timeout/unsupported/unverified result.
- [x] Make AX unit contracts and strict real element hit/capture integration pass.

Verification:

```bash
cargo test --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-screenshot macos
cargo clippy --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-screenshot --all-targets -- -D warnings
```

## Phase 5 - macOS static capture and composition

### RED 5A - Configuration/filter decisions

- [x] Add deterministic and real-system coverage for display/window/region/ui-element targets, cursor hidden/system, self exclusion, explicit own-window exception, and invalid/stale targets.
- [x] Add OS-path tests: SCScreenshotManager on 14+, short-lived SCStream on 12.3–13, and segmented region planning.
- [x] Assert a cross-display window always uses one desktop-independent filter.

### GREEN 5A - Filter/configuration builder

- [x] Resolve opaque targets only from the retained generation.
- [x] Build excluding-application/window display filters and desktop-independent window filters.
- [x] Set explicit BGRA/SDR width/height/source rect/cursor policy and validate scale/output limits.
- [x] Recheck retained display topology before display/region capture and fail stale/mismatched geometry closed.
- [x] Make filter/path contracts pass.

### RED 5B - Pixel extraction and PNG

- [x] Add synthetic BGRA/region-plan tests for stride, premultiplication, channel order, destination geometry, transparent holes, PNG output, deterministic chunk parts, and resource exhaustion.
- [x] Add tests for incomplete frame status and malformed/short pixel-buffer rows.

### GREEN 5B - Capture/compose/encode

- [x] Implement macOS 14+ `SCScreenshotManager` capture with callback ownership/cancel suppression.
- [x] Implement macOS 12.3–13 first-complete-frame `SCStream` fallback with bounded stop cleanup.
- [x] Extract/copy BGRA pixels while the source buffer is locked/retained; unlock before async publication.
- [x] Capture cross-display segments, resample into exact destination rects, preserve transparent holes, encode PNG, and split output parts.
- [x] Map permission/protected/not-found/no-frame/system errors to stable sanitized codes.
- [x] Make pixel/static contracts pass.

### RED 5C - Real single-display smoke

- [x] Add opt-in Rust/CoreApp smoke tests that record only support/counts/descriptors/dimensions/byte counts.
- [x] Run cursor hidden/system, display/region/window/UI targets, frames, self exclusion, and own-window exception on the current macOS machine.
- [x] Confirm no titles/image bytes/raw error messages appear in smoke JSON/log output.

### GREEN 5C - Smoke fixes only

- [x] Fix evidence-backed loader/AX/frame defects found by smoke and add contract or strict integration coverage before closure.
- [x] Record sanitized smoke evidence in this implementation log only; do not save screenshot bytes or private titles in task artifacts.

Verification:

```bash
cargo test --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-screenshot
cargo build --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-screenshot --release
node packages/tuff-native/scripts/build-screenshot.js
# opt-in command documented by implementation; must not prompt automatically
```

## Phase 6 - macOS continuous frames

### RED 6A - Native stream lifecycle

- [x] Add fake-stream tests for FPS/frame budget, complete-frame publication, latest-slot overwrite, source error, callback/cancel races, and bounded stop.
- [x] Add protocol integration tests for credit windows, consumer pause, cumulative ACK, cancel/deadline/dispose races, and one terminal.

### GREEN 6A - SCStream frame source

- [x] Implement one SCStream per protocol stream and one dedicated serial callback queue.
- [x] Publish validated BGRA frames into one latest-frame slot; replace/drop without blocking WindowServer callbacks.
- [x] Bridge source into `StreamContext.emit` so protocol credit controls attachment publication.
- [x] Stop/remove output/release tokens on terminal, cancel, deadline, handler drop, and addon dispose.
- [x] Make lifecycle/integration tests pass.

### RED/GREEN 6B - Real stream smoke

- [x] RED: run opt-in stream smoke and capture ordering/cancel defects in deterministic contracts.
- [x] GREEN: rerun a bounded first frame followed by iterator return/cancel/dispose through real CoreApp transport.

## Phase 7 - Windows/Linux basic protocol backend

### RED 7A - Basic feature matrix and geometry

- [x] Add target-independent fake-xcap tests for display refresh, single-display global DIP region conversion, negative origins, scale factors, unknown display, cross-display rejection/degradation, and PNG output.
- [x] Assert window/UI/cursor/self-exclusion/frames are absent or return `SCREENSHOT_UNSUPPORTED` on Windows/Linux.

### GREEN 7A - XcapBackend

- [x] Move xcap capture logic behind `XcapBackend` using `spawn_blocking` and full-display RGBA plus Rust-owned region crop.
- [x] Keep legacy synchronous exports removed; xcap is reachable only through `screenshot.capture@1.0.0`.
- [x] Advertise only `display`/`region`, with `degraded/basic-backend-only` capability state on Windows/Linux X11.
- [x] Reject Linux Wayland during backend initialization as `unavailable/wayland-unsupported`; xcap's global max-scale topology cannot prove per-display `global-dip-v1`.
- [ ] Make Linux/Windows tests/builds pass without compiling Apple crates.

Verification:

```bash
cargo test --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-screenshot
cargo check --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-screenshot --target x86_64-pc-windows-msvc
cargo check --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-screenshot --target x86_64-unknown-linux-gnu
```

Cross-target commands run only when the corresponding Rust target/system dependencies are available; CI supplies authoritative platform builds.

## Phase 8 - CoreApp transport migration

### RED 8A - Carrier initialization and fixed mode

- [x] Add tests for carrier absent, env-disabled, incomplete/old binding, full protocol binding, handshake unavailable/degraded/available, and capability conflict.
- [x] Assert every non-routable state stays unavailable and no raw addon/fallback path is invoked.
- [x] Add lifecycle tests that service initialization follows transport initialization and transport dispose happens once.

### GREEN 8A - Carrier and service initialization

- [x] Load the Node-only screenshot carrier through `@talex-touch/tuff-native/screenshot-protocol` with sanitized diagnostics; no CoreApp raw-addon carrier module exists.
- [x] Initialize `NativeTransport` with the screenshot carrier while preserving independent carrier failure.
- [x] Initialize `NativeScreenshotService` from the transport snapshot and cache probe/refresh output.
- [x] Keep `getSupport()`/`listDisplays()` synchronous from initialized cache.
- [x] Make initialization/lifecycle tests pass.

### RED 8B - Runtime validators and coordinate handoff

- [x] Add tests for malformed probe/snapshot/capture/frame control, duplicate IDs, stale generation, image part gaps/overlaps/order, descriptor byte mismatch, and unexpected attachments.
- [x] Add mixed-DPI/negative-origin tests proving protocol mode sends global DIP unchanged and never invokes old `getPhysicalBounds`/global-origin scaling.
- [x] Add tests for BrowserWindow self PID/bundle/media-source window-ID collection without exposing IDs to renderer/plugin.

### GREEN 8B - Protocol adapter

- [x] Implement `screenshot-protocol.ts` runtime validators and typed request/response conversion.
- [x] Translate cursor/display/region requests into generation-scoped protocol targets.
- [x] Reassemble validated attachment parts before clipboard and namespace-scoped tfile promotion; public output selectors/data URLs/raw paths are removed.
- [x] Delete old display pairing/conversion; protocol mode sends global DIP unchanged in every path.
- [x] Add internal async `refresh()`/`hitTest()`/`openFrames()` without exposing raw protocol transport.
- [x] Make validator/coordinate/resource-policy tests pass.

### RED/GREEN 8C - Existing outer behavior

- [x] RED: expand facade/event/Assistant/System Actions tests for protocol mode and descriptor-only tfile output; reject legacy output/path/data-url semantics.
- [x] GREEN: migrate public typed event/SDK shapes to required `tfileUrl`; keep binary/resource/path policy in main.
- [x] Confirm plugin screenshot and clipboard permissions remain in main and raw attachment/native IDs never cross plugin transport.

Verification:

```bash
corepack pnpm -C apps/core-app exec vitest run \
  src/main/modules/native-capabilities/screenshot-protocol.test.ts \
  src/main/modules/native-capabilities/screenshot-service.test.ts \
  src/main/modules/native-capabilities/native-screenshot-carrier.test.ts \
  src/main/modules/native-capabilities/index.test.ts \
  src/main/modules/assistant/module.screenshot-translate.test.ts \
  src/main/modules/box-tool/addon/system/system-actions-provider.test.ts
corepack pnpm -C apps/core-app run typecheck:node
corepack pnpm exec eslint \
  apps/core-app/src/main/modules/native-capabilities/native-screenshot-carrier.ts \
  apps/core-app/src/main/modules/native-capabilities/screenshot-protocol.ts \
  apps/core-app/src/main/modules/native-capabilities/screenshot-service.ts \
  apps/core-app/src/main/modules/native-capabilities/index.ts
```

## Phase 9 - CI, packaging, docs, and full gate

### RED 9A - Distribution contracts

- [x] Extend workflow/package tests to build screenshot protocol on macOS/Windows/Linux and assert Apple/xcap dependencies remain target-scoped.
- [x] Add packaged export/surface checks for the screenshot `.node`, Node-only subpath, production backend sources, and absence of Cargo target/fixtures/test backend.
- [ ] Add macOS build checks for arm64 and x64 where the repository release policy requires both.

### GREEN 9A - CI and package wiring

- [x] Extend `.github/workflows/native-protocol.yml` with fmt, clippy, tests, ordinary/deterministic release addon builds, dlopen/Node integration, CoreApp focused tests, and production restore per platform.
- [x] Update build scripts/package files without broadening npm contents to fixtures, Cargo targets, or deterministic test backend source.
- [x] Keep screenshot addon independent from audio/OCR and preserve packaging exclusion of `tuff-native/target/**`.
- [x] Make local distribution contracts and pack dry-run pass.

### RED/GREEN 9B - Documentation and audits

- [x] RED: run docs/spec verification and identify missing migration/permission/coordinate/security documentation.
- [x] GREEN: update native integration docs, capability matrix, native-resource protocol spec, plugin SDK README, and Nexus screenshot API docs.
- [x] Record the Swift-bridge rejection, local-first coordinate rule, exact ID join, AX fallback, no-runtime-fallback, and descriptor-only decisions.
- [x] Update audit R1 with local code/pack evidence while leaving signed packaged evidence to the dedicated sibling task.

### Final verification

- [x] Rust format passes.
- [x] Workspace clippy with `-D warnings` passes.
- [x] Workspace tests pass.
- [x] Screenshot release addon builds and loads.
- [x] Protocol-only/package Node contracts pass.
- [x] CoreApp screenshot/native lifecycle/Assistant/System Actions focused tests pass.
- [ ] CoreApp node/web typecheck and new screenshot/build-contract scoped ESLint pass; full-file lint remains blocked by pre-existing legacy style errors in large Assistant/VoicePanel/plugin/utils files.
- [ ] Windows/Linux platform CI basic backend passes.
- [x] macOS opt-in smoke passes on available hardware without sensitive artifacts.
- [x] `pnpm pack --dry-run`, docs verify, YAML parse, `git diff --check`, and sensitive-field grep pass.
- [x] Update PRD acceptance checkboxes only with concrete command/evidence references and retain hardware/platform gaps as open.
- [x] Request explicit authorization before any commit/archive; do not start sibling screenshot tasks.

Final local evidence (2026-07-29):

- Rust workspace fmt and all-features clippy `-D warnings` passed; workspace tests passed (`native-audio 16`, `native-core 17`, `native-screenshot 60`).
- Ordinary screenshot addon release build passed adaptive child-process `dlopen`; final exports are exactly the six `nativeProtocolV1*` functions and handshake reports `available/screen-capture-kit` with the implemented macOS feature set.
- Deterministic ordinary-addon integration passed `refresh -> capture attachments -> frames -> ACK -> error/cancel -> dispose`; test builds identify as `deterministic-test`, then CI/local restore rebuilds and verifies the production platform engine before packaging.
- Independent review closed two boundedness/distribution gaps: canceled AX hits commit retained handles only after the caller accepts the oneshot response, and restored ordinary addons are checked by platform engine/state rather than pack presence alone.
- Linux capability discovery is fail-closed before refresh: Wayland reports `wayland-unsupported`, headless sessions without `DISPLAY` report `display-server-unavailable`, and only X11 advertises degraded xcap display/region.
- CoreApp self-context coverage proves PID, sanitized bundle ID, and deduplicated `BrowserWindow.getMediaSourceId()` native IDs exist only on the internal main-to-Rust refresh request; public display/capture contracts remain descriptor-only.
- Strict real macOS CoreApp integration passed `probe -> refresh -> AX UI hit/capture -> display/window capture -> cursor system -> first frame/stop -> self exclusion -> own-window exception` without printing or saving image content.
- Node protocol/package/addon contracts passed `35/35`; package native screenshot/audio tests passed `6/6`; focused CoreApp transport/service/Assistant/System/plugin/VoicePanel suites passed `175/175`.
- CoreApp node and web typechecks passed. `docs:verify`, YAML parse, `pnpm pack --dry-run`, sensitive-field assertions, `git diff --check`, and new screenshot integration/build-contract ESLint passed.
- Full-file scoped ESLint remains open because large pre-existing Assistant/VoicePanel/plugin/utils files contain legacy formatting violations unrelated to these edits; no broad mechanical reformat was performed.
- Hardware/platform gaps remain explicit: this machine has one Retina display and only `aarch64-apple-darwin`; no real mixed 1x/2x, negative-origin, rotated, cross-screen-window, macOS 12.3-13 runtime, Windows, Linux, or mac x64 evidence was produced. Windows/Linux CI wiring is present but has not run in this local session.

Full commands:

```bash
cargo fmt --manifest-path packages/tuff-native/Cargo.toml --all -- --check
cargo clippy --manifest-path packages/tuff-native/Cargo.toml --workspace --all-targets -- -D warnings
cargo test --manifest-path packages/tuff-native/Cargo.toml --workspace
cargo build --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-screenshot --release

node packages/tuff-native/scripts/build-screenshot.js
corepack pnpm -C packages/tuff-native run verify:screenshot-production
node --test packages/tuff-native/*.test.js
corepack pnpm -C packages/test exec vitest run \
  src/native/tuff-native-screenshot.test.ts \
  src/native/tuff-native-audio.test.ts
corepack pnpm -C apps/core-app exec vitest run \
  src/main/modules/native-capabilities/native-transport.test.ts \
  src/main/modules/native-capabilities/native-transport-stream.test.ts \
  src/main/modules/native-capabilities/native-transport-napi.integration.test.ts \
  src/main/modules/native-capabilities/screenshot-protocol-only.contract.test.ts \
  src/main/modules/native-capabilities/screenshot-protocol.test.ts \
  src/main/modules/native-capabilities/screenshot-service.test.ts \
  src/main/modules/native-capabilities/index.test.ts \
  src/main/modules/assistant/module.screenshot-translate.test.ts \
  src/main/modules/box-tool/addon/system/system-actions-provider.test.ts
corepack pnpm -C apps/core-app run typecheck:node

corepack pnpm -C packages/tuff-native pack --dry-run
mise run docs:verify
git diff --check
```

## Stop conditions / ask before

- Do not prompt for Screen Recording or Accessibility from automated tests/smoke.
- Ask before changing the product’s minimum macOS support policy if current release configuration conflicts with ScreenCaptureKit 12.3.
- Ask before installing missing Rust targets/system packages globally.
- Ask before destructive cleanup, git commit/push, Trellis archive, or starting another screenshot task.
- If real mixed-DPI/rotation hardware is unavailable, report that evidence gap; do not mark it passed from synthetic fixtures.
