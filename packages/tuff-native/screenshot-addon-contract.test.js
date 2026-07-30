'use strict'

const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const binding = require(path.join(
  __dirname,
  'build',
  'Release',
  'tuff_native_screenshot.node',
))

const protocolExports = [
  'nativeProtocolV1Ack',
  'nativeProtocolV1Cancel',
  'nativeProtocolV1Dispose',
  'nativeProtocolV1Handshake',
  'nativeProtocolV1Invoke',
  'nativeProtocolV1OpenStream',
]
const removedExports = [
  'getNativeScreenshotSupport',
  'listDisplays',
  'captureDisplay',
  'captureRegion',
  'capture',
]

test('screenshot addon exposes only protocol v1', () => {
  assert.deepEqual(Object.keys(binding).sort(), protocolExports)
  for (const name of removedExports) {
    assert.equal(Object.hasOwn(binding, name), false, name)
  }
})

test('platform crates are exact-pinned and target-scoped', () => {
  const manifestPath = path.join(__dirname, 'Cargo.toml')
  const metadata = JSON.parse(childProcess.execFileSync('cargo', [
    'metadata',
    '--format-version',
    '1',
    '--no-deps',
    '--manifest-path',
    manifestPath,
  ], { encoding: 'utf8' }))
  const screenshot = metadata.packages.find(item => item.name === 'tuff-native-screenshot')
  assert.ok(screenshot)
  assert.equal(screenshot.metadata['tuff-native']['macos-deployment-target'], '12.3')
  const buildScript = fs.readFileSync(path.join(
    __dirname,
    'scripts',
    'build-screenshot.js',
  ), 'utf8')
  assert.match(buildScript, /const macosDeploymentTarget = '12\.3'/)
  assert.match(buildScript, /cargoEnv\.MACOSX_DEPLOYMENT_TARGET = macosDeploymentTarget/)
  const expected = new Map([
    ['block2', '=0.6.2'],
    ['dispatch2', '=0.3.1'],
    ['objc2', '=0.6.4'],
    ['objc2-application-services', '=0.3.2'],
    ['objc2-core-foundation', '=0.3.2'],
    ['objc2-core-graphics', '=0.3.2'],
    ['objc2-core-media', '=0.3.2'],
    ['objc2-core-video', '=0.3.2'],
    ['objc2-foundation', '=0.3.2'],
    ['objc2-screen-capture-kit', '=0.3.2'],
  ])
  const appleDependencies = screenshot.dependencies.filter(dependency => expected.has(dependency.name))
  assert.equal(appleDependencies.length, expected.size)
  for (const dependency of appleDependencies) {
    assert.equal(dependency.req, expected.get(dependency.name), dependency.name)
    assert.equal(dependency.target, 'cfg(target_os = "macos")', dependency.name)
  }
  const xcap = screenshot.dependencies.find(dependency => dependency.name === 'xcap')
  assert.ok(xcap)
  assert.equal(xcap.req, '=0.9.4')
  assert.equal(xcap.target, 'cfg(any(target_os = "windows", target_os = "linux"))')
  assert.match(buildScript, /mis-aligned LINKEDIT string pool/)
  assert.match(buildScript, /linkedit-align-pad/)
  assert.match(buildScript, /process\.dlopen/)
})

test('permission probes cannot invoke system prompts', () => {
  const systemSource = fs.readFileSync(path.join(
    __dirname,
    'native-screenshot',
    'src',
    'backend',
    'macos',
    'system.rs',
  ), 'utf8')
  assert.match(systemSource, /CGPreflightScreenCaptureAccess\(\)/)
  assert.match(systemSource, /AXIsProcessTrusted\(\)/)
  assert.doesNotMatch(systemSource, /CGRequestScreenCaptureAccess/)
  assert.doesNotMatch(systemSource, /AXIsProcessTrustedWithOptions/)
  assert.doesNotMatch(systemSource, /kAXTrustedCheckOptionPrompt/)
})

test('native screenshot has no Swift or Objective-C side target', () => {
  const crateDir = path.join(__dirname, 'native-screenshot')
  const forbiddenExtensions = new Set(['.swift', '.m', '.mm'])
  const pending = [crateDir]
  while (pending.length > 0) {
    const current = pending.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        pending.push(entryPath)
      }
      else {
        assert.equal(forbiddenExtensions.has(path.extname(entry.name)), false, entryPath)
      }
    }
  }
  const buildScript = fs.readFileSync(path.join(crateDir, 'build.rs'), 'utf8')
  assert.doesNotMatch(buildScript, /swiftc|clang|\.swift|\.mm|\.m\b/)
})

test('loading screenshot addon does not initialize other capability addons', () => {
  const loadedNativeModules = Object.keys(require.cache).filter(file => file.endsWith('.node'))
  assert.equal(loadedNativeModules.some(file => file.includes('tuff_native_audio')), false)
  assert.equal(loadedNativeModules.some(file => file.includes('tuff_native_ocr')), false)
})
