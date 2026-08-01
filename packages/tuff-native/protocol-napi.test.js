'use strict'

const assert = require('node:assert/strict')
const { Buffer } = require('node:buffer')
const path = require('node:path')
const test = require('node:test')
const golden = require('./fixtures/protocol-v1/golden.json')
const { decodeControl, encodeControl, validatePacket } = require('./protocol-contract')

const binding = require(path.join(
  __dirname,
  'build',
  'fixtures',
  'tuff_native_protocol_fixture.node',
))

function request({ requestId, capability, operation, payload, attachments = [], timeoutMs }) {
  return encodeControl({
    kind: 'request',
    protocol: { major: 1, minor: 0 },
    requestId,
    capability,
    operation,
    ...(timeoutMs === undefined ? {} : { deadlineUnixMs: Date.now() + timeoutMs }),
    payload,
    attachments,
  })
}

function ack(streamId, ackSequence) {
  binding.nativeProtocolV1Ack(encodeControl({
    kind: 'stream_ack',
    protocol: { major: 1, minor: 0 },
    streamId,
    ackSequence,
  }))
}

function cancel(streamId, reason = 'caller') {
  binding.nativeProtocolV1Cancel(encodeControl({
    kind: 'cancel',
    protocol: { major: 1, minor: 0 },
    target: { type: 'stream', id: streamId },
    reason,
  }))
}

function createFrameQueue() {
  const queued = []
  const waiters = []
  return {
    callback(packet) {
      const waiter = waiters.shift()
      if (waiter)
        waiter(packet)
      else queued.push(packet)
    },
    next(timeoutMs = 1000) {
      if (queued.length > 0)
        return Promise.resolve(queued.shift())
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for native frame')), timeoutMs)
        waiters.push((packet) => {
          clearTimeout(timer)
          resolve(packet)
        })
      })
    },
    size() {
      return queued.length
    },
  }
}

async function expectNoFrame(queue, waitMs = 40) {
  await new Promise(resolve => setTimeout(resolve, waitMs))
  assert.equal(queue.size(), 0)
}

test('fixture addon exposes the complete protocol v1 carrier', () => {
  for (const name of [
    'nativeProtocolV1Handshake',
    'nativeProtocolV1Invoke',
    'nativeProtocolV1OpenStream',
    'nativeProtocolV1Ack',
    'nativeProtocolV1Cancel',
    'nativeProtocolV1Dispose',
  ]) {
    assert.equal(typeof binding[name], 'function', name)
  }

  const hello = decodeControl(
    binding.nativeProtocolV1Handshake(JSON.stringify(golden.clientHello)),
  )
  assert.equal(hello.kind, 'server_hello')
  assert.deepEqual(hello.carrierFeatures, ['attachments', 'stream-credit-v1'])
  assert.equal(hello.limits.maxStreamWindow, 8)
  assert.deepEqual(
    hello.capabilities.map(capability => capability.id),
    ['fixture.counter', 'fixture.echo'],
  )
})

test('unary invoke owns input bytes before returning its Promise', async () => {
  const original = Buffer.from('copy-before-await')
  const promise = binding.nativeProtocolV1Invoke(
    request({
      requestId: 'napi-unary-1',
      capability: 'fixture.echo',
      operation: 'echo',
      payload: { label: 'owned' },
      attachments: [{
        id: 'input',
        index: 0,
        byteLength: original.byteLength,
        mediaType: 'application/octet-stream',
        purpose: 'fixture',
      }],
    }),
    [original],
  )
  original.fill(0)

  const packet = await promise
  const validated = validatePacket(packet.control, packet.attachments)
  assert.equal(validated.control.ok, true)
  assert.equal(validated.control.payload.label, 'owned')
  assert.equal(packet.attachments[0].toString(), 'copy-before-await')
})

test('unary failures and deadlines remain structured protocol responses', async () => {
  const failed = await binding.nativeProtocolV1Invoke(
    request({
      requestId: 'napi-unary-2',
      capability: 'fixture.echo',
      operation: 'fail',
      payload: null,
    }),
    [],
  )
  assert.deepEqual(decodeControl(failed.control).error, {
    code: 'FIXTURE_FAILED',
    category: 'internal',
    message: 'Fixture operation failed',
    retryable: false,
  })

  const timedOut = await binding.nativeProtocolV1Invoke(
    request({
      requestId: 'napi-unary-3',
      capability: 'fixture.echo',
      operation: 'delay',
      payload: { delayMs: 200 },
      timeoutMs: 20,
    }),
    [],
  )
  assert.equal(decodeControl(timedOut.control).error.code, 'DEADLINE_EXCEEDED')
})

test('stream publication stops at credit zero and resumes after each ACK', async () => {
  const queue = createFrameQueue()
  const accepted = binding.nativeProtocolV1OpenStream(
    request({
      requestId: 'napi-stream-open-1',
      capability: 'fixture.counter',
      operation: 'count',
      payload: {
        streamId: 'napi-stream-1',
        initialWindow: 1,
        input: { count: 3 },
      },
    }),
    [],
    packet => queue.callback(packet),
  )
  assert.deepEqual(decodeControl(accepted.control).payload, {
    streamId: 'napi-stream-1',
    effectiveWindow: 1,
    cancellation: 'cooperative',
  })

  const first = validatePacket((await queue.next()).control, [])
  assert.equal(first.control.sequence, 1)
  await expectNoFrame(queue)
  ack('napi-stream-1', 1)

  const second = decodeControl((await queue.next()).control)
  assert.equal(second.sequence, 2)
  await expectNoFrame(queue)
  ack('napi-stream-1', 2)

  const third = decodeControl((await queue.next()).control)
  assert.equal(third.sequence, 3)
  const terminal = decodeControl((await queue.next()).control)
  assert.equal(terminal.kind, 'stream_end')
  assert.equal(terminal.sequence, 4)
  assert.equal(terminal.payload.emitted, 3)
})

test('stream cancellation wakes a blocked producer and emits one terminal', async () => {
  const queue = createFrameQueue()
  binding.nativeProtocolV1OpenStream(
    request({
      requestId: 'napi-stream-open-2',
      capability: 'fixture.counter',
      operation: 'count',
      payload: {
        streamId: 'napi-stream-2',
        initialWindow: 1,
        input: { count: 5 },
      },
    }),
    [],
    packet => queue.callback(packet),
  )

  assert.equal(decodeControl((await queue.next()).control).kind, 'stream_data')
  cancel('napi-stream-2')
  const terminal = decodeControl((await queue.next()).control)
  assert.equal(terminal.kind, 'stream_error')
  assert.equal(terminal.error.code, 'CANCELLED')
  await expectNoFrame(queue)
})

test('explicit dispose is idempotent and later invokes fail closed', async () => {
  await binding.nativeProtocolV1Dispose()
  await binding.nativeProtocolV1Dispose()
  const packet = await binding.nativeProtocolV1Invoke(
    request({
      requestId: 'napi-after-dispose',
      capability: 'fixture.echo',
      operation: 'echo',
      payload: null,
    }),
    [],
  )
  assert.equal(decodeControl(packet.control).error.code, 'TRANSPORT_DISPOSED')
})
