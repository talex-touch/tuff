'use strict'

/**
 * Proves `tuff_native_audio.node` was built and loads, without requiring a microphone.
 *
 * The audio crate is already a member of `packages/tuff-native/Cargo.toml`, so
 * `cargo build --workspace --release` in native-protocol.yml compiles it on all three runners.
 * What nothing did was run `build:audio` — the step that copies the compiled library to
 * `build/Release/tuff_native_audio.node` — or load the result. So the crate could compile
 * while the artifact the runtime actually opens was never produced (#322).
 *
 * The check has to work on a headless runner with no audio device, and the useful distinction
 * is *who* produced the unsupported reason:
 *
 *   - the native module itself reports `no-input-device`, `input-probe-failed: …` or
 *     `platform-not-supported` (native-audio/src/lib.rs `build_native_audio_support`). Reaching
 *     any of those means the addon loaded, which is the thing being verified.
 *   - the JS wrapper reports `native-module-not-loaded`, an `ERR_NATIVE_EXPORT_MISMATCH`
 *     message, or a loader error string when the `.node` is absent or incomplete. That is the
 *     packaging bug.
 *
 * So an absent microphone passes and an absent module fails, which is the same shape as
 * verify-screenshot-production.js accepting `display-server-unavailable` on Linux.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')
const { getNativeAudioSupport } = require('../audio')

const modulePath = path.join(__dirname, '..', 'build', 'Release', 'tuff_native_audio.node')

assert.ok(
  fs.existsSync(modulePath),
  `tuff_native_audio.node missing at ${modulePath} — run \`pnpm -C packages/tuff-native build:audio\``,
)

const support = getNativeAudioSupport()

// The native module reports Rust's `std::env::consts::OS`; the JS wrapper, when the binding is
// absent, reports `process.platform`. Those names differ on macOS and Windows, so this assertion
// is itself proof of which side answered — a wrapper fallback would say `darwin`, not `macos`.
// They coincide on Linux, which is why the reason check below still has to carry that platform.
const RUST_OS_NAME = { darwin: 'macos', win32: 'windows', linux: 'linux' }
const expectedOs = RUST_OS_NAME[process.platform] ?? process.platform
assert.equal(
  support.platform,
  expectedOs,
  `expected the native module's OS name (${expectedOs}); got ${support.platform}`,
)

// Reasons the native module can produce. Anything outside this set — including `undefined`
// alongside `supported: false` — came from the wrapper, which means the binding never loaded.
const NATIVE_REASONS = new Set(['no-input-device', 'platform-not-supported'])
function isNativeReason(reason) {
  return typeof reason === 'string'
    && (NATIVE_REASONS.has(reason) || reason.startsWith('input-probe-failed: '))
}

if (!support.supported) {
  assert.ok(
    isNativeReason(support.reason),
    `native audio addon did not load: ${support.reason ?? 'no reason reported'}`,
  )
  console.log(`[verify-audio-production] addon loaded; no device on this host (${support.reason})`)
}
else {
  assert.equal(support.reason, undefined)
  console.log('[verify-audio-production] addon loaded and an input device is available')
}
