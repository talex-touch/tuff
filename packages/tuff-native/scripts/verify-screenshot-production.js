'use strict'

const assert = require('node:assert/strict')
const process = require('node:process')
const { loadScreenshotCarrier } = require('../screenshot-protocol')

const loaded = loadScreenshotCarrier({
  clientName: 'production-addon-verifier',
  clientVersion: '1.0.0',
})
assert.ok(loaded.carrier, `screenshot carrier unavailable: ${loaded.reason}`)

try {
  const capability = loaded.carrier
    .handshake()
    .capabilities
    .find(item => item.id === 'screenshot.capture')
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
      // ScreenshotCapability::features() appends frozen-compose to whatever the
      // backend reports, unconditionally (native-screenshot/src/capability.rs:35-39),
      // so this list could never be just the backend's two. The Rust contract test
      // already expects all three (backend_contract_tests.rs:377); this assertion was
      // the outlier, and it made the Windows leg of native-protocol.yml red on every
      // branch. macOS never noticed because its branch does not assert features.
      assert.deepEqual(capability.features, ['display', 'region', 'frozen-compose'])
    }
  }
}
finally {
  loaded.carrier.dispose()
}
