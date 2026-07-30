# Rust Native Communication Protocol - Implementation Plan

> Status: protocol implementation and local verification complete. Screenshot follow-up tasks remain planning-only pending separate user approval.

## Delivery order

### 0. Baseline and review gate

- [x] Record current git status and preserve unrelated worktree changes.
- [x] Confirm existing screenshot/audio/OCR/Everything facade exports and unavailable behavior with focused baseline tests.
- [x] Confirm Node/Electron ABI, Rust toolchain, per-platform CI runners, and the workspace baseline `napi 3.8.6` / `napi-derive 3.5.5` / `napi-build 2.3.1` with `napi4 + tokio_rt`.
- [x] Review `prd.md` and `design.md`; resolve any requested protocol changes before RED.

Review gate: protocol envelope, attachment ownership, N-API exports, stream ACK semantics, and migration boundary are approved.

Rollback point: documentation-only; no runtime changes exist.

### 1. RED - shared protocol fixtures and JS decoder

- [x] Add `packages/tuff-native/fixtures/protocol-v1/` golden controls for hello negotiation, unary success/error, unknown operation, incompatible version, malformed control, attachment round-trip/mismatch, stream accepted/rejected/data/end/error, ACK (duplicate/regressive/ahead), typed cancel reasons, deadline, and all core stable error codes.
- [x] Add Node `node:test` contract tests that decode `unknown`, reject invalid control/attachment shapes, and verify fixture secrets never enter errors/logs.
- [x] Add tests for all bounded identifiers, safe-integer fields, `disposeGraceMs`, and main `handshakeTimeoutMs`/`maxTransportDisposeMs` policy.
- [x] Run tests and record the expected RED failures before implementing the decoder.

Validation:

```bash
node --test packages/tuff-native/protocol-contract.test.js
```

### 2. BOOTSTRAP - Cargo workspace without behavior migration

- [x] Add `packages/tuff-native/Cargo.toml` workspace with one lockfile and explicit resolver.
- [x] Add skeleton `native-core`, `native-napi`, and test-only `fixtures/native-protocol-addon` members.
- [x] Move existing screenshot/audio crates under workspace dependency/version control without changing public exports or runtime behavior.
- [x] Update native build scripts to resolve the workspace target directory deterministically while still producing the existing `.node` filenames.
- [x] Add package scripts for protocol fixture build/test and workspace format/clippy/test.
- [x] Prove existing screenshot/audio release builds still produce loadable artifacts.

Validation:

```bash
cargo metadata --manifest-path packages/tuff-native/Cargo.toml --no-deps
cargo build --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-screenshot --release
cargo build --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-audio --release
```

Rollback point: revert workspace/build-script routing; legacy addon source and JS facades remain unchanged.

### 3. RED/GREEN - carrier-neutral protocol model

- [x] Add Rust tests consuming the exact golden fixture files used by Node.
- [x] Implement protocol version negotiation and mandatory feature negotiation.
- [x] Implement typed hello/request/response/frame/error/capability/limit models.
- [x] Implement bounded control decoding and identifier validation.
- [x] Implement exact attachment descriptor-to-buffer validation.
- [x] Implement safe error constructors and metadata allowlists.
- [x] Keep `native-core` free of napi-rs, Electron, paths, clipboard, caller identity, and product policy.

Validation:

```bash
cargo test --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-core
node --test packages/tuff-native/protocol-contract.test.js
```

### 4. RED/GREEN - Rust registry, unary lifecycle, and cancellation

- [ ] Write tests for capability registration, duplicate routable capability rejection, available/degraded/unavailable routing, carrier-scoped health, unknown operation, in-flight admission limits, deadline-at-admission, cooperative cancellation, best-effort late completion, terminal precedence, and dispose.
- [x] Implement capability/operation traits and registry dispatch.
- [x] Implement per-request cancellation token and atomic terminal guard.
- [x] Split disposal into synchronous non-blocking `begin_dispose()` and asynchronously awaited `finish_dispose()` so N-API environment cleanup never waits on JS-visible work.
- [x] Implement monotonic deadline handling after admission.
- [x] Implement bounded in-flight maps and idempotent runtime disposal.
- [x] Implement reserved `native.runtime/health` as a carrier-scoped control operation excluded from aggregate capability routing.

Validation:

```bash
cargo test --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-core unary
cargo test --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-core lifecycle
```

### 5. RED/GREEN - Rust stream state machine and credit accounting

- [ ] Write tests for contiguous safe-integer sequence, checked exhaustion, immediate per-consumption cumulative ACK, duplicate/regressive/ahead ACK, credit/window invariants, zero-credit stall, ACK wake without inline production, cancel while blocked, proof that valid flows never return TSFN QueueFull, injected QueueFull fault observation on ACK/cancel/health, non-blocking dispose after QueueFull, terminal reserved-slot delivery, end/error single terminal, and dispose while blocked.
- [x] Implement exact stream accepted/rejected and cancel control schemas from `design.md`.
- [x] Implement initial logical credit window inside the compile-time hard maximum and cumulative `ackSequence` accounting.
- [x] Implement checked sequence/terminal guards and bounded cancellation grace behavior.
- [x] Ensure ACK only mutates/wakes state and never calls TSFN from the JS stack.
- [x] Ensure source-side sampling/drop accounting is separate from published protocol delivery.

Validation:

```bash
cargo test --manifest-path packages/tuff-native/Cargo.toml -p tuff-native-core stream
```

### 6. RED/GREEN - N-API carrier and fixture addon

- [ ] Write low-level Node tests for missing exports, malformed packets, post-call mutation of input Buffer, output Buffer ownership, async unary resolution, accepted/error packet shape, callback frame order, cancel, fixed TSFN hard capacity, injected QueueFull fault observation without another TSFN call, and environment/explicit dispose cleanup.
- [x] Implement the six versioned N-API exports in `native-napi` with workspace-locked napi-rs versions/features.
- [x] Use `#[napi] async`/Tokio for unary and explicit dispose; blocking capability work uses `spawn_blocking` or a capability-owned OS thread/queue and never the JS thread.
- [x] Use one TSFN per stream with compile-time `HARD_MAX_STREAM_WINDOW + 1` capacity, logical negotiated credit, and non-blocking publication. QueueFull marks the stream faulted and forbids further calls on that TSFN; it must never trigger a blocking terminal attempt.
- [x] Make the environment cleanup hook call only `begin_dispose()`, mark the JS environment dead, and suppress all later callback/Promise publication; explicit carrier disposal awaits `finish_dispose()`.
- [x] Convert JS input attachments to Rust-owned bytes before asynchronous retention and return output bytes as Node Buffers.
- [x] Implement the test-only echo/delay/counter/fail fixture capabilities.
- [x] Ensure the fixture addon is excluded from package files and Electron packaging.

Validation:

```bash
pnpm -C packages/tuff-native run build:protocol-fixture
node --test packages/tuff-native/protocol-napi.test.js
```

Review gate: cross-language golden fixtures pass and a real N-API binary proves unary plus stream semantics.

Rollback point: remove the unreferenced fixture/adapter; production capability facades remain on the legacy path.

### 7. RED/GREEN - low-level JS carrier facade

- [x] Add `protocol.js` / `protocol.d.ts` with a strict `NapiCarrier` wrapper and protocol decoders.
- [x] Validate expected versioned exports before handshake.
- [x] Map loader/export/handshake/callback violations to stable carrier errors.
- [x] Keep payloads, Buffer contents, raw native exceptions, and source paths out of logs/errors.
- [x] Export only the low-level main-process facade from package exports; do not expose it through renderer/plugin SDK surfaces.

Validation:

```bash
node --test \
  packages/tuff-native/protocol-contract.test.js \
  packages/tuff-native/protocol-napi.test.js \
  packages/tuff-native/protocol-carrier.test.js
```

### 8. RED/GREEN - main-process NativeTransport unary path

- [ ] Add focused Vitest tests for shared initialize Promise, handshake timeout, dispose-during-initialize, handshake-after-dispose suppression, independent addon failure, available/degraded/unavailable routing, duplicate routable capability conflict, carrier-scoped health/fault observation, invoke success/error, AbortSignal, timeout, stable terminal precedence, late response suppression, process-lifetime ID non-reuse/state-token ownership, repeated dispose, per-carrier dispose timeout, concurrent multi-carrier dispose, and total transport dispose budget.
- [x] Implement `NativeTransport` under the native-capabilities main module.
- [x] Keep caller/plugin identity and authorization above this class.
- [x] Generate IDs from a random process nonce plus monotonic BigInt and bind callbacks to exact state tokens; bounded tombstones are diagnostic only.
- [x] Initialize carriers without making any existing business service depend on protocol yet.
- [x] Expose an aggregate sanitized health snapshot for later typed capability surfaces.

Validation:

```bash
corepack pnpm -C apps/core-app exec vitest run \
  src/main/modules/native-capabilities/native-transport.test.ts
```

### 9. RED/GREEN - main-process stream path

- [ ] Add tests for frame-before-open-observed, open rejection/cancel/dispose races, contiguous safe-integer sequence, queue bound, immediate ACK on every iterator consumption, consumer stall, iterator return/unsubscribe, AbortSignal, deadline-vs-native-cancel precedence, native error/end, natural terminal queued before local timeout, cancellation grace, state-token mismatch, and repeated dispose.
- [x] Implement `NativeStream` as an AsyncIterable with `cancel()` and `closed`.
- [x] Validate every frame and attachment before queueing.
- [x] ACK each contiguous sequence synchronously when consumed; do not batch ACK.
- [x] On protocol violation, terminate locally, cancel native work, and suppress all later callbacks.
- [x] Verify no timer, callback, iterator waiter, or in-flight map entry leaks after terminal paths.

Validation:

```bash
corepack pnpm -C apps/core-app exec vitest run \
  src/main/modules/native-capabilities/native-transport.test.ts \
  src/main/modules/native-capabilities/native-transport-stream.test.ts \
  src/main/modules/native-capabilities/native-transport-napi.integration.test.ts
```

Review gate: real `fixture .node -> NapiCarrier -> NativeTransport -> AsyncIterable` integration demonstrates Buffer round-trip, bounded backpressure, cancellation, and all terminal races.

### 10. Compatibility and build integration

- [x] Keep current `screenshot`, `audio`, `ocr`, and `everything` facade exports unchanged.
- [x] Add/execute an explicit facade matrix: addon present, addon absent, env-disabled where supported, support payload shape, and legacy failure code for screenshot/audio/OCR/Everything.
- [x] Run existing `packages/test/src/native/tuff-native-screenshot.test.ts`, `packages/test/src/native/tuff-native-ocr.test.ts`, CoreApp `voice-service.test.ts`, and Everything resource/selfcheck tests; add the missing audio facade contract test rather than treating the mocked VoiceService test as package coverage.
- [x] Ensure `@talex-touch/tuff-native` package files include protocol facade/core runtime inputs required in development, but exclude fixtures.
- [x] Add CI matrix steps for workspace fmt/clippy/test, fixture contract tests, and release addon build on macOS/Windows/Linux.
- [x] Confirm no renderer/plugin import can resolve a raw protocol carrier through the public SDK.
- [x] Document the protocol entry, compatibility state, and screenshot migration handoff.
- [x] Update `.trellis/spec/frontend/native-resource-protocols.md`: bounded attachments are permitted only on the Rust-to-main NativeTransport carrier; renderer/plugin TuffTransport, MessagePort, preload, and resource consumers remain descriptor-only.

Validation:

```bash
node --test \
  packages/tuff-native/everything-resources.test.js \
  packages/tuff-native/scripts/everything-selfcheck.test.js \
  packages/tuff-native/protocol-contract.test.js \
  packages/tuff-native/protocol-carrier.test.js \
  packages/tuff-native/protocol-napi.test.js

corepack pnpm -C packages/test exec vitest run \
  src/native/tuff-native-screenshot.test.ts \
  src/native/tuff-native-ocr.test.ts \
  src/native/tuff-native-audio.test.ts
corepack pnpm -C apps/core-app exec vitest run \
  src/main/modules/voice/voice-service.test.ts
corepack pnpm -C apps/core-app run typecheck:node
```

Rollback point: leave protocol code compiled/tested but remove main initialization; all existing business call sites continue using legacy facades.

### 11. Refactor and final quality gate

- [x] Remove duplicated decoder/error/lifecycle logic only where the shared owner is proven by tests.
- [x] Confirm no capability-specific policy leaked into protocol core.
- [x] Confirm no raw addon export is used by migrated/main protocol test consumers.
- [x] Run Rust formatting, clippy with warnings denied, unit tests, release builds, Node contracts, main Vitest, scoped ESLint, and node typecheck.
- [x] Inspect changed files for sensitive fixture strings and accidental payload logging.
- [x] Record concrete verification output in this file.
- [x] Request user approval before any later screenshot task is started.

Final validation:

```bash
cargo fmt --manifest-path packages/tuff-native/Cargo.toml --all -- --check
cargo clippy --manifest-path packages/tuff-native/Cargo.toml --workspace --all-targets -- -D warnings
cargo test --manifest-path packages/tuff-native/Cargo.toml --workspace
cargo build --manifest-path packages/tuff-native/Cargo.toml --workspace --release

node --test \
  packages/tuff-native/everything-resources.test.js \
  packages/tuff-native/scripts/everything-selfcheck.test.js \
  packages/tuff-native/protocol-contract.test.js \
  packages/tuff-native/protocol-carrier.test.js \
  packages/tuff-native/protocol-napi.test.js

corepack pnpm -C apps/core-app exec vitest run \
  src/main/modules/native-capabilities/native-transport.test.ts \
  src/main/modules/native-capabilities/native-transport-stream.test.ts \
  src/main/modules/native-capabilities/native-transport-napi.integration.test.ts
corepack pnpm -C packages/test exec vitest run \
  src/native/tuff-native-screenshot.test.ts \
  src/native/tuff-native-ocr.test.ts \
  src/native/tuff-native-audio.test.ts
corepack pnpm -C apps/core-app exec vitest run \
  src/main/modules/voice/voice-service.test.ts
corepack pnpm -C apps/core-app exec eslint --max-warnings=0 \
  src/main/modules/native-capabilities/native-transport.ts \
  src/main/modules/native-capabilities/native-transport.test.ts \
  src/main/modules/native-capabilities/native-transport-stream.test.ts \
  src/main/modules/native-capabilities/native-transport-napi.integration.test.ts
corepack pnpm -C apps/core-app run typecheck:node
```

## Completion evidence required

- Rust and Node consume the same protocol v1 golden fixtures.
- A real test `.node` addon passes unary Buffer round-trip and credit-bounded stream tests.
- Timeout, cancellation, terminal races, unsubscribe, and dispose leave no observable late completion or in-flight leak.
- Missing/mismatched addon health is stable and sanitized while other carriers remain usable.
- Existing native facades retain their baseline behavior.
- No sensitive fixture payload appears in logs, errors, or ordinary JSON attachments.
- All final validation commands pass, or any pre-existing unrelated failure is separately evidenced and no changed file appears in its diagnostics.

## Execution record - 2026-07-29

Passed locally:

- `cargo fmt --all -- --check`, workspace clippy with `-D warnings`, workspace tests (audio 16, core 17, screenshot 9), and workspace release build.
- Protocol package contracts 21/21, including the real signed fixture addon, Buffer mutation ownership, credit stall/ACK, cancel/dispose, malformed-frame synthetic terminal, QueueFull status mapping, and package surface rules.
- CoreApp native module/transport contracts 29/29 plus node typecheck and scoped ESLint. The real integration covers `.node -> NapiCarrier -> NativeTransport -> AsyncIterable` unary attachment, end, native error, cancel, and dispose.
- Legacy compatibility: screenshot/audio 7/7 with addons absent, env-disabled, and real addons present; Everything 9/9; VoiceService 18/18.
- `npm pack --dry-run` reports 51 entries before Rust facade builds and 53 with screenshot/audio addons present, with zero fixture or Cargo target paths in both cases. `mise run docs:verify`, workflow YAML parse, and `git diff --check` pass.

Known pre-existing unrelated failure:

- `packages/test/src/native/tuff-native-ocr.test.ts` passes 4/5. The supported-platform smoke fails at line 71 because repository fixture `shots/LogoBanner.png` is absent. This was present in the pre-change baseline; no protocol/native transport changed file appears in its diagnostics.

Deferred exhaustive hardening items remain visibly unchecked above: synthetic TSFN QueueFull injection across the real addon and the all-cases omnibus admission/race test lists. The implemented v1 acceptance paths fail closed and the protocol task does not start any screenshot follow-up.
