'use strict'

const assert = require('node:assert/strict')
const { loadScreenshotCarrier } = require('../screenshot-protocol')

const loaded = loadScreenshotCarrier({
  clientName: 'production-addon-verifier',
  clientVersion: '1.0.0',
})
assert.ok(loaded.carrier, `screenshot carrier unavailable: ${loaded.reason}`)

try {
  const capability = loaded.carrier
    .handshake()
    .capabilities.find(item => item.id === 'screenshot.capture')
  assert.ok(capability, 'screenshot.capture capability missing')
  assert.notEqual(capability.engine, 'deterministic-test')

  if (process.platform === 'darwin') {
    assert.equal(capability.engine, 'screen-capture-kit')
    assert.equal(capability.state, 'available')
  }
  else if (process.platform === 'win32' || process.platform === 'linux') {
    assert.equal(capability.engine, 'xcap')
    const unavailableLinuxReasons = new Set([
      'wayland-unsupported',
      'display-server-unavailable',
    ])
    if (process.platform === 'linux' && unavailableLinuxReasons.has(capability.reason)) {
      assert.equal(capability.state, 'unavailable')
      assert.deepEqual(capability.features, [])
    }
    else {
      assert.equal(capability.state, 'degraded')
      assert.equal(capability.reason, 'basic-backend-only')
      assert.deepEqual(capability.features, ['display', 'region'])
    }
  }
}
finally {
  loaded.carrier.dispose()
}
