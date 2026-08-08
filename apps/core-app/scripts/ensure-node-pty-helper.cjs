/**
 * node-pty ships `spawn-helper` as a separate executable and can lose its
 * executable bit through some install paths, which then fails at runtime when a
 * PTY is spawned rather than at install time. This restores it.
 *
 * It must not be able to fail an install. This runs from core-app's postinstall,
 * so throwing here does not degrade the terminal -- it stops the repo from
 * installing at all, on every workflow whose first step is `pnpm install`.
 */

const fs = require('node:fs')
const path = require('node:path')

function ensureHelperExecutable() {
  if (process.platform === 'win32') {
    return
  }

  let packageRoot
  try {
    packageRoot = path.dirname(path.dirname(require.resolve('node-pty')))
  }
  catch {
    // A filtered or partial install may not have node-pty at all. Nothing to fix.
    return
  }

  // Two layouts, depending on how node-pty installed itself. `prebuilds/` is
  // populated when it downloads a prebuild; when it finds none it falls back to
  // `node-gyp rebuild`, which writes to `build/Release/` and leaves no `prebuilds/`
  // directory behind. The original check knew only the first, so a perfectly good
  // source build looked like a broken install.
  const candidates = [
    path.join(packageRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
    path.join(packageRoot, 'build', 'Release', 'spawn-helper')
  ]

  const helper = candidates.find(candidate => fs.existsSync(candidate))

  if (!helper) {
    // Not necessarily a fault: on Linux the gyp build produces pty.node alone and no
    // spawn-helper target runs at all. Say so and carry on. If a platform does need
    // it and it is genuinely missing, node-pty reports that when a PTY is spawned,
    // which is a better place to find out than a failed install of the whole repo.
    console.warn(
      `[ensure-node-pty-helper] no spawn-helper found for ${process.platform}-${process.arch}; `
      + `skipping chmod. Looked in:\n  ${candidates.join('\n  ')}`
    )
    return
  }

  try {
    fs.chmodSync(helper, 0o755)
  }
  catch (error) {
    console.warn(`[ensure-node-pty-helper] could not chmod ${helper}:`, error)
  }
}

ensureHelperExecutable()
