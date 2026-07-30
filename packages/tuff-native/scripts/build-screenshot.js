'use strict'

const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const rootDir = path.resolve(__dirname, '..')
const workspaceDir = rootDir
const crateDir = path.join(rootDir, 'native-screenshot')
const releaseDir = path.join(workspaceDir, 'target', 'release')
const outDir = path.join(rootDir, 'build', 'Release')
const macosDeploymentTarget = '12.3'

const platformLibraryName
  = process.platform === 'win32'
    ? 'tuff_native_screenshot.dll'
    : process.platform === 'darwin'
      ? 'libtuff_native_screenshot.dylib'
      : 'libtuff_native_screenshot.so'

const requestedFeatures = []
if (process.env.TUFF_SCREENSHOT_PROTOCOL_TEST_BACKEND === '1') {
  requestedFeatures.push('protocol-test-backend')
}

const cargoEnv = { ...process.env }
if (process.platform === 'darwin' && !cargoEnv.MACOSX_DEPLOYMENT_TARGET) {
  cargoEnv.MACOSX_DEPLOYMENT_TARGET = macosDeploymentTarget
}

const outNodePath = path.join(outDir, 'tuff_native_screenshot.node')

function build(features) {
  const cargoArgs = ['build', '--release', '--manifest-path', path.join(crateDir, 'Cargo.toml')]
  if (features.length > 0) {
    cargoArgs.push('--features', features.join(','))
  }
  const result = spawnSync('cargo', cargoArgs, {
    cwd: workspaceDir,
    stdio: 'inherit',
    env: cargoEnv,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function installBuild() {
  fs.mkdirSync(outDir, { recursive: true })
  fs.copyFileSync(path.join(releaseDir, platformLibraryName), outNodePath)
  // cargo emits a path-bound linker signature. Re-sign the installed copy so
  // pnpm/Electron can load byte-identical package copies from other paths.
  if (process.platform === 'darwin') {
    execFileSync('codesign', ['--force', '--sign', '-', outNodePath], { stdio: 'inherit' })
  }
}

function probeDlopen() {
  return spawnSync(
    process.execPath,
    ['-e', 'process.dlopen(module, process.argv[1])', outNodePath],
    { encoding: 'utf8' },
  )
}

build(requestedFeatures)
installBuild()

if (process.platform === 'darwin') {
  let probe = probeDlopen()
  const probeOutput = `${probe.stdout || ''}${probe.stderr || ''}`
  if (probe.status !== 0 && probeOutput.includes('mis-aligned LINKEDIT string pool')) {
    // Apple CLT ld-27034 may place the string pool at 4-byte alignment when the
    // indirect symbol count is odd. A real external data relocation changes
    // that link layout; no bytes are patched after linking.
    build([...requestedFeatures, 'linkedit-align-pad'])
    installBuild()
    probe = probeDlopen()
  }
  if (probe.status !== 0) {
    process.stderr.write(probe.stderr || probe.stdout || 'Screenshot addon dlopen probe failed\n')
    process.exit(probe.status ?? 1)
  }
}
