const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { requiredNativeAddonNames } = require('./runtime-modules')

/** Where every @talex-touch/tuff-native addon is expected, gyp-built and Cargo-built alike. */
function nativeAddonReleaseDir(projectRoot) {
  return path.join(projectRoot, 'node_modules', '@talex-touch', 'tuff-native', 'build', 'Release')
}

/** OTA cannot safely hand off without a standalone executable atomic-swap helper. */
function verifyMacUpdateHelper(releaseDir) {
  const helper = path.join(releaseDir, 'tuff-native-update')
  try {
    if (!fs.lstatSync(helper).isFile()) {
      throw new Error('not a regular file (symlinks are not allowed)')
    }
    fs.accessSync(helper, fs.constants.X_OK)
  } catch (error) {
    throw new Error(
      `Required macOS update helper missing or not executable: ${helper}. Run build:update -- --universal in @talex-touch/tuff-native.`,
      { cause: error }
    )
  }
}

/**
 * Cargo-built artifacts that live under `build/Release` alongside `requiredNativeAddonNames(target)`
 * and are wiped by `electron-builder install-app-deps` (`node-gyp rebuild`), because `binding.gyp`
 * only knows about `tuff_native_ocr.node` and `tuff_native_everything.node`.
 *
 * Preserving them when present does NOT make them required for local developer builds
 * (`preserveRequiredNativeAddons` skips missing files), while ensuring CI release builds — which
 * explicitly ran `build:screenshot` and `build-ocr.js` prior to `build-target.js` — do not lose
 * them on Windows and Linux (#321 / R1).
 */
function separatelyBuiltNativeAddonNames(target) {
  const isWin = target === 'win' || target === 'win32'
  return [
    ...requiredNativeAddonNames(target),
    'tuff_native_screenshot.node',
    isWin ? 'tuff-native-ocr.exe' : 'tuff-native-ocr'
  ]
}

/**
 * electron-builder's install-app-deps rebuilds @talex-touch/tuff-native with node-gyp, and its
 * clean step removes `build/Release` wholesale: it cannot know that the audio, screenshot, and
 * Rust helper binaries in that directory came from Cargo rather than from binding.gyp. Nothing
 * rebuilds them afterwards, so on the Windows and Linux legs — the two that do not set
 * SKIP_INSTALL_APP_DEPS — separately built artifacts went missing between the build that made them
 * and packaging. Keep a copy across the rebuild and put back what it dropped.
 *
 * Only addons that are already there are kept: a run that never built them must still fail the
 * presence check for required addons, with the message that says which step produces them. A copy
 * that fails part way takes the half-filled backup with it, so an unreadable addon tree leaves
 * nothing behind either.
 */
function preserveRequiredNativeAddons({ projectRoot, target, tempRoot = os.tmpdir() }) {
  const releaseDir = nativeAddonReleaseDir(projectRoot)
  const backupDir = fs.mkdtempSync(path.join(tempRoot, 'tuff-native-addons-'))
  const kept = []
  try {
    for (const moduleName of new Set(separatelyBuiltNativeAddonNames(target))) {
      const source = path.join(releaseDir, moduleName)
      if (!fs.existsSync(source)) continue
      fs.copyFileSync(source, path.join(backupDir, moduleName))
      kept.push(moduleName)
    }
  } catch (error) {
    fs.rmSync(backupDir, { recursive: true, force: true })
    throw error
  }
  return { backupDir, kept }
}

/** Puts back the kept addons the rebuild removed, and drops the backup even when that fails. */
function restorePreservedNativeAddons({ projectRoot, preserved }) {
  const releaseDir = nativeAddonReleaseDir(projectRoot)
  const restored = []
  try {
    for (const moduleName of preserved.kept) {
      const destination = path.join(releaseDir, moduleName)
      if (fs.existsSync(destination)) continue
      // The rebuild may have taken the whole directory with it, not just the file.
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(path.join(preserved.backupDir, moduleName), destination)
      restored.push(moduleName)
    }
  } finally {
    fs.rmSync(preserved.backupDir, { recursive: true, force: true })
  }
  return restored
}

module.exports = {
  nativeAddonReleaseDir,
  separatelyBuiltNativeAddonNames,
  verifyMacUpdateHelper,
  preserveRequiredNativeAddons,
  restorePreservedNativeAddons
}
