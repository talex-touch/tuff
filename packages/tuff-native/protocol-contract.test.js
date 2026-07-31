'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const golden = require('./fixtures/protocol-v1/golden.json')
const {
  HARD_MAX_STREAM_WINDOW,
  MAX_SAFE_SEQUENCE,
  PROTOCOL_V1,
  ProtocolContractError,
  decodeControl,
  encodeControl,
  validatePacket,
} = require('./protocol-contract')

const validControls = Object.entries(golden)

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

test('round-trips every protocol v1 golden control', () => {
  assert.equal(PROTOCOL_V1.major, 1)
  assert.equal(PROTOCOL_V1.minor, 0)
  assert.equal(HARD_MAX_STREAM_WINDOW, 8)

  for (const [name, control] of validControls) {
    const encoded = encodeControl(control)
    const decoded = decodeControl(encoded)
    assert.deepEqual(decoded, control, name)
  }
})

test('validates golden packet attachments exactly', () => {
  const request = golden.unaryRequest
  assert.deepEqual(validatePacket(encodeControl(request), [Buffer.from('test')]), {
    control: request,
    attachments: [Buffer.from('test')],
  })

  const response = golden.unarySuccess
  assert.deepEqual(validatePacket(encodeControl(response), [Buffer.from('data')]), {
    control: response,
    attachments: [Buffer.from('data')],
  })
})

test('rejects protocol version and identifier violations with stable codes', () => {
  const wrongMajor = clone(golden.unaryRequest)
  wrongMajor.protocol.major = 2
  assert.throws(
    () => decodeControl(JSON.stringify(wrongMajor)),
    error => error instanceof ProtocolContractError
      && error.code === 'PROTOCOL_VERSION_UNSUPPORTED',
  )

  const invalidId = clone(golden.unaryRequest)
  invalidId.requestId = 'contains whitespace'
  assert.throws(
    () => decodeControl(JSON.stringify(invalidId)),
    error => error instanceof ProtocolContractError
      && error.code === 'INVALID_ENVELOPE',
  )
})

test('rejects unsafe stream integers before they cross Rust u64', () => {
  const unsafeFrame = clone(golden.streamData)
  unsafeFrame.sequence = MAX_SAFE_SEQUENCE + 1
  assert.throws(
    () => decodeControl(JSON.stringify(unsafeFrame)),
    error => error instanceof ProtocolContractError
      && error.code === 'INVALID_ENVELOPE',
  )

  const invalidWindow = clone(golden.streamOpenRequest)
  invalidWindow.payload.initialWindow = HARD_MAX_STREAM_WINDOW + 1
  assert.throws(
    () => decodeControl(JSON.stringify(invalidWindow)),
    error => error instanceof ProtocolContractError
      && error.code === 'INVALID_ENVELOPE',
  )
})

test('rejects missing, extra, reordered, and duplicate attachments', () => {
  const control = encodeControl(golden.unaryRequest)

  assert.throws(
    () => validatePacket(control, []),
    error => error instanceof ProtocolContractError
      && error.code === 'ATTACHMENT_MISMATCH',
  )
  assert.throws(
    () => validatePacket(control, [Buffer.from('test'), Buffer.alloc(0)]),
    error => error instanceof ProtocolContractError
      && error.code === 'ATTACHMENT_MISMATCH',
  )
  assert.throws(
    () => validatePacket(control, [Buffer.from('bad')]),
    error => error instanceof ProtocolContractError
      && error.code === 'ATTACHMENT_MISMATCH',
  )

  const duplicate = clone(golden.unaryRequest)
  duplicate.attachments.push({ ...duplicate.attachments[0], index: 1 })
  assert.throws(
    () => decodeControl(JSON.stringify(duplicate)),
    error => error instanceof ProtocolContractError
      && error.code === 'ATTACHMENT_MISMATCH',
  )
})

test('never includes payload or attachment secrets in contract errors', () => {
  const secret = 'fixture-secret-must-not-leak'
  const control = clone(golden.unaryRequest)
  control.payload = { secret }
  control.attachments[0].byteLength = 99

  let caught
  try {
    validatePacket(JSON.stringify(control), [Buffer.from(secret)])
  }
  catch (error) {
    caught = error
  }

  assert.ok(caught instanceof ProtocolContractError)
  assert.doesNotMatch(caught.message, new RegExp(secret))
  assert.doesNotMatch(JSON.stringify(caught.details ?? {}), new RegExp(secret))
})
