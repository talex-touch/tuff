const fs = require('node:fs')
const path = require('node:path')

function ensureSpawnHelper() {
  if (process.platform === 'win32') return

  let entry
  try {
    entry = require.resolve('node-pty')
  } catch {
    console.warn('[ensure-node-pty-helper] node-pty is not installed; nothing to prepare.')
    return
  }
  const helper = path.resolve(
    path.dirname(entry),
    '..',
    'prebuilds',
    `${process.platform}-${process.arch}`,
    'spawn-helper'
  )
  // Warn rather than throw. This is apps/core-app's postinstall, so a platform whose node-pty
  // prebuild is absent takes down `pnpm install` for the whole workspace -- which is what it did
  // on linux-x64 the first time it reached CI after the app-shell-v2 merge. The job here is to
  // make an existing helper executable; a missing one means the local AI CLI terminal is
  // unavailable on that platform, not that the install failed.
  if (fs.existsSync(helper)) {
    fs.chmodSync(helper, 0o755)
  } else {
    console.warn(
      `[ensure-node-pty-helper] no node-pty spawn-helper for ${process.platform}-${process.arch}; ` +
        'the local AI CLI terminal will be unavailable on this platform.'
    )
  }
}

ensureSpawnHelper()
