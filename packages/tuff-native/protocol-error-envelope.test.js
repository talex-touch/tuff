'use strict'

/**
 * `to_napi_error` formatted only `code: message` into the napi Error, so `category`, `retryable`
 * and `details` — which the protocol defines and `validate_error` explicitly permits — were lost at
 * the boundary. `open_stream` alone returns `NATIVE_BUSY` (retryable), `DUPLICATE_REQUEST_ID` and
 * `CAPABILITY_NOT_FOUND` (not), and all three arrived as `Error: <CODE>: <message>` with
 * `Status::GenericFailure`, so JS could not tell "retry shortly" from "give up" without splitting
 * the string and hardcoding a retryable list (#849).
 *
 * `napi::Status` is a fixed enum, so a protocol code cannot ride on `err.code` the way `QueueFull`
 * does — the reason string is the only channel with room for structure.
 *
 * The constraint that shapes the fix: this package's suite asserts that a carrier error's message
 * never carries native content. So the envelope is read for its *fields* and the native message is
 * still never surfaced — the last two tests pin that, alongside the sibling sanitisation tests.
 */

const assert = require('node:assert/strict')
const test = require('node:test')
const golden = require('./fixtures/protocol-v1/golden.json')
const { NapiCarrier, NativeCarrierError } = require('./protocol')
const { PROTOCOL_V1 } = require('./protocol-contract')

const NATIVE_DETAIL = 'capability fixture.absent is not registered'

/** The reason string the Rust side now produces. */
function envelopeReason(error) {
  return `${error.code}: ${error.message} |protocol-error:${JSON.stringify(error)}`
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
    nativeProtocolV1OpenStream: () => {
      throw new Error('unused')
    },
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

/** Drives invoke() against a binding that rejects with the given protocol error. */
async function invokeRejecting(protocolError) {
  const carrier = new NapiCarrier({
    id: 'envelope-carrier',
    binding: fakeBinding({
      nativeProtocolV1Invoke() {
        throw new Error(envelopeReason(protocolError))
      },
    }),
  })
  carrier.handshake()

  try {
    await carrier.invoke(request('envelope-request'))
  }
  catch (error) {
    return error
  }
  throw new Error('invoke was expected to reject')
}

test('a retryable native failure arrives as retryable', async () => {
  const error = await invokeRejecting({
    code: 'NATIVE_BUSY',
    category: 'resource',
    message: 'runtime is busy',
    retryable: true,
  })

  assert.ok(error instanceof NativeCarrierError)
  assert.equal(error.code, 'NATIVE_BUSY')
  assert.equal(error.retryable, true)
  assert.equal(error.category, 'resource')
})

test('a permanent native failure is distinguishable from it', async () => {
  const error = await invokeRejecting({
    code: 'CAPABILITY_NOT_FOUND',
    category: 'validation',
    message: NATIVE_DETAIL,
    retryable: false,
  })

  // The whole point: same call, same Status, opposite handling — with no string splitting.
  assert.equal(error.code, 'CAPABILITY_NOT_FOUND')
  assert.equal(error.retryable, false)
})

test('details reach JS instead of being dropped at the boundary', async () => {
  const error = await invokeRejecting({
    code: 'DUPLICATE_REQUEST_ID',
    category: 'validation',
    message: 'request id already in flight',
    retryable: false,
    details: { requestId: 'envelope-request', attempts: 2, fatal: true },
  })

  assert.deepEqual(error.details, { requestId: 'envelope-request', attempts: 2, fatal: true })
})

test('a rejection without an envelope still gets the carrier code', async () => {
  const carrier = new NapiCarrier({
    id: 'plain-carrier',
    binding: fakeBinding({
      nativeProtocolV1Invoke() {
        throw new Error('a plain native failure')
      },
    }),
  })
  carrier.handshake()

  await assert.rejects(
    carrier.invoke(request('plain-request')),
    error => error.code === 'CARRIER_INVOKE_FAILED' && error.retryable === false,
  )
})

test('a malformed envelope is ignored rather than trusted', async () => {
  const carrier = new NapiCarrier({
    id: 'malformed-envelope-carrier',
    binding: fakeBinding({
      nativeProtocolV1Invoke() {
        throw new Error('NATIVE_BUSY: busy |protocol-error:{not json')
      },
    }),
  })
  carrier.handshake()

  await assert.rejects(
    carrier.invoke(request('malformed-request')),
    error => error.code === 'CARRIER_INVOKE_FAILED',
  )
})

test('an envelope missing retryable is ignored: a half-read structure is worse than none', async () => {
  const carrier = new NapiCarrier({
    id: 'partial-envelope-carrier',
    binding: fakeBinding({
      nativeProtocolV1Invoke() {
        throw new Error('NATIVE_BUSY: busy |protocol-error:{"code":"NATIVE_BUSY"}')
      },
    }),
  })
  carrier.handshake()

  await assert.rejects(
    carrier.invoke(request('partial-request')),
    error => error.code === 'CARRIER_INVOKE_FAILED',
  )
})

test('the native message is still never surfaced on the carrier error', async () => {
  const error = await invokeRejecting({
    code: 'CAPABILITY_NOT_FOUND',
    category: 'validation',
    message: NATIVE_DETAIL,
    retryable: false,
  })

  assert.ok(!error.message.includes(NATIVE_DETAIL))
  assert.ok(!String(error).includes(NATIVE_DETAIL))
})

test('nor through serialising the carrier error', async () => {
  const error = await invokeRejecting({
    code: 'CAPABILITY_NOT_FOUND',
    category: 'validation',
    message: NATIVE_DETAIL,
    retryable: false,
  })

  const unwrapErrors = (_key, value) =>
    value instanceof Error ? { name: value.name, message: value.message } : value
  assert.doesNotMatch(JSON.stringify({ ...error }, unwrapErrors), new RegExp(NATIVE_DETAIL))
})

test('the JS and Rust halves spell the envelope prefix the same way', () => {
  // Two literals in two languages: nothing else makes them fail together if one is edited.
  const rustSource = require('node:fs').readFileSync(
    require('node:path').join(__dirname, 'native-core/src/error.rs'),
    'utf8',
  )
  const declared = /ERROR_ENVELOPE_PREFIX: &str = "([^"]+)"/.exec(rustSource)?.[1]

  assert.equal(declared, '|protocol-error:')
  assert.ok(
    envelopeReason({ code: 'X', message: 'y', retryable: false }).includes(declared),
    'the fixture in this file builds its reason with the same prefix',
  )
})
