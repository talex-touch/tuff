'use strict'

const assert = require('node:assert/strict')
const { Buffer } = require('node:buffer')
const path = require('node:path')
const test = require('node:test')
const golden = require('./fixtures/protocol-v1/golden.json')
const {
  EXPECTED_EXPORTS,
  NapiCarrier,
  NativeCarrierError,
} = require('./protocol')
const { PROTOCOL_V1 } = require('./protocol-contract')

function realBinding() {
  return require(path.join(
    __dirname,
    'build',
    'fixtures',
    'tuff_native_protocol_fixture.node',
  ))
}

function fakeBinding(overrides = {}) {
  return {
    nativeProtocolV1Handshake: () => JSON.stringify(golden.serverHello),
    nativeProtocolV1Invoke: async control => ({
      control: JSON.stringify({
        kind: 'response',
        protocol: PROTOCOL_V1,
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
        protocol: PROTOCOL_V1,
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

function request(requestId, capability = 'fixture.echo', operation = 'echo', payload = null) {
  return {
    kind: 'request',
    protocol: PROTOCOL_V1,
    requestId,
    capability,
    operation,
    payload,
    attachments: [],
  }
}

test('rejects incomplete bindings without exposing raw binding details', () => {
  const secret = 'private-addon-path'
  assert.throws(
    () => new NapiCarrier({
      id: 'missing-addon',
      binding: { nativeProtocolV1Handshake: () => secret },
    }),
    error => error instanceof NativeCarrierError
      && error.code === 'CARRIER_EXPORT_MISMATCH'
      && !error.message.includes(secret),
  )
  assert.equal(EXPECTED_EXPORTS.length, 6)
})

test('handshake is cached and runtime health stays carrier-scoped', async () => {
  let handshakes = 0
  const binding = fakeBinding({
    nativeProtocolV1Handshake() {
      handshakes += 1
      return JSON.stringify(golden.serverHello)
    },
  })
  const carrier = new NapiCarrier({ id: 'fake-carrier', binding })
  assert.equal(carrier.handshake(), carrier.handshake())
  assert.equal(handshakes, 1)
  await carrier.health()
  await carrier.dispose()
})

test('terminal callback suppresses later native ACK and release is idempotent', () => {
  let acknowledgements = 0
  const frames = []
  const binding = fakeBinding({
    nativeProtocolV1OpenStream(control, _attachments, onFrame) {
      const parsed = JSON.parse(control)
      const streamId = parsed.payload.streamId
      onFrame({
        control: JSON.stringify({
          kind: 'stream_data',
          protocol: PROTOCOL_V1,
          streamId,
          sequence: 1,
          payload: { value: 1 },
          attachments: [],
        }),
        attachments: [],
      })
      onFrame({
        control: JSON.stringify({
          kind: 'stream_end',
          protocol: PROTOCOL_V1,
          streamId,
          sequence: 2,
          payload: { emitted: 1 },
          attachments: [],
        }),
        attachments: [],
      })
      return {
        control: JSON.stringify({
          kind: 'response',
          protocol: PROTOCOL_V1,
          requestId: parsed.requestId,
          ok: true,
          payload: { streamId, effectiveWindow: 1, cancellation: 'cooperative' },
          attachments: [],
          meta: { durationMs: 0 },
        }),
        attachments: [],
      }
    },
    nativeProtocolV1Ack() {
      acknowledgements += 1
    },
  })
  const carrier = new NapiCarrier({ id: 'terminal-carrier', binding })
  carrier.openStream(
    request(
      'carrier-stream-open',
      'fixture.counter',
      'count',
      { streamId: 'carrier-stream', initialWindow: 1, input: { count: 1 } },
    ),
    [],
    packet => frames.push(packet.control),
  )
  assert.deepEqual(frames.map(frame => frame.kind), ['stream_data', 'stream_end'])
  assert.equal(carrier.acknowledge('carrier-stream', 1), false)
  assert.equal(acknowledgements, 0)
  assert.equal(carrier.releaseStream('carrier-stream'), true)
  assert.equal(carrier.releaseStream('carrier-stream'), false)
})

test('maps structured N-API QueueFull ACK status to the stable backpressure code', () => {
  const binding = fakeBinding({
    nativeProtocolV1Ack() {
      const error = new Error('raw native message')
      error.code = 'QueueFull'
      throw error
    },
  })
  const carrier = new NapiCarrier({ id: 'backpressure-carrier', binding })
  carrier.openStream(
    request(
      'backpressure-open',
      'fixture.counter',
      'count',
      { streamId: 'backpressure-stream', initialWindow: 1, input: { count: 1 } },
    ),
    [],
    () => {},
  )

  assert.throws(
    () => carrier.acknowledge('backpressure-stream', 1),
    error => error instanceof NativeCarrierError
      && error.code === 'NATIVE_BACKPRESSURE_BROKEN'
      && !error.message.includes('raw native message'),
  )
})

test('malformed stream frame synthesizes one sanitized terminal and cancels native work', () => {
  const secret = 'raw-frame-secret'
  const frames = []
  const cancellations = []
  const binding = fakeBinding({
    nativeProtocolV1OpenStream(control, _attachments, onFrame) {
      const parsed = JSON.parse(control)
      onFrame({ control: JSON.stringify({ payload: secret }), attachments: [] })
      return {
        control: JSON.stringify({
          kind: 'response',
          protocol: PROTOCOL_V1,
          requestId: parsed.requestId,
          ok: true,
          payload: {
            streamId: parsed.payload.streamId,
            effectiveWindow: 1,
            cancellation: 'cooperative',
          },
          attachments: [],
          meta: { durationMs: 0 },
        }),
        attachments: [],
      }
    },
    nativeProtocolV1Cancel(control) {
      cancellations.push(JSON.parse(control))
    },
  })
  const carrier = new NapiCarrier({ id: 'malformed-stream', binding })
  carrier.openStream(
    request(
      'malformed-stream-open',
      'fixture.counter',
      'count',
      { streamId: 'malformed-stream-id', initialWindow: 1, input: { count: 1 } },
    ),
    [],
    packet => frames.push(packet.control),
  )

  assert.deepEqual(frames.map(frame => frame.kind), ['stream_error'])
  assert.equal(frames[0].error.code, 'NATIVE_PROTOCOL_VIOLATION')
  assert.doesNotMatch(JSON.stringify(frames), new RegExp(secret))
  assert.deepEqual(cancellations.map(cancel => cancel.reason), ['consumer_closed'])
})

test('packet violations and logs are sanitized', async () => {
  const secret = 'fixture-payload-secret'
  const logs = []
  const carrier = new NapiCarrier({
    id: 'malformed-carrier',
    logger: {
      warn(message, metadata) {
        logs.push({ message, metadata })
      },
    },
    binding: fakeBinding({
      nativeProtocolV1Invoke: async () => ({
        control: JSON.stringify({ payload: secret }),
        attachments: [],
      }),
    }),
  })

  await assert.rejects(
    carrier.invoke(request('malformed-request')),
    error => error instanceof NativeCarrierError
      && error.code === 'CARRIER_PROTOCOL_VIOLATION'
      && !error.message.includes(secret),
  )
  assert.doesNotMatch(JSON.stringify(logs), new RegExp(secret))
})

test('real fixture flows through NapiCarrier with Buffer round-trip', async () => {
  const carrier = new NapiCarrier({
    id: 'real-fixture',
    binding: realBinding(),
    clientVersion: '2.4.13',
  })
  const snapshot = carrier.handshake()
  assert.deepEqual(
    snapshot.capabilities.map(capability => capability.id),
    ['fixture.counter', 'fixture.echo'],
  )

  const input = Buffer.from('carrier-buffer')
  const packet = await carrier.invoke({
    ...request('carrier-unary'),
    payload: { source: 'carrier' },
    attachments: [{
      id: 'input',
      index: 0,
      byteLength: input.byteLength,
      mediaType: 'application/octet-stream',
    }],
  }, [input])
  assert.equal(packet.control.ok, true)
  assert.equal(packet.attachments[0].toString(), 'carrier-buffer')
  await carrier.dispose()
})
