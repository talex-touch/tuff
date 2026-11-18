'use strict'

const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const workspaceDir = path.resolve(__dirname, '..')
const packagedOutDir = path.join(workspaceDir, 'build', 'Release')
const args = process.argv.slice(2)
const targetIndex = args.indexOf('--target')

if (
  args.some(
    (arg, index) =>
      arg !== '--universal' && arg !== '--target' && !(targetIndex !== -1 && index === targetIndex + 1),
  )
) {
  throw new Error('Usage: build-ocr.js [--universal | --target <rust-target>]')
}
if (targetIndex !== -1 && !args[targetIndex + 1]) {
  throw new Error('--target requires a Rust target')
}
if (args.includes('--universal') && (process.platform !== 'darwin' || targetIndex !== -1)) {
  throw new Error('--universal requires macOS and cannot be combined with --target')
}

const explicitTarget = targetIndex !== -1 ? args[targetIndex + 1] : null
const universal = args.includes('--universal')
const isWindowsTarget = explicitTarget
  ? explicitTarget.includes('windows')
  : process.platform === 'win32'
const binaryName = isWindowsTarget ? 'tuff-native-ocr.exe' : 'tuff-native-ocr'
const packagedBinaryPath = path.join(packagedOutDir, binaryName)

function runCargoBuild(rustTarget) {
  const cargoArgs = ['build', '--release', '--locked', '-p', 'tuff-native-ocr']
  if (rustTarget) {
    cargoArgs.push('--target', rustTarget)
  }
  const result = spawnSync('cargo', cargoArgs, {
    cwd: workspaceDir,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.error) {
    throw new Error(`Unable to run cargo: ${result.error.message}`)
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
  return rustTarget
    ? path.join(workspaceDir, 'target', rustTarget, 'release', binaryName)
    : path.join(workspaceDir, 'target', 'release', binaryName)
}

fs.mkdirSync(packagedOutDir, { recursive: true })
const stagingDir = fs.mkdtempSync(path.join(packagedOutDir, '.ocr-'))
try {
  const stagedBinaryPath = path.join(stagingDir, binaryName)
  if (universal) {
    const armBinary = runCargoBuild('aarch64-apple-darwin')
    const x64Binary = runCargoBuild('x86_64-apple-darwin')
    execFileSync('lipo', ['-create', armBinary, x64Binary, '-output', stagedBinaryPath], {
      stdio: 'inherit',
    })
  }
  else {
    const builtBinary = runCargoBuild(explicitTarget)
    fs.copyFileSync(builtBinary, stagedBinaryPath)
  }

  if (!isWindowsTarget) {
    fs.chmodSync(stagedBinaryPath, 0o755)
  }
  if (process.platform === 'darwin' && (!explicitTarget || explicitTarget.includes('apple-darwin'))) {
    execFileSync('codesign', ['--force', '--sign', '-', stagedBinaryPath], { stdio: 'inherit' })
  }
  // Never truncate a binary still mapped by a running process.
  fs.renameSync(stagedBinaryPath, packagedBinaryPath)
}
finally {
  fs.rmSync(stagingDir, { recursive: true, force: true })
}
