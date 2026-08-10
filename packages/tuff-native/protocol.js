'use strict'

const crypto = require('node:crypto')
const {
  PROTOCOL_V1,
  ProtocolContractError,
  decodeControl,
  encodeControl,
  validatePacket,
} = require('./protocol-contract')

const EXPECTED_EXPORTS = Object.freeze([
  'nativeProtocolV1Handshake',
  'nativeProtocolV1Invoke',
  'nativeProtocolV1OpenStream',
  'nativeProtocolV1Ack',
  'nativeProtocolV1Cancel',
  'nativeProtocolV1Dispose',
])

class NativeCarrierError extends Error {
  constructor(code, message, options = {}) {
    super(message)
    this.name = 'NativeCarrierError'
    this.code = code
    this.category = options.category ?? 'availability'
    this.retryable = options.retryable ?? false
    // The native error is the only place the real code and message survive; without it a caller
    // sees 'Native carrier invocation failed' and nothing about why (#850). Non-enumerable so it
    // does not widen anything that serialises this error.
    if (options.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        configurable: true,
        enumerable: false,
        writable: true,
      })
    }
    if (options.carrierId)
      this.carrierId = options.carrierId
    if (options.requestId)
      this.requestId = options.requestId
    if (options.streamId)
      this.streamId = options.streamId
    // Native-supplied. validate_error bounds the keys to identifiers and the values to
    // string/number/boolean, so this cannot become a payload smuggling channel; it stays off the
    // message for the same reason `cause` does.
    if (options.details && typeof options.details === 'object')
      this.details = options.details
  }
}

class NapiCarrier {
  constructor(options) {
    if (!options || typeof options !== 'object') {
      throw carrierError('CARRIER_INVALID_OPTIONS', 'Native carrier options are invalid')
    }
    this.id = normalizeIdentifier(options.id, 'carrier')
    this.binding = options.binding
    this.logger = options.logger ?? null
    this.clientName = options.clientName ?? 'core-app'
    this.clientVersion = options.clientVersion ?? '0.0.0'
    this.state = 'new'
    this.snapshot = null
    this.streams = new Map()
    this.processNonce = crypto.randomBytes(12).toString('hex')
    this.counter = 0n
    assertBinding(this.id, this.binding)
  }

  handshake() {
    if (this.state === 'disposed') {
      throw carrierError('CARRIER_DISPOSED', 'Native carrier is disposed', this.id)
    }
    if (this.snapshot)
      return this.snapshot

    const hello = {
      kind: 'client_hello',
      protocol: { major: 1, minMinor: 0, maxMinor: 0 },
      client: { name: this.clientName, version: this.clientVersion },
      requestedFeatures: ['attachments', 'stream-credit-v1'],
    }
    let encoded
    try {
      encoded = this.binding.nativeProtocolV1Handshake(encodeControl(hello))
    }
    catch (error) {
      this.safeLog('warn', 'handshake-failed', { code: 'CARRIER_HANDSHAKE_FAILED' })
      throw carrierError(
        'CARRIER_HANDSHAKE_FAILED',
        'Native carrier handshake failed',
        this.id,
        { cause: error },
      )
    }

    let snapshot
    try {
      snapshot = decodeControl(encoded)
    }
    catch (error) {
      throw carrierError(
        'CARRIER_PROTOCOL_VIOLATION',
        'Native carrier returned an invalid handshake',
        this.id,
        { cause: error },
      )
    }
    if (snapshot.kind !== 'server_hello') {
      throw carrierError(
        'CARRIER_PROTOCOL_VIOLATION',
        'Native carrier returned an unexpected handshake',
        this.id,
      )
    }
    for (const feature of hello.requestedFeatures) {
      if (!snapshot.carrierFeatures.includes(feature)) {
        throw carrierError(
          'CARRIER_FEATURE_UNSUPPORTED',
          'Native carrier is missing a required feature',
          this.id,
        )
      }
    }
    this.snapshot = snapshot
    this.state = 'ready'
    this.safeLog('info', 'handshake-ready', {
      protocolMajor: snapshot.protocol.major,
      protocolMinor: snapshot.protocol.minor,
      capabilityCount: snapshot.capabilities.length,
    })
    return snapshot
  }

  async invoke(control, attachments = []) {
    this.ensureReady()
    if (!control || control.kind !== 'request') {
      throw carrierError('CARRIER_INVALID_REQUEST', 'Native carrier request is invalid', this.id)
    }
    let raw
    try {
      raw = await this.binding.nativeProtocolV1Invoke(
        encodeControl(control),
        attachments,
      )
    }
    catch (error) {
      this.safeLog('warn', 'invoke-failed', {
        code: 'CARRIER_INVOKE_FAILED',
        requestId: safeIdentifier(control.requestId),
      })
      throw carrierError(
        'CARRIER_INVOKE_FAILED',
        'Native carrier invocation failed',
        this.id,
        { requestId: control.requestId, cause: error },
      )
    }
    const packet = this.decodePacket(raw, 'invoke')
    if (packet.control.kind !== 'response'
      || packet.control.requestId !== control.requestId) {
      throw carrierError(
        'CARRIER_PROTOCOL_VIOLATION',
        'Native carrier response correlation failed',
        this.id,
        { requestId: control.requestId },
      )
    }
    return packet
  }

  openStream(control, attachments = [], onFrame) {
    this.ensureReady()
    if (!control || control.kind !== 'request' || typeof onFrame !== 'function') {
      throw carrierError('CARRIER_INVALID_REQUEST', 'Native stream request is invalid', this.id)
    }
    const streamId = control.payload?.streamId
    normalizeIdentifier(streamId, 'stream')
    if (this.streams.has(streamId)) {
      throw carrierError('DUPLICATE_REQUEST_ID', 'Native stream id is already open', this.id, {
        streamId,
      })
    }
    const state = {
      streamId,
      expectedSequence: 1,
      terminalReceived: false,
      released: false,
      onFrame,
    }
    this.streams.set(streamId, state)

    let rawAccepted
    try {
      rawAccepted = this.binding.nativeProtocolV1OpenStream(
        encodeControl(control),
        attachments,
        raw => this.handleFrame(state, raw),
      )
    }
    catch (error) {
      this.streams.delete(streamId)
      throw carrierError(
        'CARRIER_OPEN_STREAM_FAILED',
        'Native carrier could not open the stream',
        this.id,
        { requestId: control.requestId, streamId, cause: error },
      )
    }
    const accepted = this.decodePacket(rawAccepted, 'open-stream')
    if (accepted.control.kind !== 'response'
      || accepted.control.requestId !== control.requestId
      || (accepted.control.ok && accepted.control.payload?.streamId !== streamId)) {
      this.streams.delete(streamId)
      throw carrierError(
        'CARRIER_PROTOCOL_VIOLATION',
        'Native stream acceptance correlation failed',
        this.id,
        { requestId: control.requestId, streamId },
      )
    }
    if (!accepted.control.ok)
      this.streams.delete(streamId)
    return accepted
  }

  acknowledge(streamId, ackSequence) {
    const state = this.streams.get(streamId)
    if (!state || state.released || state.terminalReceived)
      return false
    try {
      this.binding.nativeProtocolV1Ack(encodeControl({
        kind: 'stream_ack',
        protocol: PROTOCOL_V1,
        streamId,
        ackSequence,
      }))
      return true
    }
    catch (error) {
      const code = error?.code === 'QueueFull'
        ? 'NATIVE_BACKPRESSURE_BROKEN'
        : 'CARRIER_ACK_FAILED'
      throw carrierError(
        code,
        code === 'NATIVE_BACKPRESSURE_BROKEN'
          ? 'Native stream backpressure invariant failed'
          : 'Native stream acknowledgement failed',
        this.id,
        { streamId },
      )
    }
  }

  cancel(targetType, id, reason = 'caller') {
    if (this.state === 'disposed')
      return false
    try {
      this.binding.nativeProtocolV1Cancel(encodeControl({
        kind: 'cancel',
        protocol: PROTOCOL_V1,
        target: { type: targetType, id },
        reason,
      }))
      return true
    }
    catch (error) {
      throw carrierError(
        'CARRIER_CANCEL_FAILED',
        'Native cancellation failed',
        this.id,
        targetType === 'stream'
          ? { streamId: id, cause: error }
          : { requestId: id, cause: error },
      )
    }
  }

  async health() {
    const requestId = this.nextId('health')
    const packet = await this.invoke({
      kind: 'request',
      protocol: PROTOCOL_V1,
      requestId,
      capability: 'native.runtime',
      operation: 'health',
      payload: null,
      attachments: [],
    })
    return packet.control
  }

  releaseStream(streamId) {
    const state = this.streams.get(streamId)
    if (!state)
      return false
    state.released = true
    this.streams.delete(streamId)
    return true
  }

  async dispose() {
    if (this.state === 'disposed')
      return
    this.state = 'disposing'
    for (const state of this.streams.values()) {
      state.released = true
    }
    this.streams.clear()
    try {
      await this.binding.nativeProtocolV1Dispose()
    }
    catch (error) {
      throw carrierError(
        'CARRIER_DISPOSE_FAILED',
        'Native carrier disposal failed',
        this.id,
        { cause: error },
      )
    }
    finally {
      this.state = 'disposed'
      this.snapshot = null
    }
  }

  nextId(scope = 'request') {
    this.counter += 1n
    return `nc-${this.processNonce}-${scope}-${this.counter}`
  }

  handleFrame(state, raw) {
    if (state.released || this.state === 'disposed')
      return
    let packet
    try {
      packet = this.decodePacket(raw, 'stream-frame')
      const frame = packet.control
      if (!['stream_data', 'stream_end', 'stream_error'].includes(frame.kind)
        || frame.streamId !== state.streamId
        || frame.sequence !== state.expectedSequence
        || state.terminalReceived) {
        throw new ProtocolContractError(
          'INVALID_ENVELOPE',
          'Native stream frame correlation failed',
        )
      }
      state.expectedSequence += 1
      if (frame.kind === 'stream_end' || frame.kind === 'stream_error') {
        state.terminalReceived = true
      }
    }
    catch {
      this.failStream(state, 'NATIVE_PROTOCOL_VIOLATION')
      this.safeLog('warn', 'stream-protocol-violation', {
        code: 'CARRIER_PROTOCOL_VIOLATION',
        streamId: state.streamId,
      })
      return
    }

    try {
      state.onFrame(packet)
    }
    catch {
      state.released = true
      this.streams.delete(state.streamId)
      try {
        this.cancel('stream', state.streamId, 'consumer_closed')
      }
      catch {}
    }
  }

  failStream(state, code) {
    if (state.released || state.terminalReceived)
      return
    state.terminalReceived = true
    try {
      state.onFrame({
        control: {
          kind: 'stream_error',
          protocol: PROTOCOL_V1,
          streamId: state.streamId,
          sequence: state.expectedSequence,
          error: {
            code,
            category: 'protocol',
            message: 'Native stream protocol failed',
            retryable: false,
          },
          attachments: [],
        },
        attachments: [],
      })
    }
    catch {}
    state.released = true
    this.streams.delete(state.streamId)
    try {
      this.cancel('stream', state.streamId, 'consumer_closed')
    }
    catch {}
  }

  decodePacket(raw, source) {
    if (!raw || typeof raw !== 'object'
      || typeof raw.control !== 'string'
      || !Array.isArray(raw.attachments)) {
      throw carrierError(
        'CARRIER_PROTOCOL_VIOLATION',
        'Native carrier returned an invalid packet',
        this.id,
      )
    }
    try {
      return validatePacket(raw.control, raw.attachments)
    }
    catch (error) {
      this.safeLog('warn', 'packet-invalid', {
        code: 'CARRIER_PROTOCOL_VIOLATION',
        source,
      })
      throw carrierError(
        'CARRIER_PROTOCOL_VIOLATION',
        'Native carrier returned an invalid packet',
        this.id,
        { cause: error },
      )
    }
  }

  ensureReady() {
    if (this.state === 'disposed' || this.state === 'disposing') {
      throw carrierError('CARRIER_DISPOSED', 'Native carrier is disposed', this.id)
    }
    if (!this.snapshot)
      this.handshake()
  }

  safeLog(level, event, metadata) {
    const method = this.logger?.[level]
    if (typeof method !== 'function')
      return
    method.call(this.logger, `Native carrier ${event}`, {
      carrierId: this.id,
      ...metadata,
    })
  }
}

function assertBinding(carrierId, binding) {
  if (!binding || typeof binding !== 'object') {
    throw carrierError(
      'CARRIER_BINDING_UNAVAILABLE',
      'Native carrier binding is unavailable',
      carrierId,
    )
  }
  const missing = EXPECTED_EXPORTS.filter(name => typeof binding[name] !== 'function')
  if (missing.length > 0) {
    throw carrierError(
      'CARRIER_EXPORT_MISMATCH',
      'Native carrier exports do not match protocol v1',
      carrierId,
    )
  }
}

function normalizeIdentifier(value, fallback) {
  if (typeof value !== 'string' || !/^[A-Z0-9][\w.:-]{0,127}$/i.test(value)) {
    throw carrierError('CARRIER_INVALID_IDENTIFIER', 'Native carrier identifier is invalid')
  }
  return value || fallback
}

function safeIdentifier(value) {
  return typeof value === 'string' && /^[A-Z0-9][\w.:-]{0,127}$/i.test(value)
    ? value
    : undefined
}

/**
 * Matches PROTOCOL_ERROR_ENVELOPE_PREFIX in native-napi/src/lib.rs. The napi Status enum is fixed,
 * so a protocol code cannot ride on `err.code` the way QueueFull does; the reason string is the
 * only channel with room for the structure, and this is where the two halves agree on its shape.
 */
const PROTOCOL_ERROR_ENVELOPE_PREFIX = '|protocol-error:'
// Kept in step with ERROR_ENVELOPE_PREFIX in native-core/src/error.rs by protocol-contract's
// own check rather than by hoping; see protocol-error-envelope.test.js.

/**
 * Reads the structured ProtocolError a native rejection carries, or null when it carries none.
 *
 * Deliberately returns the fields and not the text: `message` stays out, because a carrier error's
 * message must not surface native content — the sanitised-error tests in this package's suite are
 * the contract for that, and predate this envelope.
 */
function readProtocolError(error) {
  const reason = typeof error?.message === 'string' ? error.message : ''
  const at = reason.indexOf(PROTOCOL_ERROR_ENVELOPE_PREFIX)
  if (at === -1)
    return null

  let parsed
  try {
    parsed = JSON.parse(reason.slice(at + PROTOCOL_ERROR_ENVELOPE_PREFIX.length))
  }
  catch {
    return null
  }

  if (!parsed || typeof parsed.code !== 'string' || typeof parsed.retryable !== 'boolean')
    return null

  return {
    code: parsed.code,
    category: typeof parsed.category === 'string' ? parsed.category : undefined,
    retryable: parsed.retryable,
    details: parsed.details && typeof parsed.details === 'object' ? parsed.details : undefined,
  }
}

function carrierError(code, message, carrierId, correlation = {}) {
  const native = readProtocolError(correlation.cause)
  return new NativeCarrierError(native?.code ?? code, message, {
    carrierId,
    requestId: safeIdentifier(correlation.requestId),
    streamId: safeIdentifier(correlation.streamId),
    cause: correlation.cause,
    category: native?.category,
    retryable: native?.retryable,
    details: native?.details,
  })
}

module.exports = {
  EXPECTED_EXPORTS,
  NapiCarrier,
  NativeCarrierError,
}
