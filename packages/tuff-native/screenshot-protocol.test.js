'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const golden = require('./fixtures/protocol-v1/golden.json')
const { NativeCarrierError } = require('./protocol')
const {
  SCREENSHOT_PROTOCOL_EXPORTS,
  createScreenshotCarrier,
  loadScreenshotCarrier,
} = require('./screenshot-protocol')

function fullBinding(overrides = {}) {
  return {
    nativeProtocolV1Handshake: () => JSON.stringify(golden.serverHello),
    nativeProtocolV1Invoke: async control => ({
      control: JSON.stringify({
        kind: 'response',
        protocol: { major: 1, minor: 0 },
        requestId: JSON.parse(control).requestId,
        ok: true,
        payload: null,
        attachments: [],
        meta: { durationMs: 0 },
      }),
      attachments: [],
    }),
    nativeProtocolV1OpenStream: control => ({
      control: JSON.stringify({
        kind: 'response',
        protocol: { major: 1, minor: 0 },
        requestId: JSON.parse(control).requestId,
        ok: true,
        payload: {
          streamId: JSON.parse(control).payload.streamId,
          effectiveWindow: 1,
          cancellation: 'cooperative',
        },
        attachments: [],
        meta: { durationMs: 0 },
      }),
      attachments: [],
    }),
    nativeProtocolV1Ack: () => {},
    nativeProtocolV1Cancel: () => {},
    nativeProtocolV1Dispose: async () => {},
    ...overrides,
  }
}

test('reports an absent screenshot binding without raw loader details', () => {
  const loaded = loadScreenshotCarrier({
    baseDir: '/definitely-not-a-real-tuff-native-package',
  })
  assert.equal(loaded.carrier, null)
  assert.equal(loaded.reason, 'binding-unavailable')
  assert.equal(Object.hasOwn(loaded, 'error'), false)
})

test('env disable suppresses protocol carrier creation', () => {
  const previous = process.env.TUFF_DISABLE_NATIVE_SCREENSHOT
  process.env.TUFF_DISABLE_NATIVE_SCREENSHOT = '1'
  try {
    const loaded = loadScreenshotCarrier({ binding: fullBinding() })
    assert.deepEqual(loaded, { carrier: null, reason: 'disabled-by-env' })
  }
  finally {
    if (previous === undefined)
      delete process.env.TUFF_DISABLE_NATIVE_SCREENSHOT
    else process.env.TUFF_DISABLE_NATIVE_SCREENSHOT = previous
  }
})

test('rejects an incomplete old binding with a sanitized export mismatch', () => {
  assert.throws(
    () => createScreenshotCarrier({ binding: {} }),
    error => error instanceof NativeCarrierError
      && error.code === 'CARRIER_EXPORT_MISMATCH'
      && !error.message.includes('nativeProtocolV1Handshake'),
  )
})

test('creates a full NapiCarrier and caches its handshake', () => {
  let handshakes = 0
  const carrier = createScreenshotCarrier({
    binding: fullBinding({
      nativeProtocolV1Handshake() {
        handshakes += 1
        return JSON.stringify(golden.serverHello)
      },
    }),
    clientVersion: '2.4.13',
  })

  assert.equal(SCREENSHOT_PROTOCOL_EXPORTS.length, 6)
  assert.equal(carrier.id, 'screenshot')
  assert.equal(carrier.handshake(), carrier.handshake())
  assert.equal(handshakes, 1)
})
