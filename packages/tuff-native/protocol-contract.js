'use strict'

const { Buffer } = require('node:buffer')

const PROTOCOL_V1 = Object.freeze({ major: 1, minor: 0 })
const HARD_MAX_STREAM_WINDOW = 8
const MAX_SAFE_SEQUENCE = Number.MAX_SAFE_INTEGER
const MAX_CONTROL_BYTES = 1024 * 1024
const MAX_ATTACHMENT_COUNT = 8
const MAX_ATTACHMENT_BYTES = 64 * 1024 * 1024
const MAX_PACKET_ATTACHMENT_BYTES = 128 * 1024 * 1024
const MAX_JSON_DEPTH = 64
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const CANCEL_REASONS = new Set(['caller', 'consumer_closed', 'deadline', 'dispose'])
const TARGET_TYPES = new Set(['request', 'stream'])
const CAPABILITY_STATES = new Set(['available', 'degraded', 'unavailable'])
const OPERATION_MODES = new Set(['unary', 'stream'])
const CANCELLATION_MODES = new Set(['cooperative', 'best-effort', 'none'])
const ERROR_CATEGORIES = new Set([
  'protocol',
  'validation',
  'availability',
  'permission',
  'not_found',
  'cancelled',
  'timeout',
  'resource',
  'internal',
])

class ProtocolContractError extends Error {
  constructor(code, message, details) {
    super(message)
    this.name = 'ProtocolContractError'
    this.code = code
    this.category = categoryForCode(code)
    this.retryable = false
    if (details !== undefined) this.details = details
  }
}

function categoryForCode(code) {
  if (code === 'PROTOCOL_VERSION_UNSUPPORTED' || code === 'PROTOCOL_FEATURE_UNSUPPORTED') {
    return 'protocol'
  }
  if (code.startsWith('ATTACHMENT_') || code === 'INVALID_ENVELOPE' || code === 'MALFORMED_CONTROL') {
    return 'validation'
  }
  return 'internal'
}

function fail(code, message, details) {
  throw new ProtocolContractError(code, message, details)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireRecord(value, label) {
  if (!isRecord(value)) fail('INVALID_ENVELOPE', `Invalid ${label}`)
  return value
}

function requireIdentifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    fail('INVALID_ENVELOPE', `Invalid ${label}`)
  }
  return value
}

function requireString(value, label, maxLength = 256) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    fail('INVALID_ENVELOPE', `Invalid ${label}`)
  }
  return value
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') fail('INVALID_ENVELOPE', `Invalid ${label}`)
  return value
}

function requireSafeInteger(value, label, options = {}) {
  const { min = 0, max = MAX_SAFE_SEQUENCE } = options
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail('INVALID_ENVELOPE', `Invalid ${label}`)
  }
  return value
}

function validateJsonValue(value, label, depth = 0) {
  if (depth > MAX_JSON_DEPTH) fail('INVALID_ENVELOPE', `Invalid ${label}`)
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('INVALID_ENVELOPE', `Invalid ${label}`)
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) validateJsonValue(entry, label, depth + 1)
    return
  }
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (key.length > 256) fail('INVALID_ENVELOPE', `Invalid ${label}`)
      validateJsonValue(entry, label, depth + 1)
    }
    return
  }
  fail('INVALID_ENVELOPE', `Invalid ${label}`)
}

function validateProtocol(protocol, hello = false) {
  const record = requireRecord(protocol, 'protocol version')
  if (record.major !== PROTOCOL_V1.major) {
    fail('PROTOCOL_VERSION_UNSUPPORTED', 'Native protocol major version is unsupported')
  }
  if (hello) {
    requireSafeInteger(record.minMinor, 'minimum protocol minor')
    requireSafeInteger(record.maxMinor, 'maximum protocol minor')
    if (record.minMinor > record.maxMinor
      || record.minMinor > PROTOCOL_V1.minor
      || record.maxMinor < PROTOCOL_V1.minor) {
      fail('PROTOCOL_VERSION_UNSUPPORTED', 'Native protocol minor version is unsupported')
    }
    return
  }
  if (record.minor !== PROTOCOL_V1.minor) {
    fail('PROTOCOL_VERSION_UNSUPPORTED', 'Native protocol minor version is unsupported')
  }
}

function validateAttachmentDescriptors(value) {
  if (!Array.isArray(value)) fail('ATTACHMENT_MISMATCH', 'Invalid attachment descriptors')
  if (value.length > MAX_ATTACHMENT_COUNT) {
    fail('ATTACHMENT_LIMIT_EXCEEDED', 'Attachment count exceeds the protocol limit')
  }

  const ids = new Set()
  let total = 0
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = requireRecord(value[index], 'attachment descriptor')
    const id = requireIdentifier(descriptor.id, 'attachment id')
    if (ids.has(id)) fail('ATTACHMENT_MISMATCH', 'Attachment ids must be unique')
    ids.add(id)
    if (descriptor.index !== index) {
      fail('ATTACHMENT_MISMATCH', 'Attachment indexes must be contiguous')
    }
    requireSafeInteger(descriptor.byteLength, 'attachment byte length', {
      min: 0,
      max: MAX_ATTACHMENT_BYTES,
    })
    total += descriptor.byteLength
    if (total > MAX_PACKET_ATTACHMENT_BYTES) {
      fail('ATTACHMENT_LIMIT_EXCEEDED', 'Packet attachments exceed the protocol limit')
    }
    if (descriptor.mediaType !== undefined) requireString(descriptor.mediaType, 'attachment media type', 128)
    if (descriptor.purpose !== undefined) requireIdentifier(descriptor.purpose, 'attachment purpose')
  }
  return value
}

function validateError(value) {
  const error = requireRecord(value, 'protocol error')
  requireIdentifier(error.code, 'error code')
  if (!ERROR_CATEGORIES.has(error.category)) fail('INVALID_ENVELOPE', 'Invalid error category')
  requireString(error.message, 'error message', 256)
  requireBoolean(error.retryable, 'error retryable')
  if (error.details !== undefined) {
    const details = requireRecord(error.details, 'error details')
    for (const [key, entry] of Object.entries(details)) {
      requireIdentifier(key, 'error detail key')
      if (!['string', 'number', 'boolean'].includes(typeof entry)
        || (typeof entry === 'number' && !Number.isFinite(entry))) {
        fail('INVALID_ENVELOPE', 'Invalid error detail')
      }
    }
  }
}

function validateMeta(value) {
  const meta = requireRecord(value, 'run metadata')
  requireSafeInteger(meta.durationMs, 'duration', { min: 0 })
  if (meta.engine !== undefined) requireIdentifier(meta.engine, 'engine')
  if (meta.degraded !== undefined) requireBoolean(meta.degraded, 'degraded state')
  if (meta.cancellation !== undefined && !CANCELLATION_MODES.has(meta.cancellation)) {
    fail('INVALID_ENVELOPE', 'Invalid cancellation mode')
  }
  if (meta.counters !== undefined) {
    const counters = requireRecord(meta.counters, 'run counters')
    for (const [key, count] of Object.entries(counters)) {
      requireIdentifier(key, 'counter key')
      requireSafeInteger(count, 'counter value', { min: 0 })
    }
  }
}

function validateCapability(value) {
  const capability = requireRecord(value, 'capability descriptor')
  requireIdentifier(capability.id, 'capability id')
  requireString(capability.version, 'capability version', 64)
  if (capability.engine !== undefined) requireIdentifier(capability.engine, 'capability engine')
  if (!CAPABILITY_STATES.has(capability.state)) fail('INVALID_ENVELOPE', 'Invalid capability state')
  if (capability.reason !== undefined) requireIdentifier(capability.reason, 'capability reason')
  if (!Array.isArray(capability.features)) fail('INVALID_ENVELOPE', 'Invalid capability features')
  for (const feature of capability.features) requireIdentifier(feature, 'capability feature')
  if (!Array.isArray(capability.operations)) fail('INVALID_ENVELOPE', 'Invalid capability operations')
  const operations = new Set()
  for (const rawOperation of capability.operations) {
    const operation = requireRecord(rawOperation, 'operation descriptor')
    const name = requireIdentifier(operation.name, 'operation name')
    if (operations.has(name)) fail('INVALID_ENVELOPE', 'Operation names must be unique')
    operations.add(name)
    if (!OPERATION_MODES.has(operation.mode)) fail('INVALID_ENVELOPE', 'Invalid operation mode')
    if (!CANCELLATION_MODES.has(operation.cancellation)) fail('INVALID_ENVELOPE', 'Invalid cancellation mode')
    requireBoolean(operation.acceptsAttachments, 'operation attachment input')
    requireBoolean(operation.emitsAttachments, 'operation attachment output')
  }
}

function validateLimits(value) {
  const limits = requireRecord(value, 'protocol limits')
  for (const key of [
    'maxControlBytes',
    'maxAttachmentCount',
    'maxAttachmentBytes',
    'maxPacketAttachmentBytes',
    'maxInFlightUnary',
    'maxOpenStreams',
    'cancelGraceMs',
    'disposeGraceMs',
  ]) {
    requireSafeInteger(limits[key], key, { min: 1 })
  }
  requireSafeInteger(limits.maxStreamWindow, 'maxStreamWindow', {
    min: 1,
    max: HARD_MAX_STREAM_WINDOW,
  })
}

function validateClientHello(control) {
  validateProtocol(control.protocol, true)
  const client = requireRecord(control.client, 'client')
  requireIdentifier(client.name, 'client name')
  requireString(client.version, 'client version', 64)
  if (!Array.isArray(control.requestedFeatures)) fail('INVALID_ENVELOPE', 'Invalid requested features')
  for (const feature of control.requestedFeatures) requireIdentifier(feature, 'requested feature')
}

function validateServerHello(control) {
  validateProtocol(control.protocol)
  const runtime = requireRecord(control.runtime, 'native runtime')
  for (const key of ['addonId', 'addonVersion', 'target', 'platform', 'arch', 'buildProfile']) {
    requireString(runtime[key], `runtime ${key}`, 128)
  }
  if (!Array.isArray(control.carrierFeatures)) fail('INVALID_ENVELOPE', 'Invalid carrier features')
  for (const feature of control.carrierFeatures) requireIdentifier(feature, 'carrier feature')
  validateLimits(control.limits)
  if (!Array.isArray(control.capabilities)) fail('INVALID_ENVELOPE', 'Invalid capabilities')
  for (const capability of control.capabilities) validateCapability(capability)
}

function validateRequest(control) {
  validateProtocol(control.protocol)
  requireIdentifier(control.requestId, 'request id')
  requireIdentifier(control.capability, 'capability id')
  requireIdentifier(control.operation, 'operation')
  if (control.deadlineUnixMs !== undefined) {
    requireSafeInteger(control.deadlineUnixMs, 'deadline', { min: 1 })
  }
  if (!Object.hasOwn(control, 'payload')) fail('INVALID_ENVELOPE', 'Missing request payload')
  validateJsonValue(control.payload, 'request payload')
  validateAttachmentDescriptors(control.attachments)
  if (control.payload && isRecord(control.payload) && Object.hasOwn(control.payload, 'initialWindow')) {
    requireSafeInteger(control.payload.initialWindow, 'initial stream window', {
      min: 1,
      max: HARD_MAX_STREAM_WINDOW,
    })
    if (Object.hasOwn(control.payload, 'streamId')) requireIdentifier(control.payload.streamId, 'stream id')
  }
}

function validateResponse(control) {
  validateProtocol(control.protocol)
  requireIdentifier(control.requestId, 'request id')
  requireBoolean(control.ok, 'response status')
  validateAttachmentDescriptors(control.attachments)
  validateMeta(control.meta)
  if (control.ok) {
    if (!Object.hasOwn(control, 'payload')) fail('INVALID_ENVELOPE', 'Missing response payload')
    validateJsonValue(control.payload, 'response payload')
    return
  }
  if (control.attachments.length !== 0) fail('ATTACHMENT_MISMATCH', 'Error responses cannot carry attachments')
  validateError(control.error)
}

function validateStreamFrame(control) {
  validateProtocol(control.protocol)
  requireIdentifier(control.streamId, 'stream id')
  requireSafeInteger(control.sequence, 'stream sequence', { min: 1 })
  validateAttachmentDescriptors(control.attachments)

  if (control.kind === 'stream_data') {
    if (!Object.hasOwn(control, 'payload')) fail('INVALID_ENVELOPE', 'Missing stream payload')
    validateJsonValue(control.payload, 'stream payload')
    if (control.meta !== undefined) validateJsonValue(control.meta, 'stream metadata')
    return
  }
  if (control.kind === 'stream_end') {
    if (control.payload !== undefined) validateJsonValue(control.payload, 'stream terminal payload')
    return
  }
  if (control.attachments.length !== 0) fail('ATTACHMENT_MISMATCH', 'Stream errors cannot carry attachments')
  validateError(control.error)
}

function validateAck(control) {
  validateProtocol(control.protocol)
  requireIdentifier(control.streamId, 'stream id')
  requireSafeInteger(control.ackSequence, 'ack sequence', { min: 0 })
}

function validateCancel(control) {
  validateProtocol(control.protocol)
  const target = requireRecord(control.target, 'cancel target')
  if (!TARGET_TYPES.has(target.type)) fail('INVALID_ENVELOPE', 'Invalid cancel target')
  requireIdentifier(target.id, 'cancel target id')
  if (!CANCEL_REASONS.has(control.reason)) fail('INVALID_ENVELOPE', 'Invalid cancel reason')
}

function validateControl(control) {
  requireRecord(control, 'control envelope')
  requireString(control.kind, 'control kind', 64)
  validateJsonValue(control, 'control envelope')

  switch (control.kind) {
    case 'client_hello':
      validateClientHello(control)
      break
    case 'server_hello':
      validateServerHello(control)
      break
    case 'request':
      validateRequest(control)
      break
    case 'response':
      validateResponse(control)
      break
    case 'stream_data':
    case 'stream_end':
    case 'stream_error':
      validateStreamFrame(control)
      break
    case 'stream_ack':
      validateAck(control)
      break
    case 'cancel':
      validateCancel(control)
      break
    default:
      fail('INVALID_ENVELOPE', 'Unknown native control kind')
  }
  return control
}

function encodeControl(control) {
  validateControl(control)
  let encoded
  try {
    encoded = JSON.stringify(control)
  }
  catch {
    fail('MALFORMED_CONTROL', 'Native control cannot be encoded')
  }
  if (typeof encoded !== 'string') fail('MALFORMED_CONTROL', 'Native control cannot be encoded')
  if (Buffer.byteLength(encoded, 'utf8') > MAX_CONTROL_BYTES) {
    fail('MALFORMED_CONTROL', 'Native control exceeds the byte limit')
  }
  return encoded
}

function decodeControl(encoded) {
  if (typeof encoded !== 'string') fail('MALFORMED_CONTROL', 'Native control must be a string')
  if (Buffer.byteLength(encoded, 'utf8') > MAX_CONTROL_BYTES) {
    fail('MALFORMED_CONTROL', 'Native control exceeds the byte limit')
  }
  let control
  try {
    control = JSON.parse(encoded)
  }
  catch {
    fail('MALFORMED_CONTROL', 'Native control is not valid JSON')
  }
  return validateControl(control)
}

function validatePacket(encoded, attachments) {
  const control = decodeControl(encoded)
  if (!Array.isArray(attachments)) fail('ATTACHMENT_MISMATCH', 'Native attachments must be an array')
  const descriptors = Array.isArray(control.attachments) ? control.attachments : []
  if (attachments.length !== descriptors.length) {
    fail('ATTACHMENT_MISMATCH', 'Native attachment count does not match control')
  }
  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index]
    if (!Buffer.isBuffer(attachment) || attachment.byteLength !== descriptors[index].byteLength) {
      fail('ATTACHMENT_MISMATCH', 'Native attachment does not match its descriptor')
    }
  }
  return { control, attachments }
}

module.exports = {
  HARD_MAX_STREAM_WINDOW,
  MAX_SAFE_SEQUENCE,
  PROTOCOL_V1,
  ProtocolContractError,
  decodeControl,
  encodeControl,
  validateControl,
  validatePacket,
}
