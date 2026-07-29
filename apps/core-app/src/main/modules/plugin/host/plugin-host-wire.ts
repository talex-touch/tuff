export const HOST_PROTOCOL_VERSION = 2 as const

export const PLUGIN_HOST_CAPABILITIES = [
  'plugin.info.get',
  'permission.check',
  'feature.registry.add',
  'feature.registry.remove',
  'feature.registry.list',
  'feature.items.push',
  'feature.items.update',
  'feature.items.remove',
  'feature.items.clear',
  'feature.items.list',
  'storage.file.read',
  'storage.file.write',
  'storage.file.remove',
  'storage.file.list',
  'storage.sqlite.execute',
  'storage.sqlite.batch',
  'secret.get',
  'secret.set',
  'secret.delete',
  'clipboard.read',
  'clipboard.write',
  'clipboard.copy-and-paste',
  'dialog.open',
  'open-url',
  'http.request',
  'channel.invoke',
  'channel.subscribe',
  'channel.unsubscribe',
  'intelligence.invoke',
  'intelligence.stream',
  'voice.invoke',
  'voice.stream',
  'flow.invoke',
  'quick-ops.invoke',
  'filesystem.read',
  'filesystem.write',
  'filesystem.list',
  'filesystem.stat',
  'process.spawn',
  'process.workspace-scripts',
  'system.invoke',
  'browser-data.scan',
  'system.browser-open',
  'system.window-presets',
  'system.window-manager'
] as const

export const PLUGIN_HOST_LIFECYCLE_METHODS = [
  'onInit',
  'onMessage',
  'onLaunch',
  'onFeatureTriggered',
  'onInputChanged',
  'onActionClick',
  'onClose',
  'onItemAction',
  'onStorageChange',
  'onDestroy'
] as const

export const PLUGIN_HOST_RESOURCE_KINDS = [
  'callback',
  'subscription',
  'stream',
  'disposer',
  'process'
] as const

export const PLUGIN_HOST_VIOLATION_CODES = [
  'PLUGIN_HOST_VIOLATION_PROTOCOL',
  'PLUGIN_HOST_VIOLATION_OWNER',
  'PLUGIN_HOST_VIOLATION_STATE',
  'PLUGIN_HOST_VIOLATION_LIMIT',
  'PLUGIN_HOST_VIOLATION_RUNTIME'
] as const

export type PluginHostCapability = (typeof PLUGIN_HOST_CAPABILITIES)[number]
export type PluginHostCallbackLifetime = 'transient' | 'resource'
export interface PluginHostCapabilityDeclaration {
  readonly id: PluginHostCapability
  readonly callbackLifetime: PluginHostCallbackLifetime
  readonly callbackFields: readonly string[]
}
export type PluginHostLifecycleMethod = (typeof PLUGIN_HOST_LIFECYCLE_METHODS)[number]
export type PluginHostResourceKind = (typeof PLUGIN_HOST_RESOURCE_KINDS)[number]
export type PluginHostViolationCode = (typeof PLUGIN_HOST_VIOLATION_CODES)[number]
export type HostMessageDirection = 'main-to-child' | 'child-to-main'

export interface HostMessageOwner {
  protocolVersion: typeof HOST_PROTOCOL_VERSION
  activationHandle: string
  hostGeneration: number
}

interface HostMessageBase extends HostMessageOwner {
  requestId: number
}

export interface StableHostError {
  code: string
  message?: string
  retryable?: boolean
}

export interface HostInit extends HostMessageBase {
  type: 'host-init'
  handshakeNonce: string
}

export interface HostReady extends HostMessageBase {
  type: 'host-ready'
  handshakeNonce: string
}

export interface HostLoad extends HostMessageBase {
  type: 'host-load'
  payload: unknown
}

export interface HostLoadSuccess extends HostMessageBase {
  type: 'load-result'
  ok: true
  result: unknown
}

export interface HostLoadFailure extends HostMessageBase {
  type: 'load-result'
  ok: false
  error: StableHostError
}

export interface HostLifecycleCall extends HostMessageBase {
  type: 'lifecycle-call'
  method: PluginHostLifecycleMethod
  payload: unknown
}

export interface HostLifecycleSuccess extends HostMessageBase {
  type: 'lifecycle-result'
  ok: true
  result: unknown
}

export interface HostLifecycleFailure extends HostMessageBase {
  type: 'lifecycle-result'
  ok: false
  error: StableHostError
}

export interface HostCapabilityCall extends HostMessageBase {
  type: 'capability-call'
  capability: PluginHostCapability
  payload: unknown
}

export interface HostCapabilitySuccess extends HostMessageBase {
  type: 'capability-result'
  ok: true
  result: unknown
}

export interface HostCapabilityFailure extends HostMessageBase {
  type: 'capability-result'
  ok: false
  error: StableHostError
}

export interface HostCallbackCall extends HostMessageBase {
  type: 'callback-call'
  callbackId: string
  payload: unknown
}

export interface HostCallbackSuccess extends HostMessageBase {
  type: 'callback-result'
  ok: true
  result: unknown
}

export interface HostCallbackFailure extends HostMessageBase {
  type: 'callback-result'
  ok: false
  error: StableHostError
}

export interface HostCancel extends HostMessageBase {
  type: 'cancel'
  targetRequestId: number
}

export interface HostResourceDispose extends HostMessageBase {
  type: 'resource-dispose'
  resourceId: string
  resourceKind: PluginHostResourceKind
}

export interface HostShutdown extends HostMessageBase {
  type: 'shutdown'
}

export interface HostViolation extends HostMessageBase {
  type: 'violation'
  error: StableHostError & { code: PluginHostViolationCode }
}

export type HostLoadResult = HostLoadSuccess | HostLoadFailure
export type HostLifecycleResult = HostLifecycleSuccess | HostLifecycleFailure
export type HostCapabilityResult = HostCapabilitySuccess | HostCapabilityFailure
export type HostCallbackResult = HostCallbackSuccess | HostCallbackFailure

export type HostWireMessage =
  | HostInit
  | HostReady
  | HostLoad
  | HostLoadResult
  | HostLifecycleCall
  | HostLifecycleResult
  | HostCapabilityCall
  | HostCapabilityResult
  | HostCallbackCall
  | HostCallbackResult
  | HostCancel
  | HostResourceDispose
  | HostShutdown
  | HostViolation

export type HostProtocolErrorCode =
  | 'PLUGIN_HOST_PROTOCOL_VERSION'
  | 'PLUGIN_HOST_INVALID_OWNER'
  | 'PLUGIN_HOST_OWNER_MISMATCH'
  | 'PLUGIN_HOST_INVALID_REQUEST_ID'
  | 'PLUGIN_HOST_INVALID_MESSAGE'
  | 'PLUGIN_HOST_UNKNOWN_MESSAGE'
  | 'PLUGIN_HOST_WRONG_DIRECTION'
  | 'PLUGIN_HOST_UNKNOWN_CAPABILITY'
  | 'PLUGIN_HOST_UNKNOWN_LIFECYCLE'
  | 'PLUGIN_HOST_UNKNOWN_RESOURCE_KIND'
  | 'PLUGIN_HOST_UNKNOWN_VIOLATION'

export class HostProtocolError extends Error {
  constructor(readonly code: HostProtocolErrorCode) {
    super(code)
    this.name = 'HostProtocolError'
  }
}

const CAPABILITIES = new Set<string>(PLUGIN_HOST_CAPABILITIES)
const LIFECYCLE_METHODS = new Set<string>(PLUGIN_HOST_LIFECYCLE_METHODS)
const RESOURCE_KINDS = new Set<string>(PLUGIN_HOST_RESOURCE_KINDS)
const VIOLATION_CODES = new Set<string>(PLUGIN_HOST_VIOLATION_CODES)
const COMMON_KEYS = ['protocolVersion', 'activationHandle', 'hostGeneration', 'type', 'requestId']
const MAX_IDENTIFIER_LENGTH = 128
const MAX_ERROR_MESSAGE_LENGTH = 4096
const STABLE_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function readOptionalDataField(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor) return undefined
  if (!descriptor.enumerable || !('value' in descriptor)) {
    throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
  }
  return descriptor.value
}

function readDataField(value: Record<string, unknown>, key: string): unknown {
  const field = readOptionalDataField(value, key)
  if (field === undefined && !Object.hasOwn(value, key)) {
    throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
  }
  return field
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys)
  let enumerableOwnKeyCount = 0
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue
    enumerableOwnKeyCount += 1
    if (enumerableOwnKeyCount > expected.size || !expected.has(key)) return false
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !('value' in descriptor)) return false
  }
  if (enumerableOwnKeyCount !== expected.size) return false

  // Structured clone exposes enumerable string keys. Delay the exhaustive own-key
  // check until that bounded surface is valid so hostile extra fields cannot force
  // a second unbounded key-array allocation in the receiver.
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.length !== expected.size) return false
  for (const key of ownKeys) {
    if (typeof key !== 'string' || !expected.has(key)) return false
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !('value' in descriptor)) return false
  }
  return true
}

function assertExpectedOwner(value: Record<string, unknown>, expected: HostMessageOwner): void {
  const protocolVersion = readOptionalDataField(value, 'protocolVersion')
  const activationHandle = readOptionalDataField(value, 'activationHandle')
  const hostGeneration = readOptionalDataField(value, 'hostGeneration')
  if (protocolVersion !== HOST_PROTOCOL_VERSION) {
    throw new HostProtocolError('PLUGIN_HOST_PROTOCOL_VERSION')
  }
  if (
    typeof activationHandle !== 'string' ||
    activationHandle.length < 1 ||
    activationHandle.length > MAX_IDENTIFIER_LENGTH ||
    !Number.isSafeInteger(hostGeneration) ||
    Number(hostGeneration) < 1
  ) {
    throw new HostProtocolError('PLUGIN_HOST_INVALID_OWNER')
  }
  if (!isRecord(expected)) throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
  const expectedProtocolVersion = readDataField(expected, 'protocolVersion')
  const expectedActivationHandle = readDataField(expected, 'activationHandle')
  const expectedHostGeneration = readDataField(expected, 'hostGeneration')
  if (
    expectedProtocolVersion !== HOST_PROTOCOL_VERSION ||
    typeof expectedActivationHandle !== 'string' ||
    !Number.isSafeInteger(expectedHostGeneration)
  ) {
    throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
  }
  if (activationHandle !== expectedActivationHandle || hostGeneration !== expectedHostGeneration) {
    throw new HostProtocolError('PLUGIN_HOST_OWNER_MISMATCH')
  }
}

function assertRequestId(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new HostProtocolError('PLUGIN_HOST_INVALID_REQUEST_ID')
  }
}

function assertIdentifier(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_IDENTIFIER_LENGTH) {
    throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
  }
}

function assertDirection(direction: HostMessageDirection, expected: HostMessageDirection): void {
  if (direction !== expected) throw new HostProtocolError('PLUGIN_HOST_WRONG_DIRECTION')
}

function isStableError(value: unknown): value is StableHostError {
  if (!isRecord(value)) return false
  const keys = Object.hasOwn(value, 'message')
    ? Object.hasOwn(value, 'retryable')
      ? ['code', 'message', 'retryable']
      : ['code', 'message']
    : Object.hasOwn(value, 'retryable')
      ? ['code', 'retryable']
      : ['code']
  if (!hasExactKeys(value, keys)) return false
  const code = readDataField(value, 'code')
  const message = Object.hasOwn(value, 'message') ? readDataField(value, 'message') : undefined
  const retryable = Object.hasOwn(value, 'retryable')
    ? readDataField(value, 'retryable')
    : undefined
  return (
    typeof code === 'string' &&
    code.length >= 1 &&
    code.length <= MAX_IDENTIFIER_LENGTH &&
    STABLE_ERROR_CODE_PATTERN.test(code) &&
    (message === undefined ||
      (typeof message === 'string' && message.length <= MAX_ERROR_MESSAGE_LENGTH)) &&
    (retryable === undefined || typeof retryable === 'boolean')
  )
}

function parseResultMessage(
  value: Record<string, unknown>,
  successKeys: readonly string[],
  failureKeys: readonly string[]
): void {
  const ok = readDataField(value, 'ok')
  if (ok === true) {
    if (!hasExactKeys(value, successKeys)) {
      throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
    }
    return
  }
  if (
    ok !== false ||
    !hasExactKeys(value, failureKeys) ||
    !isStableError(readDataField(value, 'error'))
  ) {
    throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
  }
}

function parseHostMessageInternal(
  direction: HostMessageDirection,
  expectedOwner: HostMessageOwner,
  value: unknown
): HostWireMessage {
  if (!isRecord(value)) throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
  assertExpectedOwner(value, expectedOwner)
  const requestId = readDataField(value, 'requestId')
  assertRequestId(requestId)
  const type = readDataField(value, 'type')
  if (typeof type !== 'string') throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')

  switch (type) {
    case 'host-init':
      assertDirection(direction, 'main-to-child')
      if (!hasExactKeys(value, [...COMMON_KEYS, 'handshakeNonce'])) {
        throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
      }
      assertIdentifier(readDataField(value, 'handshakeNonce'))
      return value as unknown as HostInit
    case 'host-ready':
      assertDirection(direction, 'child-to-main')
      if (!hasExactKeys(value, [...COMMON_KEYS, 'handshakeNonce'])) {
        throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
      }
      assertIdentifier(readDataField(value, 'handshakeNonce'))
      return value as unknown as HostReady
    case 'host-load':
      assertDirection(direction, 'main-to-child')
      if (!hasExactKeys(value, [...COMMON_KEYS, 'payload'])) {
        throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
      }
      return value as unknown as HostLoad
    case 'load-result':
      assertDirection(direction, 'child-to-main')
      parseResultMessage(value, [...COMMON_KEYS, 'ok', 'result'], [...COMMON_KEYS, 'ok', 'error'])
      return value as unknown as HostLoadResult
    case 'lifecycle-call': {
      assertDirection(direction, 'main-to-child')
      if (!hasExactKeys(value, [...COMMON_KEYS, 'method', 'payload'])) {
        throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
      }
      const method = readDataField(value, 'method')
      if (typeof method !== 'string' || !LIFECYCLE_METHODS.has(method)) {
        throw new HostProtocolError('PLUGIN_HOST_UNKNOWN_LIFECYCLE')
      }
      return value as unknown as HostLifecycleCall
    }
    case 'lifecycle-result':
      assertDirection(direction, 'child-to-main')
      parseResultMessage(value, [...COMMON_KEYS, 'ok', 'result'], [...COMMON_KEYS, 'ok', 'error'])
      return value as unknown as HostLifecycleResult
    case 'capability-call': {
      assertDirection(direction, 'child-to-main')
      if (!hasExactKeys(value, [...COMMON_KEYS, 'capability', 'payload'])) {
        throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
      }
      const capability = readDataField(value, 'capability')
      if (typeof capability !== 'string' || !CAPABILITIES.has(capability)) {
        throw new HostProtocolError('PLUGIN_HOST_UNKNOWN_CAPABILITY')
      }
      return value as unknown as HostCapabilityCall
    }
    case 'capability-result':
      assertDirection(direction, 'main-to-child')
      parseResultMessage(value, [...COMMON_KEYS, 'ok', 'result'], [...COMMON_KEYS, 'ok', 'error'])
      return value as unknown as HostCapabilityResult
    case 'callback-call':
      assertDirection(direction, 'main-to-child')
      if (!hasExactKeys(value, [...COMMON_KEYS, 'callbackId', 'payload'])) {
        throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
      }
      assertIdentifier(readDataField(value, 'callbackId'))
      return value as unknown as HostCallbackCall
    case 'callback-result':
      assertDirection(direction, 'child-to-main')
      parseResultMessage(value, [...COMMON_KEYS, 'ok', 'result'], [...COMMON_KEYS, 'ok', 'error'])
      return value as unknown as HostCallbackResult
    case 'cancel':
      if (!hasExactKeys(value, [...COMMON_KEYS, 'targetRequestId'])) {
        throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
      }
      assertRequestId(readDataField(value, 'targetRequestId'))
      return value as unknown as HostCancel
    case 'resource-dispose': {
      if (!hasExactKeys(value, [...COMMON_KEYS, 'resourceId', 'resourceKind'])) {
        throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
      }
      assertIdentifier(readDataField(value, 'resourceId'))
      const resourceKind = readDataField(value, 'resourceKind')
      if (typeof resourceKind !== 'string' || !RESOURCE_KINDS.has(resourceKind)) {
        throw new HostProtocolError('PLUGIN_HOST_UNKNOWN_RESOURCE_KIND')
      }
      return value as unknown as HostResourceDispose
    }
    case 'shutdown':
      assertDirection(direction, 'main-to-child')
      if (!hasExactKeys(value, COMMON_KEYS)) {
        throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
      }
      return value as unknown as HostShutdown
    case 'violation': {
      assertDirection(direction, 'child-to-main')
      if (!hasExactKeys(value, [...COMMON_KEYS, 'error'])) {
        throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
      }
      const error = readDataField(value, 'error')
      if (!isStableError(error)) {
        throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
      }
      if (!VIOLATION_CODES.has(error.code)) {
        throw new HostProtocolError('PLUGIN_HOST_UNKNOWN_VIOLATION')
      }
      return value as unknown as HostViolation
    }
    default:
      throw new HostProtocolError('PLUGIN_HOST_UNKNOWN_MESSAGE')
  }
}

export function parseHostMessage(
  direction: HostMessageDirection,
  expectedOwner: HostMessageOwner,
  value: unknown
): HostWireMessage {
  try {
    return parseHostMessageInternal(direction, expectedOwner, value)
  } catch (error) {
    if (error instanceof HostProtocolError) throw error
    throw new HostProtocolError('PLUGIN_HOST_INVALID_MESSAGE')
  }
}
