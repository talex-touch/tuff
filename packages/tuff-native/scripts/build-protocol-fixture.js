'use strict'

const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const workspaceDir = path.resolve(__dirname, '..')
const manifestPath = path.join(
  workspaceDir,
  'fixtures',
  'native-protocol-addon',
  'Cargo.toml',
)
const releaseDir = path.join(workspaceDir, 'target', 'release')
const outDir = path.join(workspaceDir, 'build', 'fixtures')
const platformLibraryName
  = process.platform === 'win32'
    ? 'tuff_native_protocol_fixture.dll'
    : process.platform === 'darwin'
      ? 'libtuff_native_protocol_fixture.dylib'
      : 'libtuff_native_protocol_fixture.so'

const result = spawnSync(
  'cargo',
  ['build', '--release', '--manifest-path', manifestPath],
  {
    cwd: workspaceDir,
    stdio: 'inherit',
    env: process.env,
  },
)

if (result.status !== 0)
  process.exit(result.status ?? 1)

fs.mkdirSync(outDir, { recursive: true })
const outputPath = path.join(outDir, 'tuff_native_protocol_fixture.node')
fs.copyFileSync(path.join(releaseDir, platformLibraryName), outputPath)
if (process.platform === 'darwin') {
  execFileSync('codesign', ['--force', '--sign', '-', outputPath], {
    stdio: 'inherit',
  })
}

process.stdout.write(`${outputPath}\n`)
