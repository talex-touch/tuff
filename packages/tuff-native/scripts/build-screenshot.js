'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const rootDir = path.resolve(__dirname, '..')
const crateDir = path.join(rootDir, 'native-screenshot')
const releaseDir = path.join(crateDir, 'target', 'release')
const outDir = path.join(rootDir, 'build', 'Release')

const platformLibraryName =
  process.platform === 'win32'
    ? 'tuff_native_screenshot.dll'
    : process.platform === 'darwin'
      ? 'libtuff_native_screenshot.dylib'
      : 'libtuff_native_screenshot.so'

const result = spawnSync('cargo', ['build', '--release'], {
  cwd: crateDir,
  stdio: 'inherit',
  env: process.env,
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

fs.mkdirSync(outDir, { recursive: true })
fs.copyFileSync(
  path.join(releaseDir, platformLibraryName),
  path.join(outDir, 'tuff_native_screenshot.node'),
)
