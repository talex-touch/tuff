'use strict'

const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const rootDir = path.resolve(__dirname, '..')
const crateDir = path.join(rootDir, 'native-audio')
const releaseDir = path.join(crateDir, 'target', 'release')
const outDir = path.join(rootDir, 'build', 'Release')

const platformLibraryName
  = process.platform === 'win32'
    ? 'tuff_native_audio.dll'
    : process.platform === 'darwin'
      ? 'libtuff_native_audio.dylib'
      : 'libtuff_native_audio.so'

const result = spawnSync('cargo', ['build', '--release'], {
  cwd: crateDir,
  stdio: 'inherit',
  env: process.env,
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

fs.mkdirSync(outDir, { recursive: true })
const outNodePath = path.join(outDir, 'tuff_native_audio.node')
fs.copyFileSync(path.join(releaseDir, platformLibraryName), outNodePath)

// macOS/Apple Silicon: cargo emits the dylib ad-hoc *linker-signed* (codesign
// flags 0x20002). A byte-identical copy of a linker-signed Mach-O is SIGKILLed by
// AMFI on load ("Killed: 9") from any path other than where it was built — which
// breaks the pnpm-managed core-app copy of this package. Re-sign with a plain
// ad-hoc signature (flags 0x2) so every copy loads from any path.
if (process.platform === 'darwin') {
  execFileSync('codesign', ['--force', '--sign', '-', outNodePath], { stdio: 'inherit' })
}

