'use strict'

const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const rootDir = path.resolve(__dirname, '..')
const workspaceDir = rootDir
const crateDir = path.join(rootDir, 'native-audio')
const releaseDir = path.join(workspaceDir, 'target', 'release')
const packagedOutDir = path.join(rootDir, 'build', 'Release')

const platformLibraryName
  = process.platform === 'win32'
    ? 'tuff_native_audio.dll'
    : process.platform === 'darwin'
      ? 'libtuff_native_audio.dylib'
      : 'libtuff_native_audio.so'

const result = spawnSync('cargo', ['build', '--release', '--manifest-path', path.join(crateDir, 'Cargo.toml')], {
  cwd: workspaceDir,
  stdio: 'inherit',
  env: process.env,
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

// Keep a single runtime location for both development and packaging. Plain ad-hoc
// signing makes the copied Cargo dylib loadable on Apple Silicon.
fs.mkdirSync(packagedOutDir, { recursive: true })
const packagedNodePath = path.join(packagedOutDir, 'tuff_native_audio.node')
const stagingDir = fs.mkdtempSync(path.join(packagedOutDir, '.audio-'))
try {
  const stagedNodePath = path.join(stagingDir, 'tuff_native_audio.node')
  fs.copyFileSync(path.join(releaseDir, platformLibraryName), stagedNodePath)
  if (process.platform === 'darwin') {
    execFileSync('codesign', ['--force', '--sign', '-', stagedNodePath], { stdio: 'inherit' })
  }
  // Never truncate an addon still mapped by a running development process.
  fs.renameSync(stagedNodePath, packagedNodePath)
}
finally {
  fs.rmSync(stagingDir, { recursive: true, force: true })
}
