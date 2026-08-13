'use strict'

/**
 * Every carrier method replaced a native failure with a generic NativeCarrierError and dropped the
 * original — the only place the native code and message survive (#850). A caller saw
 * 'Native carrier invocation failed' and had nothing to diagnose with.
 *
 * The tension worth naming: this file's siblings assert a deliberate sanitisation contract — a
 * carrier error's `message`, and anything logged, must not leak native payload content. Attaching
 * the original as `cause` is only safe alongside that, so `cause` is defined **non-enumerable**:
 * `JSON.stringify(error)` still cannot reach it, which is what those assertions serialise. The
 * last two tests here pin exactly that, so a later change from defineProperty to a plain
 * assignment fails rather than quietly widening what a log can carry.
 */

const assert = require('node:assert/strict')
const test = require('node:test')
const golden = require('./fixtures/protocol-v1/golden.json')
const { NapiCarrier, NativeCarrierError } = require('./protocol')
const { PROTOCOL_V1 } = require('./protocol-contract')

const NATIVE_DETAIL = 'ENOENT: native addon vanished at /private/path'

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

function request(requestId) {
  return {
    kind: 'request',
    protocol: PROTOCOL_V1,
    requestId,
    capability: 'fixture.echo',
    operation: 'echo',
    payload: null,
    attachments: [],
  }
}

test('handshake failure carries the native error as cause', () => {
  const native = new Error(NATIVE_DETAIL)
  const carrier = new NapiCarrier({
    id: 'cause-handshake',
    binding: fakeBinding({
      nativeProtocolV1Handshake() {
        throw native
      },
    }),
  })

  assert.throws(
    () => carrier.handshake(),
    error =>
      error instanceof NativeCarrierError
      && error.code === 'CARRIER_HANDSHAKE_FAILED'
      && error.cause === native,
  )
})

test('invoke failure carries the native error as cause', async () => {
  const native = new Error(NATIVE_DETAIL)
  const carrier = new NapiCarrier({
    id: 'cause-invoke',
    binding: fakeBinding({
      nativeProtocolV1Invoke() {
        throw native
      },
    }),
  })
  carrier.handshake()

  await assert.rejects(
    carrier.invoke(request('cause-request')),
    error =>
      error instanceof NativeCarrierError
      && error.code === 'CARRIER_INVOKE_FAILED'
      && error.cause === native,
  )
})

test('openStream failure carries the native error as cause', () => {
  const native = new Error(NATIVE_DETAIL)
  const carrier = new NapiCarrier({
    id: 'cause-stream',
    binding: fakeBinding({
      nativeProtocolV1OpenStream() {
        throw native
      },
    }),
  })
  carrier.handshake()

  assert.throws(
    () =>
      carrier.openStream(
        {
          ...request('cause-stream-request'),
          payload: { streamId: 'cause-stream-1', initialWindow: 1 },
        },
        [],
        () => {},
      ),
    error =>
      error instanceof NativeCarrierError
      && error.code === 'CARRIER_OPEN_STREAM_FAILED'
      && error.cause === native,
  )
})

test('dispose failure carries the native error as cause', async () => {
  const native = new Error(NATIVE_DETAIL)
  const carrier = new NapiCarrier({
    id: 'cause-dispose',
    binding: fakeBinding({
      nativeProtocolV1Dispose: async () => {
        throw native
      },
    }),
  })
  carrier.handshake()

  await assert.rejects(
    carrier.dispose(),
    error =>
      error instanceof NativeCarrierError
      && error.code === 'CARRIER_DISPOSE_FAILED'
      && error.cause === native,
  )
})

test('a successful call still returns normally: cause is not attached to everything', async () => {
  const carrier = new NapiCarrier({ id: 'cause-success', binding: fakeBinding() })
  carrier.handshake()

  const packet = await carrier.invoke(request('cause-ok'))

  assert.equal(packet.control.ok, true)
  await carrier.dispose()
})

test('the sanitisation contract still holds: the message never carries the native detail', () => {
  const carrier = new NapiCarrier({
    id: 'cause-sanitised',
    binding: fakeBinding({
      nativeProtocolV1Handshake() {
        throw new Error(NATIVE_DETAIL)
      },
    }),
  })

  assert.throws(
    () => carrier.handshake(),
    error => !error.message.includes(NATIVE_DETAIL) && !String(error).includes(NATIVE_DETAIL),
  )
})

test('cause is non-enumerable, so serialising a carrier error cannot leak the native detail', () => {
  const carrier = new NapiCarrier({
    id: 'cause-not-serialised',
    binding: fakeBinding({
      nativeProtocolV1Handshake() {
        throw new Error(NATIVE_DETAIL)
      },
    }),
  })

  let thrown
  try {
    carrier.handshake()
  }
  catch (error) {
    thrown = error
  }

  assert.ok(thrown, 'handshake was expected to throw')

  // Asserting on JSON.stringify(thrown) alone proves nothing: Error's own properties are
  // non-enumerable, so it is '{}' whether or not cause is enumerable. The property descriptor is
  // the thing that differs, and a logger that unwraps nested Errors is what would leak.
  assert.equal(Object.prototype.propertyIsEnumerable.call(thrown, 'cause'), false)

  const unwrapErrors = (_key, value) =>
    value instanceof Error ? { name: value.name, message: value.message } : value
  assert.doesNotMatch(JSON.stringify({ ...thrown }, unwrapErrors), new RegExp(NATIVE_DETAIL))

  // Still reachable for a caller that asks for it — that is the whole point of #850.
  assert.equal(thrown.cause.message, NATIVE_DETAIL)
})
