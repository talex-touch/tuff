'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const manifest = require('./package.json')

const protocolSubpaths = ['./protocol', './protocol-contract', './screenshot-protocol']

test('protocol subpaths are exported only for Node main-process consumers', () => {
  for (const subpath of protocolSubpaths) {
    const entry = manifest.exports[subpath]
    assert.equal(typeof entry.types, 'string')
    assert.equal(typeof entry.require, 'string')
    assert.equal(typeof entry.node, 'string')
    assert.equal(Object.hasOwn(entry, 'default'), false)
    assert.equal(Object.hasOwn(entry, 'browser'), false)
  }
})

test('package removes the legacy screenshot facade', () => {
  assert.equal(Object.hasOwn(manifest.exports, './screenshot'), false)
  const files = new Set(manifest.files)
  assert.equal(files.has('screenshot.js'), false)
  assert.equal(files.has('screenshot.d.ts'), false)
})

test('package files include protocol owners without fixtures or Cargo targets', () => {
  const files = new Set(manifest.files)
  for (const required of [
    'protocol.js',
    'protocol.d.ts',
    'protocol-contract.js',
    'protocol-contract.d.ts',
    'screenshot-protocol.js',
    'screenshot-protocol.d.ts',
    'scripts/verify-screenshot-production.js',
    'native-core/Cargo.toml',
    'native-core/src',
    'native-napi/Cargo.toml',
    'native-napi/src',
    'native-screenshot/src/lib.rs',
    'native-screenshot/src/capability.rs',
    'native-screenshot/src/backend/unavailable.rs',
    'native-screenshot/src/backend/xcap.rs',
    'native-screenshot/src/backend/macos/implementation.rs',
    'native-screenshot/src/backend/macos/system/ax.rs',
    'native-screenshot/src/backend/macos/system/stream.rs',
  ]) {
    assert.equal(files.has(required), true, `missing package file entry: ${required}`)
  }

  for (const entry of files) {
    assert.doesNotMatch(entry, /(^|\/)fixtures?(\/|$)/)
    assert.doesNotMatch(entry, /(^|\/)target(\/|$)/)
    assert.notEqual(entry, 'scripts/build-protocol-fixture.js')
    assert.notEqual(entry, 'native-core')
    assert.notEqual(entry, 'native-napi')
    assert.notEqual(entry, 'native-screenshot')
    assert.notEqual(entry, 'native-screenshot/src')
    assert.notEqual(entry, 'native-audio')
    assert.doesNotMatch(entry, /(?:^|\/)(?:test_fixtures|test_backend|.*_contract_tests)\.rs$/)
  }
})
