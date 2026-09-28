const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { requiredNativeAddonNames } = require('./runtime-modules')

/** Where every @talex-touch/tuff-native addon is expected, gyp-built and Cargo-built alike. */
function nativeAddonReleaseDir(projectRoot) {
  return path.join(projectRoot, 'node_modules', '@talex-touch', 'tuff-native', 'build', 'Release')
}

/**
 * electron-builder's install-app-deps rebuilds @talex-touch/tuff-native with node-gyp, and its
 * clean step removes `build/Release` wholesale: it cannot know that the audio and screenshot
 * addons in that directory came from Cargo rather than from binding.gyp. Nothing rebuilds them
 * afterwards, so on the Windows and Linux legs — the two that do not set
 * SKIP_INSTALL_APP_DEPS — a required addon went missing between the build that made it and the
 * presence check that follows. Keep a copy across the rebuild and put back what it dropped.
 *
 * Only addons that are already there are kept: a run that never built them must still fail the
 * check, with the message that says which step produces them. A copy that fails part way takes
 * the half-filled backup with it, so an unreadable addon tree leaves nothing behind either.
 */
function preserveRequiredNativeAddons({ projectRoot, target, tempRoot = os.tmpdir() }) {
  const releaseDir = nativeAddonReleaseDir(projectRoot)
  const backupDir = fs.mkdtempSync(path.join(tempRoot, 'tuff-native-addons-'))
  const kept = []
  try {
    for (const moduleName of requiredNativeAddonNames(target)) {
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
  preserveRequiredNativeAddons,
  restorePreservedNativeAddons
}
