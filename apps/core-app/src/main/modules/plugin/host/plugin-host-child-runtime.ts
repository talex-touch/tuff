import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { types as utilTypes } from 'node:util'
import vm from 'node:vm'
import {
  DEFAULT_HOST_WIRE_LIMITS,
  decodeHostWireValue,
  encodeHostWireValue,
  type HostWireLimits,
  type HostWireResourceDescriptor
} from './plugin-host-wire-codec'
import {
  PLUGIN_CHANNEL_OPERATION_IDS,
  PLUGIN_FLOW_OPERATION_IDS,
  PLUGIN_QUICK_OPS_OPERATION_IDS
} from './plugin-host-request-reply'
import {
  PLUGIN_HOST_CAPABILITIES,
  PLUGIN_HOST_LIFECYCLE_METHODS,
  type PluginHostCapability,
  type PluginHostCapabilityDeclaration,
  type PluginHostLifecycleMethod
} from './plugin-host-wire'

export type PluginHostChildErrorCode =
  | 'PLUGIN_HOST_CHILD_LOAD_INVALID'
  | 'PLUGIN_HOST_CHILD_SCRIPT_FAILED'
  | 'PLUGIN_HOST_CHILD_EXPORT_INVALID'
  | 'PLUGIN_HOST_CHILD_LIFECYCLE_PAYLOAD_INVALID'
  | 'PLUGIN_HOST_CHILD_LIFECYCLE_FAILED'
  | 'PLUGIN_HOST_CHILD_CANCELLED'
  | 'PLUGIN_HOST_CHILD_CLOSED'
  | 'PLUGIN_HOST_CHILD_RESULT_INVALID'

export class PluginHostChildError extends Error {
  constructor(readonly code: PluginHostChildErrorCode) {
    super(code)
    this.name = 'PluginHostChildError'
  }
}

export type PluginHostSnapshotValue =
  | null
  | boolean
  | number
  | string
  | readonly PluginHostSnapshotValue[]
  | { readonly [key: string]: PluginHostSnapshotValue }

export interface PluginHostLoadSnapshot {
  readonly platform: string
  readonly arch: string
  readonly locale: string
  readonly manifest: Readonly<Record<string, PluginHostSnapshotValue>>
}

export interface PluginHostLoadPayload {
  readonly scriptContent: string
  readonly snapshot: PluginHostLoadSnapshot
  readonly capabilityManifest: readonly PluginHostCapabilityDeclaration[]
  readonly callbackLimits: {
    readonly maxCallbacks: number
    readonly maxConcurrentCallbacks: number
    readonly maxResources: number
  }
}

interface ContextTransportNode {
  readonly type:
    | 'null'
    | 'boolean'
    | 'number'
    | 'string'
    | 'undefined'
    | 'array'
    | 'object'
    | 'bytes'
    | 'error'
    | 'callback'
    | 'resource'
  readonly value?: unknown
}

interface ContextAbortSignal {
  readonly aborted: boolean
  readonly reason?: unknown
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void
  removeEventListener(type: 'abort', listener: () => void): void
}

interface ContextAbortController {
  readonly signal: ContextAbortSignal
  abort(reason?: unknown): void
}

interface ContextBridge {
  setTimeout(callback: () => unknown, delay: number): number
  setInterval(callback: () => unknown, delay: number): number
  setImmediate(callback: () => unknown): number
  clearTimer(id: number): void
  reportUnhandledError(): void
  utf8ByteLength(value: string): number
  encodeUtf8(value: string): number[]
  decodeUtf8(value: number[]): string
  parseUrl(input: string, base?: string): string
  randomBytes(length: number): number[]
  randomUUID(): string
  digest(algorithm: string, value: number[]): number[]
  invokeCapability(capability: string, payloadJson: string, callbacks: unknown[]): Promise<string>
  disposeResource(id: string, kind: string): Promise<void>
}

export interface PluginPreludeLifecycleCall {
  readonly promise: Promise<unknown>
  readonly completion: Promise<void>
  cancel(): void
}

export interface PluginPreludeRuntime {
  readonly methods: readonly PluginHostLifecycleMethod[]
  callLifecycle(method: PluginHostLifecycleMethod, payload: unknown): PluginPreludeLifecycleCall
  callCallback(callback: () => unknown): PluginPreludeLifecycleCall
  shutdown(): void
}

export interface LoadPluginPreludeOptions {
  limits?: Partial<HostWireLimits>
  onUnhandledError?: () => void
  invokeCapability?: (
    capability: PluginHostCapability,
    payload: unknown,
    scopeId?: number
  ) => Promise<unknown>
  cancelCapabilityScope?: (scopeId: number) => void
  releaseCapabilityScope?: (scopeId: number) => void
  cancelCapabilities?: () => void
  inspectResource?: (value: unknown) => HostWireResourceDescriptor | null
  disposeResource?: (id: string, kind: HostWireResourceDescriptor['kind']) => Promise<void>
}

const CAPABILITIES = new Set<string>(PLUGIN_HOST_CAPABILITIES)
const LIFECYCLE_METHODS = new Set<string>(PLUGIN_HOST_LIFECYCLE_METHODS)
const FORBIDDEN_SNAPSHOT_KEYS = new Set(['__proto__', 'prototype', 'constructor', '__tuffHostWire'])
const IDENTIFIER_PATTERN = /^[a-z0-9_-]+$/i
const CALLBACK_FIELD_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
const FORBIDDEN_CALLBACK_FIELDS = new Set(['__proto__', 'prototype', 'constructor', 'then'])
const MAX_PLATFORM_FIELD_LENGTH = 32
const MAX_LOCALE_FIELD_LENGTH = 64
const MAX_CONTEXT_JSON_EXPANSION = 8
const CHILD_DIGEST_ALGORITHMS = new Map([
  ['SHA-1', 'sha1'],
  ['SHA-256', 'sha256'],
  ['SHA-384', 'sha384'],
  ['SHA-512', 'sha512'],
  ['MD5', 'md5']
])

class ContextTransportBudget {
  private bytes = 0
  private members = 0

  constructor(private readonly limits: HostWireLimits) {}

  enter(depth: number): void {
    if (depth > this.limits.maxDepth) {
      throw new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID')
    }
  }

  addBytes(bytes: number): void {
    this.bytes += bytes
    if (this.bytes > this.limits.maxBytes) {
      throw new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID')
    }
  }

  addMembers(members: number): void {
    this.members += members
    if (this.members > this.limits.maxMembers) {
      throw new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID')
    }
    this.addBytes(members * 8)
  }

  addString(value: string): void {
    if (this.bytes + value.length + 8 > this.limits.maxBytes) {
      throw new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID')
    }
    this.addBytes(Buffer.byteLength(value, 'utf8') + 8)
  }
}

function contextLimits(partial?: Partial<HostWireLimits>): HostWireLimits {
  const limits = { ...DEFAULT_HOST_WIRE_LIMITS, ...partial }
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
    }
  }
  return limits
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
  }
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.length !== keys.length) {
    throw new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
  }
  const expected = new Set(keys)
  for (const key of ownKeys) {
    if (typeof key !== 'string' || !expected.has(key)) {
      throw new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !('value' in descriptor)) {
      throw new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
    }
  }
  return value as Record<string, unknown>
}

function snapshotCallbackFields(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  const lengthDescriptor = descriptors.length
  const length =
    lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined
  if (!Number.isSafeInteger(length) || Number(length) < 0 || Number(length) > 64) {
    throw new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
  }
  const allowedKeys = new Set<PropertyKey>(['length'])
  const fields: string[] = []
  for (let index = 0; index < Number(length); index += 1) {
    const key = String(index)
    allowedKeys.add(key)
    const descriptor = descriptors[key]
    const field = descriptor && 'value' in descriptor ? descriptor.value : undefined
    if (
      !descriptor?.enumerable ||
      typeof field !== 'string' ||
      !CALLBACK_FIELD_PATTERN.test(field) ||
      FORBIDDEN_CALLBACK_FIELDS.has(field) ||
      fields.includes(field)
    ) {
      throw new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
    }
    fields.push(field)
  }
  if (Reflect.ownKeys(descriptors).some((key) => !allowedKeys.has(key))) {
    throw new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
  }
  return Object.freeze(fields)
}

function snapshotJsonValue(value: unknown): PluginHostSnapshotValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => snapshotJsonValue(entry)))
  }
  const record = exactRecord(value, Reflect.ownKeys(value as object) as string[])
  const clone: Record<string, PluginHostSnapshotValue> = {}
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_SNAPSHOT_KEYS.has(key)) {
      throw new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
    }
    clone[key] = snapshotJsonValue(record[key])
  }
  return Object.freeze(clone)
}

function normalizedWireValue(value: unknown, limits?: Partial<HostWireLimits>): unknown {
  try {
    return decodeHostWireValue(encodeHostWireValue(value, { limits }), { limits })
  } catch {
    throw new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
  }
}

export function parsePluginHostLoadPayload(
  value: unknown,
  limits: Partial<HostWireLimits> = DEFAULT_HOST_WIRE_LIMITS
): PluginHostLoadPayload {
  const normalized = exactRecord(normalizedWireValue(value, limits), [
    'scriptContent',
    'snapshot',
    'capabilityManifest',
    'callbackLimits'
  ])
  if (typeof normalized.scriptContent !== 'string') {
    throw new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
  }

  const snapshot = exactRecord(normalized.snapshot, ['platform', 'arch', 'locale', 'manifest'])
  for (const field of ['platform', 'arch'] as const) {
    const entry = snapshot[field]
    if (
      typeof entry !== 'string' ||
      entry.length < 1 ||
      entry.length > MAX_PLATFORM_FIELD_LENGTH ||
      !IDENTIFIER_PATTERN.test(entry)
    ) {
      throw new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
    }
  }
  const locale = snapshot.locale
  if (
    typeof locale !== 'string' ||
    locale.length < 2 ||
    locale.length > MAX_LOCALE_FIELD_LENGTH ||
    !/^[A-Za-z0-9-]+$/.test(locale)
  ) {
    throw new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
  }
  const manifest = snapshotJsonValue(snapshot.manifest)
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
  }

  if (!Array.isArray(normalized.capabilityManifest)) {
    throw new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
  }
  const seenCapabilities = new Set<string>()
  const capabilityManifest = normalized.capabilityManifest.map((entry) => {
    const declaration = exactRecord(entry, ['id', 'callbackLifetime', 'callbackFields'])
    const capability = declaration.id
    const callbackLifetime = declaration.callbackLifetime
    const callbackFields = snapshotCallbackFields(declaration.callbackFields)
    if (
      typeof capability !== 'string' ||
      !CAPABILITIES.has(capability) ||
      seenCapabilities.has(capability) ||
      (callbackLifetime !== 'transient' && callbackLifetime !== 'resource')
    ) {
      throw new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
    }
    seenCapabilities.add(capability)
    return Object.freeze({
      id: capability as PluginHostCapability,
      callbackLifetime,
      callbackFields
    })
  })

  const callbackLimits = exactRecord(normalized.callbackLimits, [
    'maxCallbacks',
    'maxConcurrentCallbacks',
    'maxResources'
  ])
  for (const [key, maximum] of [
    ['maxCallbacks', 64],
    ['maxConcurrentCallbacks', 16],
    ['maxResources', 64]
  ] as const) {
    if (
      !Number.isSafeInteger(callbackLimits[key]) ||
      Number(callbackLimits[key]) < 1 ||
      Number(callbackLimits[key]) > maximum
    ) {
      throw new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
    }
  }

  return Object.freeze({
    scriptContent: normalized.scriptContent,
    snapshot: Object.freeze({
      platform: snapshot.platform as string,
      arch: snapshot.arch as string,
      locale,
      manifest: manifest as Readonly<Record<string, PluginHostSnapshotValue>>
    }),
    capabilityManifest: Object.freeze(capabilityManifest),
    callbackLimits: Object.freeze({
      maxCallbacks: Number(callbackLimits.maxCallbacks),
      maxConcurrentCallbacks: Number(callbackLimits.maxConcurrentCallbacks),
      maxResources: Number(callbackLimits.maxResources)
    })
  })
}

class TimerRegistry {
  private nextId = 0
  private closed = false
  private readonly timers = new Map<number, NodeJS.Timeout | NodeJS.Immediate>()

  constructor(private readonly onUnhandledError: () => void) {}

  setTimeout(callback: () => unknown, delay: number): number {
    return this.schedule('timeout', callback, delay)
  }

  setInterval(callback: () => unknown, delay: number): number {
    return this.schedule('interval', callback, delay)
  }

  setImmediate(callback: () => unknown): number {
    if (this.closed || typeof callback !== 'function') return 0
    const id = this.allocateId()
    const handle = setImmediate(() => {
      this.timers.delete(id)
      this.invoke(callback)
    })
    this.timers.set(id, handle)
    return id
  }

  clear(id: number): void {
    if (!Number.isSafeInteger(id)) return
    const handle = this.timers.get(id)
    if (!handle) return
    this.timers.delete(id)
    clearTimeout(handle as NodeJS.Timeout)
    clearInterval(handle as NodeJS.Timeout)
    clearImmediate(handle as NodeJS.Immediate)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    for (const id of [...this.timers.keys()]) this.clear(id)
  }

  private schedule(kind: 'timeout' | 'interval', callback: () => unknown, delay: number): number {
    if (this.closed || typeof callback !== 'function') return 0
    const id = this.allocateId()
    const normalizedDelay = Number.isFinite(delay) ? Math.max(0, Math.min(delay, 2 ** 31 - 1)) : 0
    const invoke = (): void => {
      if (kind === 'timeout') this.timers.delete(id)
      this.invoke(callback)
    }
    const handle =
      kind === 'timeout'
        ? setTimeout(invoke, normalizedDelay)
        : setInterval(invoke, normalizedDelay)
    handle.unref?.()
    this.timers.set(id, handle)
    return id
  }

  private allocateId(): number {
    this.nextId += 1
    if (!Number.isSafeInteger(this.nextId)) this.nextId = 1
    return this.nextId
  }

  private invoke(callback: () => unknown): void {
    try {
      callback()
    } catch {
      this.onUnhandledError()
    }
  }
}

function valueToContextNode(
  value: unknown,
  limits: HostWireLimits,
  ancestors = new WeakSet<object>(),
  budget = new ContextTransportBudget(limits),
  depth = 0,
  inspectResource?: (value: unknown) => HostWireResourceDescriptor | null
): ContextTransportNode {
  budget.enter(depth)
  if (value === undefined) {
    budget.addBytes(24)
    return { type: 'undefined' }
  }
  if (value === null) {
    budget.addBytes(8)
    return { type: 'null' }
  }
  if (typeof value === 'boolean') {
    budget.addBytes(8)
    return { type: 'boolean', value }
  }
  if (typeof value === 'string') {
    budget.addString(value)
    return { type: 'string', value }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    budget.addBytes(8)
    return { type: 'number', value }
  }
  if (!value || typeof value !== 'object') {
    throw new PluginHostChildError('PLUGIN_HOST_CHILD_LIFECYCLE_PAYLOAD_INVALID')
  }
  const resource = inspectResource?.(value)
  if (resource) {
    budget.addMembers(2)
    budget.addString(resource.id)
    budget.addString(resource.kind)
    return { type: 'resource', value: resource }
  }
  if (ancestors.has(value)) {
    throw new PluginHostChildError('PLUGIN_HOST_CHILD_LIFECYCLE_PAYLOAD_INVALID')
  }
  ancestors.add(value)
  try {
    if (ArrayBuffer.isView(value)) {
      budget.addBytes(value.byteLength + 32)
      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      return { type: 'bytes', value: Array.from(bytes) }
    }
    if (value instanceof ArrayBuffer) {
      budget.addBytes(value.byteLength + 32)
      return { type: 'bytes', value: Array.from(new Uint8Array(value)) }
    }
    if (Array.isArray(value)) {
      budget.addMembers(value.length)
      return {
        type: 'array',
        value: value.map((entry) =>
          valueToContextNode(entry, limits, ancestors, budget, depth + 1, inspectResource)
        )
      }
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new PluginHostChildError('PLUGIN_HOST_CHILD_LIFECYCLE_PAYLOAD_INVALID')
    }
    const entries: Array<[string, ContextTransportNode]> = []
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || FORBIDDEN_SNAPSHOT_KEYS.has(key)) {
        throw new PluginHostChildError('PLUGIN_HOST_CHILD_LIFECYCLE_PAYLOAD_INVALID')
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor?.enumerable || !('value' in descriptor)) {
        throw new PluginHostChildError('PLUGIN_HOST_CHILD_LIFECYCLE_PAYLOAD_INVALID')
      }
      budget.addMembers(1)
      budget.addString(key)
      entries.push([
        key,
        valueToContextNode(descriptor.value, limits, ancestors, budget, depth + 1, inspectResource)
      ])
    }
    return { type: 'object', value: entries }
  } finally {
    ancestors.delete(value)
  }
}

interface ContextNodeDecodeOptions {
  resolveCallback?: (index: number) => Callback
}

type Callback = (...args: unknown[]) => unknown

function contextNodeToValue(
  node: unknown,
  limits: HostWireLimits,
  budget = new ContextTransportBudget(limits),
  depth = 0,
  options: ContextNodeDecodeOptions = {}
): unknown {
  budget.enter(depth)
  const record = exactRecord(
    node,
    Object.hasOwn(node as object, 'value') ? ['type', 'value'] : ['type']
  )
  switch (record.type) {
    case 'undefined':
      budget.addBytes(24)
      return undefined
    case 'null':
      budget.addBytes(8)
      return null
    case 'boolean':
      if (typeof record.value !== 'boolean') break
      budget.addBytes(8)
      return record.value
    case 'number':
      if (typeof record.value !== 'number' || !Number.isFinite(record.value)) break
      budget.addBytes(8)
      return record.value
    case 'string':
      if (typeof record.value !== 'string') break
      budget.addString(record.value)
      return record.value
    case 'bytes':
      if (
        !Array.isArray(record.value) ||
        record.value.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
      )
        break
      budget.addBytes(record.value.length + 32)
      return Uint8Array.from(record.value as number[])
    case 'array':
      if (!Array.isArray(record.value)) break
      budget.addMembers(record.value.length)
      return record.value.map((entry) =>
        contextNodeToValue(entry, limits, budget, depth + 1, options)
      )
    case 'object': {
      if (!Array.isArray(record.value)) break
      const output: Record<string, unknown> = {}
      for (const entry of record.value) {
        if (
          !Array.isArray(entry) ||
          entry.length !== 2 ||
          typeof entry[0] !== 'string' ||
          FORBIDDEN_SNAPSHOT_KEYS.has(entry[0])
        ) {
          throw new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID')
        }
        budget.addMembers(1)
        budget.addString(entry[0])
        output[entry[0]] = contextNodeToValue(entry[1], limits, budget, depth + 1, options)
      }
      return output
    }
    case 'callback': {
      if (!Number.isSafeInteger(record.value) || Number(record.value) < 0) break
      budget.addBytes(16)
      const callback = options.resolveCallback?.(Number(record.value))
      if (typeof callback !== 'function') break
      return callback
    }
    case 'error': {
      const errorRecord = exactRecord(record.value, ['message', 'code'])
      if (
        typeof errorRecord.message !== 'string' ||
        (errorRecord.code !== null && typeof errorRecord.code !== 'string')
      )
        break
      budget.addMembers(2)
      budget.addString(errorRecord.message)
      if (typeof errorRecord.code === 'string') budget.addString(errorRecord.code)
      const error = new Error(errorRecord.message)
      if (typeof errorRecord.code === 'string') Object.assign(error, { code: errorRecord.code })
      return error
    }
  }
  throw new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID')
}

const CONTEXT_BOOTSTRAP = String.raw`
(() => {
  'use strict'
  const bridge = globalThis.__tuffHostBridge
  const snapshot = JSON.parse(globalThis.__tuffSnapshotJson)
  delete globalThis.__tuffHostBridge
  delete globalThis.__tuffSnapshotJson

  // These realm-local intrinsics remain authoritative after plugin code mutates globals.
  const reflectApply = Reflect.apply
  const reflectOwnKeys = Reflect.ownKeys
  const objectFreeze = Object.freeze
  const objectIsFrozen = Object.isFrozen
  const objectKeys = Object.keys
  const objectGetPrototypeOf = Object.getPrototypeOf
  const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
  const objectDefineProperty = Object.defineProperty
  const objectDefineProperties = Object.defineProperties
  const objectCreate = Object.create
  const objectHasOwn = Object.hasOwn
  const objectPrototype = Object.prototype
  const arrayConstructor = Array
  const arrayIsArray = Array.isArray
  const arrayFrom = Array.from
  const arrayMap = Array.prototype.map
  const arrayPush = Array.prototype.push
  const arrayJoin = Array.prototype.join
  const arrayIterator = Array.prototype[Symbol.iterator]
  const arrayBufferIsView = ArrayBuffer.isView
  const arrayBufferByteLengthGetter = objectGetOwnPropertyDescriptor(
    ArrayBuffer.prototype,
    'byteLength'
  ).get
  const uint8ArrayConstructor = Uint8Array
  const uint8ArraySet = Uint8Array.prototype.set
  const typedArrayPrototype = objectGetPrototypeOf(Uint8Array.prototype)
  const typedArrayBufferGetter = objectGetOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get
  const typedArrayByteLengthGetter = objectGetOwnPropertyDescriptor(
    typedArrayPrototype,
    'byteLength'
  ).get
  const typedArrayByteOffsetGetter = objectGetOwnPropertyDescriptor(
    typedArrayPrototype,
    'byteOffset'
  ).get
  const dataViewBufferGetter = objectGetOwnPropertyDescriptor(DataView.prototype, 'buffer').get
  const dataViewByteLengthGetter = objectGetOwnPropertyDescriptor(
    DataView.prototype,
    'byteLength'
  ).get
  const dataViewByteOffsetGetter = objectGetOwnPropertyDescriptor(
    DataView.prototype,
    'byteOffset'
  ).get
  const errorConstructor = Error
  const typeErrorConstructor = TypeError
  const weakSetConstructor = WeakSet
  const setConstructor = Set
  const setHas = Set.prototype.has
  const mapConstructor = Map
  const mapGet = Map.prototype.get
  const hasSetValue = (set, value) => reflectApply(setHas, set, [value])
  const getMapValue = (map, value) => reflectApply(mapGet, map, [value])
  const numberIsFinite = Number.isFinite
  const numberIsSafeInteger = Number.isSafeInteger
  const stringConstructor = String
  const stringIndexOf = String.prototype.indexOf
  const stringReplaceAll = String.prototype.replaceAll
  const stringSlice = String.prototype.slice
  const stringToUpperCase = String.prototype.toUpperCase
  const encodeUriComponent = encodeURIComponent
  const decodeUriComponent = decodeURIComponent
  const symbolIterator = Symbol.iterator
  const jsonParse = JSON.parse
  const jsonStringify = JSON.stringify
  const parseJson = (value) => reflectApply(jsonParse, undefined, [value])
  const stringifyJson = (value) => reflectApply(jsonStringify, undefined, [value])
  const mapArray = (value, callback) => reflectApply(arrayMap, value, [callback])
  const promiseConstructor = Promise
  const promiseResolve = Promise.resolve
  const promiseReject = Promise.reject
  const promiseThen = Promise.prototype.then
  const resolvePromise = (value) => reflectApply(promiseResolve, promiseConstructor, [value])
  const rejectPromise = (reason) => reflectApply(promiseReject, promiseConstructor, [reason])
  const thenPromise = (promise, onFulfilled, onRejected) =>
    reflectApply(promiseThen, promise, [onFulfilled, onRejected])
  const reportUnhandledError = () => {
    try { bridge.reportUnhandledError() } catch {}
  }
  const observeAsyncResult = (result) => {
    thenPromise(resolvePromise(result), undefined, reportUnhandledError)
  }
  const createTimerTask = (callback, args) => () => {
    try {
      observeAsyncResult(reflectApply(callback, undefined, args))
    } catch {
      reportUnhandledError()
    }
  }
  const scheduleMicrotask = (callback) => {
    if (typeof callback !== 'function') throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
    thenPromise(resolvePromise(), callback, reportUnhandledError)
  }

  const deepFreeze = (value) => {
    if (!value || typeof value !== 'object' || objectIsFrozen(value)) return value
    for (const key of objectKeys(value)) deepFreeze(value[key])
    return objectFreeze(value)
  }

  const createBudget = () => {
    let bytes = 0
    let members = 0
    const addBytes = (value) => {
      bytes += value
      if (bytes > snapshot.wireLimits.maxBytes) throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
    }
    return {
      enter(depth) {
        if (depth > snapshot.wireLimits.maxDepth) throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
      },
      addBytes,
      addMembers(value) {
        members += value
        if (members > snapshot.wireLimits.maxMembers) throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
        addBytes(value * 8)
      },
      addString(value) {
        if (bytes + value.length + 8 > snapshot.wireLimits.maxBytes) {
          throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
        }
        addBytes(bridge.utf8ByteLength(value) + 8)
      }
    }
  }

  const createByteView = (value) => {
    let buffer
    let byteOffset = 0
    let byteLength
    try {
      byteLength = reflectApply(arrayBufferByteLengthGetter, value, [])
      buffer = value
    } catch {
      if (!arrayBufferIsView(value)) {
        throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
      }
      try {
        buffer = reflectApply(typedArrayBufferGetter, value, [])
        byteOffset = reflectApply(typedArrayByteOffsetGetter, value, [])
        byteLength = reflectApply(typedArrayByteLengthGetter, value, [])
      } catch {
        try {
          buffer = reflectApply(dataViewBufferGetter, value, [])
          byteOffset = reflectApply(dataViewByteOffsetGetter, value, [])
          byteLength = reflectApply(dataViewByteLengthGetter, value, [])
        } catch {
          throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
        }
      }
    }
    if (
      !numberIsSafeInteger(byteOffset) ||
      byteOffset < 0 ||
      !numberIsSafeInteger(byteLength) ||
      byteLength < 0
    ) {
      throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
    }
    return {
      view: new uint8ArrayConstructor(buffer, byteOffset, byteLength),
      byteLength
    }
  }
  const copyByteView = (value, maximumBytes = snapshot.wireLimits.maxBytes) => {
    const info = createByteView(value)
    if (info.byteLength > maximumBytes) {
      throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
    }
    const output = []
    for (let index = 0; index < info.byteLength; index += 1) {
      reflectApply(arrayPush, output, [info.view[index]])
    }
    return output
  }

  const decodeNode = (node, budget = createBudget(), depth = 0) => {
    budget.enter(depth)
    switch (node.type) {
      case 'undefined': budget.addBytes(24); return undefined
      case 'null': budget.addBytes(8); return null
      case 'boolean': budget.addBytes(8); return node.value
      case 'number': budget.addBytes(8); return node.value
      case 'string': budget.addString(node.value); return node.value
      case 'bytes':
        budget.addBytes(node.value.length + 32)
        return reflectApply(arrayFrom, uint8ArrayConstructor, [node.value])
      case 'array':
        budget.addMembers(node.value.length)
        return mapArray(node.value, (entry) => decodeNode(entry, budget, depth + 1))
      case 'object': {
        const output = {}
        for (const [key, value] of node.value) {
          budget.addMembers(1)
          budget.addString(key)
          output[key] = decodeNode(value, budget, depth + 1)
        }
        return output
      }
      case 'resource': {
        const descriptor = node.value
        if (!descriptor || typeof descriptor !== 'object' ||
            typeof descriptor.id !== 'string' || typeof descriptor.kind !== 'string') {
          throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
        }
        budget.addMembers(3)
        budget.addString(descriptor.id)
        budget.addString(descriptor.kind)
        let disposed = false
        const resource = objectCreate(null)
        const dispose = () => {
          if (disposed) return resolvePromise()
          disposed = true
          return thenPromise(resolvePromise(), () => bridge.disposeResource(descriptor.id, descriptor.kind))
        }
        objectDefineProperty(resource, 'id', { value: descriptor.id, enumerable: true })
        objectDefineProperty(resource, 'kind', { value: descriptor.kind, enumerable: true })
        objectDefineProperty(resource, 'dispose', { value: objectFreeze(dispose), enumerable: true })
        return objectFreeze(resource)
      }
      default: throw new typeErrorConstructor('PLUGIN_HOST_CHILD_LIFECYCLE_PAYLOAD_INVALID')
    }
  }

  const encodeNode = (
    value,
    budget = createBudget(),
    ancestors = new weakSetConstructor(),
    depth = 0,
    callbacks = null,
    callbackFields = null,
    callbackAllowed = false
  ) => {
    budget.enter(depth)
    if (value === undefined) { budget.addBytes(24); return { type: 'undefined' } }
    if (value === null) { budget.addBytes(8); return { type: 'null' } }
    if (typeof value === 'boolean') { budget.addBytes(8); return { type: 'boolean', value } }
    if (typeof value === 'string') { budget.addString(value); return { type: 'string', value } }
    if (typeof value === 'number' && numberIsFinite(value)) { budget.addBytes(8); return { type: 'number', value } }
    if (typeof value === 'function') {
      if (
        !callbacks ||
        !callbackAllowed ||
        callbacks.length >= snapshot.callbackLimits.maxCallbacks
      ) {
        throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
      }
      budget.addMembers(1)
      const index = callbacks.length
      callbacks.push(value)
      return { type: 'callback', value: index }
    }
    if (typeof value !== 'object') throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
    if (ancestors.has(value)) throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
    ancestors.add(value)
    try {
      if (value instanceof errorConstructor) {
        const code = typeof value.code === 'string' ? value.code : null
        const message = reflectApply(stringSlice, stringConstructor(value.message), [0, 4096])
        budget.addMembers(2)
        budget.addString(message)
        if (code !== null) budget.addString(code)
        return { type: 'error', value: { message, code } }
      }
      if (arrayBufferIsView(value)) {
        const bytes = copyByteView(value)
        budget.addBytes(bytes.length + 32)
        return { type: 'bytes', value: bytes }
      }
      try {
        const bytes = copyByteView(value)
        budget.addBytes(bytes.length + 32)
        return { type: 'bytes', value: bytes }
      } catch {
        // Continue into the plain DTO validator for non-ArrayBuffer objects.
      }
      if (arrayIsArray(value)) {
        budget.addMembers(value.length)
        return {
          type: 'array',
          value: mapArray(value, (entry) =>
            encodeNode(entry, budget, ancestors, depth + 1, callbacks, callbackFields, false)
          )
        }
      }
      const prototype = objectGetPrototypeOf(value)
      if (prototype !== objectPrototype && prototype !== null) throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
      const entries = []
      for (const key of reflectOwnKeys(value)) {
        if (typeof key !== 'string' || key === '__proto__' || key === 'prototype' || key === 'constructor' || key === '__tuffHostWire') {
          throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
        }
        const descriptor = objectGetOwnPropertyDescriptor(value, key)
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
        budget.addMembers(1)
        budget.addString(key)
        entries.push([
          key,
          encodeNode(
            descriptor.value,
            budget,
            ancestors,
            depth + 1,
            callbacks,
            callbackFields,
            depth === 0 && callbackFields !== null && hasSetValue(callbackFields, key)
          )
        ])
      }
      return { type: 'object', value: entries }
    } finally {
      ancestors.delete(value)
    }
  }

  class TuffAbortSignal {
    #listeners = new Set()
    aborted = false
    reason = undefined
    addEventListener(type, listener, options = {}) {
      if (type !== 'abort' || typeof listener !== 'function') return
      if (this.aborted) {
        queueMicrotask(() => listener.call(this, { type: 'abort', target: this }))
        return
      }
      this.#listeners.add({ listener, once: options && options.once === true })
    }
    removeEventListener(type, listener) {
      if (type !== 'abort') return
      for (const entry of this.#listeners) if (entry.listener === listener) this.#listeners.delete(entry)
    }
    throwIfAborted() {
      if (this.aborted) throw this.reason || new Error('PLUGIN_HOST_CHILD_CANCELLED')
    }
    _abort(reason) {
      if (this.aborted) return
      this.aborted = true
      this.reason = reason
      for (const entry of [...this.#listeners]) {
        try { entry.listener.call(this, { type: 'abort', target: this }) } catch {}
        if (entry.once) this.#listeners.delete(entry)
      }
    }
  }
  class TuffAbortController {
    signal = new TuffAbortSignal()
    abort(reason) { this.signal._abort(reason) }
  }

  const searchParamsInternalToken = objectFreeze(objectCreate(null))
  const maxSearchParamPairs = Math.floor(snapshot.wireLimits.maxMembers / 3)
  const assertSearchParamPairs = (pairs) => {
    if (!arrayIsArray(pairs) || pairs.length > maxSearchParamPairs) {
      throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
    }
    let bytes = 0
    for (let index = 0; index < pairs.length; index += 1) {
      const pair = pairs[index]
      if (
        !arrayIsArray(pair) ||
        pair.length !== 2 ||
        typeof pair[0] !== 'string' ||
        typeof pair[1] !== 'string'
      ) {
        throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
      }
      bytes += bridge.utf8ByteLength(pair[0]) + bridge.utf8ByteLength(pair[1]) + 40
      if (bytes > snapshot.wireLimits.maxBytes) {
        throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
      }
    }
    return pairs
  }
  const decodeSearchParamPart = (value) => {
    try {
      let cursor = 0
      let withSpaces = ''
      while (cursor <= value.length) {
        const plus = reflectApply(stringIndexOf, value, ['+', cursor])
        if (plus < 0) {
          withSpaces += reflectApply(stringSlice, value, [cursor])
          break
        }
        withSpaces += reflectApply(stringSlice, value, [cursor, plus]) + ' '
        cursor = plus + 1
      }
      return reflectApply(decodeUriComponent, undefined, [withSpaces])
    } catch {
      throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
    }
  }
  const parseSearchParamString = (input) => {
    let normalized = stringConstructor(input)
    if (bridge.utf8ByteLength(normalized) > snapshot.wireLimits.maxBytes) {
      throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
    }
    if (normalized[0] === '?') normalized = reflectApply(stringSlice, normalized, [1])
    if (!normalized) return []
    const pairs = []
    let cursor = 0
    while (cursor <= normalized.length) {
      const delimiter = reflectApply(stringIndexOf, normalized, ['&', cursor])
      const end = delimiter < 0 ? normalized.length : delimiter
      const segment = reflectApply(stringSlice, normalized, [cursor, end])
      if (segment.length > 0) {
        if (pairs.length >= maxSearchParamPairs) {
          throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
        }
        const separator = reflectApply(stringIndexOf, segment, ['='])
        const rawKey = separator < 0 ? segment : reflectApply(stringSlice, segment, [0, separator])
        const rawValue = separator < 0 ? '' : reflectApply(stringSlice, segment, [separator + 1])
        reflectApply(arrayPush, pairs, [[
          decodeSearchParamPart(rawKey),
          decodeSearchParamPart(rawValue)
        ]])
      }
      if (delimiter < 0) break
      cursor = end + 1
    }
    return assertSearchParamPairs(pairs)
  }
  const encodeSearchParamPart = (value) => {
    let encoded = reflectApply(encodeUriComponent, undefined, [value])
    encoded = reflectApply(stringReplaceAll, encoded, ['%20', '+'])
    encoded = reflectApply(stringReplaceAll, encoded, ['!', '%21'])
    encoded = reflectApply(stringReplaceAll, encoded, ["'", '%27'])
    encoded = reflectApply(stringReplaceAll, encoded, ['(', '%28'])
    encoded = reflectApply(stringReplaceAll, encoded, [')', '%29'])
    return reflectApply(stringReplaceAll, encoded, ['~', '%7E'])
  }

  class TuffURLSearchParams {
    #pairs
    constructor(input = '', token) {
      if (token === searchParamsInternalToken) {
        const pairs = []
        if (!arrayIsArray(input) || input.length > maxSearchParamPairs) {
          throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
        }
        for (let index = 0; index < input.length; index += 1) {
          const pair = input[index]
          if (!arrayIsArray(pair) || pair.length !== 2) {
            throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
          }
          reflectApply(arrayPush, pairs, [[stringConstructor(pair[0]), stringConstructor(pair[1])]])
        }
        this.#pairs = assertSearchParamPairs(pairs)
        return
      }
      if (input === undefined || typeof input === 'string') {
        this.#pairs = parseSearchParamString(input === undefined ? '' : input)
        return
      }
      throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
    }
    append(name, value) {
      const pairs = []
      for (let index = 0; index < this.#pairs.length; index += 1) {
        const pair = this.#pairs[index]
        reflectApply(arrayPush, pairs, [[pair[0], pair[1]]])
      }
      reflectApply(arrayPush, pairs, [[stringConstructor(name), stringConstructor(value)]])
      this.#pairs = assertSearchParamPairs(pairs)
    }
    get(name) {
      const expected = stringConstructor(name)
      for (let index = 0; index < this.#pairs.length; index += 1) {
        const pair = this.#pairs[index]
        if (pair[0] === expected) return pair[1]
      }
      return null
    }
    getAll(name) {
      const expected = stringConstructor(name)
      const values = []
      for (let index = 0; index < this.#pairs.length; index += 1) {
        const pair = this.#pairs[index]
        if (pair[0] === expected) reflectApply(arrayPush, values, [pair[1]])
      }
      return values
    }
    has(name) {
      const expected = stringConstructor(name)
      for (let index = 0; index < this.#pairs.length; index += 1) {
        if (this.#pairs[index][0] === expected) return true
      }
      return false
    }
    toString() {
      const encoded = []
      let maximumEncodedBytes = 0
      for (let index = 0; index < this.#pairs.length; index += 1) {
        const pair = this.#pairs[index]
        maximumEncodedBytes +=
          (bridge.utf8ByteLength(pair[0]) + bridge.utf8ByteLength(pair[1])) * 3 +
          1 +
          (index === 0 ? 0 : 1)
        if (maximumEncodedBytes > snapshot.wireLimits.maxBytes) {
          throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
        }
        reflectApply(arrayPush, encoded, [
          encodeSearchParamPart(pair[0]) + '=' + encodeSearchParamPart(pair[1])
        ])
      }
      return reflectApply(arrayJoin, encoded, ['&'])
    }
    entries() {
      const entries = []
      for (let index = 0; index < this.#pairs.length; index += 1) {
        const pair = this.#pairs[index]
        reflectApply(arrayPush, entries, [[pair[0], pair[1]]])
      }
      return reflectApply(arrayIterator, entries, [])
    }
    [symbolIterator]() { return this.entries() }
  }
  class TuffURL {
    #data
    constructor(input, base) {
      const normalizedInput = stringConstructor(input)
      const normalizedBase = base === undefined ? undefined : stringConstructor(base)
      if (
        bridge.utf8ByteLength(normalizedInput) > snapshot.wireLimits.maxBytes ||
        (normalizedBase !== undefined &&
          bridge.utf8ByteLength(normalizedBase) > snapshot.wireLimits.maxBytes)
      ) {
        throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
      }
      const parsed = parseJson(bridge.parseUrl(normalizedInput, normalizedBase))
      if (!parsed.ok) throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
      this.#data = parsed.value
      this.searchParams = new TuffURLSearchParams(this.#data.searchParams, searchParamsInternalToken)
    }
    get href() { return this.#data.href }
    get origin() { return this.#data.origin }
    get protocol() { return this.#data.protocol }
    get username() { return this.#data.username }
    get password() { return this.#data.password }
    get host() { return this.#data.host }
    get hostname() { return this.#data.hostname }
    get port() { return this.#data.port }
    get pathname() { return this.#data.pathname }
    get search() { return this.#data.search }
    get hash() { return this.#data.hash }
    toString() { return this.href }
    toJSON() { return this.href }
  }
  class TuffTextEncoder {
    encode(value = '') {
      const normalized = stringConstructor(value)
      if (bridge.utf8ByteLength(normalized) > snapshot.wireLimits.maxBytes) {
        throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
      }
      return new uint8ArrayConstructor(bridge.encodeUtf8(normalized))
    }
  }
  class TuffTextDecoder {
    decode(value = new uint8ArrayConstructor()) {
      return bridge.decodeUtf8(copyByteView(value))
    }
  }
  objectFreeze(TuffURLSearchParams.prototype)
  objectFreeze(TuffURLSearchParams)
  objectFreeze(TuffURL.prototype)
  objectFreeze(TuffURL)
  objectFreeze(TuffTextEncoder.prototype)
  objectFreeze(TuffTextEncoder)
  objectFreeze(TuffTextDecoder.prototype)
  objectFreeze(TuffTextDecoder)

  const subtleCrypto = objectCreate(null)
  const digest = (algorithm, value) => {
    const normalized = reflectApply(stringToUpperCase, stringConstructor(algorithm), [])
    let bytes
    try {
      bytes = copyByteView(value)
    } catch {
      return rejectPromise(createCapabilityError('PLUGIN_HOST_CHILD_RESULT_INVALID'))
    }
    return thenPromise(resolvePromise(), () => {
      const output = bridge.digest(normalized, bytes)
      return new uint8ArrayConstructor(output).buffer
    })
  }
  objectFreeze(digest)
  objectDefineProperty(subtleCrypto, 'digest', { value: digest, enumerable: true })
  objectFreeze(subtleCrypto)
  const crypto = objectCreate(null)
  const getRandomValues = (value) => {
    const info = createByteView(value)
    if (!arrayBufferIsView(value) || info.byteLength > 65536) {
      throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
    }
    reflectApply(uint8ArraySet, info.view, [bridge.randomBytes(info.byteLength)])
    return value
  }
  objectFreeze(getRandomValues)
  const randomUuid = () => bridge.randomUUID()
  objectFreeze(randomUuid)
  objectDefineProperty(crypto, 'randomUUID', { value: randomUuid, enumerable: true })
  objectDefineProperty(crypto, 'getRandomValues', { value: getRandomValues, enumerable: true })
  objectDefineProperty(crypto, 'digest', { value: digest, enumerable: true })
  objectDefineProperty(crypto, 'subtle', { value: subtleCrypto, enumerable: true })
  objectFreeze(crypto)

  const createCapabilityError = (code) => {
    const error = new errorConstructor(code)
    objectDefineProperty(error, 'code', { value: code, enumerable: true })
    return error
  }
  const fixedCapabilities = new setConstructor(snapshot.fixedCapabilities)
  const declaredCapabilities = new mapConstructor(
    mapArray(snapshot.capabilityManifest, (entry) => [
      entry.id,
      objectFreeze({ callbackFields: new setConstructor(entry.callbackFields) })
    ])
  )
  const invokeCapability = (capability, payload) => {
    if (typeof capability !== 'string' || !hasSetValue(fixedCapabilities, capability)) {
      return rejectPromise(createCapabilityError('PLUGIN_HOST_UNKNOWN_CAPABILITY'))
    }
    const declaration = getMapValue(declaredCapabilities, capability)
    if (!declaration) {
      return rejectPromise(createCapabilityError('PLUGIN_HOST_CAPABILITY_NOT_DECLARED'))
    }
    let payloadJson
    const callbacks = []
    try {
      payloadJson = stringifyJson(
        encodeNode(
          payload,
          undefined,
          undefined,
          0,
          callbacks,
          declaration.callbackFields,
          false
        )
      )
    } catch {
      return rejectPromise(createCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_PAYLOAD_INVALID'))
    }
    const invoked = thenPromise(resolvePromise(), () =>
      bridge.invokeCapability(capability, payloadJson, callbacks)
    )
    return thenPromise(invoked, (outcomeJson) => {
        let outcome
        try { outcome = parseJson(outcomeJson) } catch {
          throw createCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_RESULT_INVALID')
        }
        if (!outcome || typeof outcome !== 'object' || typeof outcome.ok !== 'boolean') {
          throw createCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_RESULT_INVALID')
        }
        if (!outcome.ok) {
          const code = typeof outcome.code === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/.test(outcome.code)
            ? outcome.code
            : 'PLUGIN_HOST_CHILD_CAPABILITY_RESULT_INVALID'
          throw createCapabilityError(code)
        }
        try { return decodeNode(outcome.value) } catch {
          throw createCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_RESULT_INVALID')
        }
      })
  }
  objectFreeze(invokeCapability)
  const hostCapabilities = objectCreate(null)
  objectDefineProperty(hostCapabilities, 'invoke', {
    value: invokeCapability,
    enumerable: true
  })
  objectFreeze(hostCapabilities)

  const hasDeclaredCapability = (id) => Boolean(getMapValue(declaredCapabilities, id))
  const hasFeatureFacade =
    hasDeclaredCapability('feature.items.push') ||
    hasDeclaredCapability('feature.items.update') ||
    hasDeclaredCapability('feature.items.remove') ||
    hasDeclaredCapability('feature.items.clear') ||
    hasDeclaredCapability('feature.items.list')
  const hasStorageFacade =
    hasDeclaredCapability('storage.file.read') ||
    hasDeclaredCapability('storage.file.write') ||
    hasDeclaredCapability('storage.file.remove') ||
    hasDeclaredCapability('storage.file.list')
  const hasFeaturesFacade =
    hasDeclaredCapability('feature.registry.add') ||
    hasDeclaredCapability('feature.registry.remove') ||
    hasDeclaredCapability('feature.registry.list')
  const hasSecretFacade =
    hasDeclaredCapability('secret.get') ||
    hasDeclaredCapability('secret.set') ||
    hasDeclaredCapability('secret.delete')
  const hasClipboardFacade =
    hasDeclaredCapability('clipboard.read') ||
    hasDeclaredCapability('clipboard.write') ||
    hasDeclaredCapability('clipboard.copy-and-paste')
  const hasHttpFacade = hasDeclaredCapability('http.request')
  const hasFilesystemFacade = hasDeclaredCapability('filesystem.write')
  const hasPermissionFacade = hasDeclaredCapability('permission.check')
  const hasChannelFacade = hasDeclaredCapability('channel.invoke')
  const hasQuickOpsFacade = hasDeclaredCapability('quick-ops.invoke')
  const hasFlowFacade = hasDeclaredCapability('flow.invoke')
  const hasVoiceInvokeFacade = hasDeclaredCapability('voice.invoke')
  const hasVoiceStreamFacade = hasDeclaredCapability('voice.stream')
  const hasVoiceFacade = hasVoiceInvokeFacade || hasVoiceStreamFacade
  const fixedChannelOperations = new setConstructor(${JSON.stringify(PLUGIN_CHANNEL_OPERATION_IDS)})
  const fixedQuickOpsOperations = new setConstructor(${JSON.stringify(PLUGIN_QUICK_OPS_OPERATION_IDS)})
  const fixedFlowOperations = new setConstructor(${JSON.stringify(PLUGIN_FLOW_OPERATION_IDS)})
  const defineFacadeMethod = (target, name, callback) => {
    objectDefineProperty(target, name, {
      value: objectFreeze(callback),
      enumerable: true
    })
  }
  const cloneLocalDto = (value) => decodeNode(encodeNode(value))
  const mapCapabilityResult = (promise, select) => thenPromise(promise, select)

  const featureFacade = objectCreate(null)
  if (hasDeclaredCapability('feature.items.push')) {
    defineFacadeMethod(featureFacade, 'pushItems', (items) =>
      mapCapabilityResult(
        invokeCapability('feature.items.push', { scope: 'active-feature', items }),
        () => undefined
      )
    )
  }
  if (hasDeclaredCapability('feature.items.update')) {
    defineFacadeMethod(featureFacade, 'updateItem', (id, patch) =>
      mapCapabilityResult(
        invokeCapability('feature.items.update', {
          scope: 'active-feature',
          id: stringConstructor(id),
          patch
        }),
        (result) => result.updated === true
      )
    )
  }
  if (hasDeclaredCapability('feature.items.remove')) {
    defineFacadeMethod(featureFacade, 'removeItem', (id) =>
      mapCapabilityResult(
        invokeCapability('feature.items.remove', { id: stringConstructor(id) }),
        (result) => result.removed === true
      )
    )
  }
  if (hasDeclaredCapability('feature.items.clear')) {
    defineFacadeMethod(featureFacade, 'clearItems', () =>
      mapCapabilityResult(invokeCapability('feature.items.clear', null), () => undefined)
    )
  }
  if (hasDeclaredCapability('feature.items.list')) {
    defineFacadeMethod(featureFacade, 'getItems', () =>
      mapCapabilityResult(
        invokeCapability('feature.items.list', null),
        (result) => cloneLocalDto(result.items)
      )
    )
  }
  objectFreeze(featureFacade)

  const storageFacade = objectCreate(null)
  if (hasDeclaredCapability('storage.file.read')) {
    defineFacadeMethod(storageFacade, 'getFile', (name) =>
      mapCapabilityResult(
        invokeCapability('storage.file.read', { name: stringConstructor(name) }),
        (result) => result.found === true ? cloneLocalDto(result.value) : null
      )
    )
  }
  if (hasDeclaredCapability('storage.file.write')) {
    defineFacadeMethod(storageFacade, 'setFile', (name, value) =>
      mapCapabilityResult(
        invokeCapability('storage.file.write', { name: stringConstructor(name), value }),
        () => undefined
      )
    )
  }
  if (hasDeclaredCapability('storage.file.remove')) {
    defineFacadeMethod(storageFacade, 'deleteFile', (name) =>
      mapCapabilityResult(
        invokeCapability('storage.file.remove', { name: stringConstructor(name) }),
        (result) => result.removed === true
      )
    )
  }
  if (hasDeclaredCapability('storage.file.list')) {
    defineFacadeMethod(storageFacade, 'listFiles', () =>
      mapCapabilityResult(
        invokeCapability('storage.file.list', null),
        (result) => cloneLocalDto(result.names)
      )
    )
  }
  objectFreeze(storageFacade)

  const filesystemFacade = objectCreate(null)
  if (hasFilesystemFacade) {
    defineFacadeMethod(filesystemFacade, 'renameBatch', (entries) =>
      mapCapabilityResult(
        invokeCapability('filesystem.write', { operation: 'rename-batch', entries }),
        (result) => cloneLocalDto(result.entries)
      )
    )
  }
  objectFreeze(filesystemFacade)

  const voiceFacade = objectCreate(null)
  if (hasVoiceInvokeFacade) {
    defineFacadeMethod(voiceFacade, 'dictate', (payload = {}) =>
      mapCapabilityResult(
        invokeCapability('voice.invoke', { operation: 'dictate', payload }),
        (result) => {
          if (!result || result.operation !== 'dictate') {
            throw createCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_RESULT_INVALID')
          }
          return cloneLocalDto(result.data)
        }
      )
    )
    defineFacadeMethod(voiceFacade, 'speak', (payload) =>
      mapCapabilityResult(
        invokeCapability('voice.invoke', { operation: 'speak', payload }),
        (result) => {
          if (!result || result.operation !== 'speak') {
            throw createCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_RESULT_INVALID')
          }
          return cloneLocalDto(result.data)
        }
      )
    )
  }
  if (hasVoiceStreamFacade) {
    defineFacadeMethod(voiceFacade, 'asrStream', (payload = {}, options = {}) => {
      const onData = typeof options?.onData === 'function' ? options.onData : undefined
      const onError = typeof options?.onError === 'function' ? options.onError : undefined
      const onEnd = typeof options?.onEnd === 'function' ? options.onEnd : undefined
      let resource = null
      let terminal = false
      let cancelled = false
      let disposePromise = null
      const disposeCurrent = () => {
        if (disposePromise) return disposePromise
        if (!resource) return resolvePromise()
        disposePromise = thenPromise(resolvePromise(), () => resource.dispose())
        return disposePromise
      }
      const reportCallbackFailure = async () => {
        terminal = true
        if (onError) {
          try { await onError(createCapabilityError('VOICE_STREAM_CALLBACK_FAILED')) } catch {}
        }
        await disposeCurrent()
      }
      const onEvent = async (rawEvent) => {
        if (terminal || cancelled) return
        let event
        try {
          event = cloneLocalDto(rawEvent)
          if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
            throw createCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_RESULT_INVALID')
          }
          if (event.type === 'partial' || event.type === 'final') {
            if (typeof event.text !== 'string') {
              throw createCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_RESULT_INVALID')
            }
            if (event.language !== undefined && typeof event.language !== 'string') {
              throw createCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_RESULT_INVALID')
            }
            if (onData) await onData(event)
            return
          }
          if (event.type === 'end') {
            if (onData) await onData(event)
            terminal = true
            if (onEnd) await onEnd()
            await disposeCurrent()
            return
          }
          if (event.type === 'error' && event.code === 'VOICE_STREAM_FAILED') {
            terminal = true
            if (onError) await onError(createCapabilityError('VOICE_STREAM_FAILED'))
            await disposeCurrent()
            return
          }
          throw createCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_RESULT_INVALID')
        } catch {
          await reportCallbackFailure()
        }
      }
      objectFreeze(onEvent)
      return mapCapabilityResult(
        invokeCapability('voice.stream', { payload, onEvent }),
        (streamResource) => {
          if (
            !streamResource ||
            streamResource.kind !== 'stream' ||
            typeof streamResource.id !== 'string' ||
            typeof streamResource.dispose !== 'function'
          ) {
            throw createCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_RESULT_INVALID')
          }
          resource = streamResource
          const controller = objectCreate(null)
          objectDefineProperty(controller, 'id', { value: streamResource.id, enumerable: true })
          objectDefineProperty(controller, 'cancelled', {
            get: objectFreeze(() => cancelled),
            enumerable: true
          })
          const cancel = () => {
            cancelled = true
            terminal = true
            return disposeCurrent()
          }
          objectDefineProperty(controller, 'cancel', {
            value: objectFreeze(cancel),
            enumerable: true
          })
          if (terminal) void disposeCurrent()
          return objectFreeze(controller)
        }
      )
    })
  }
  objectFreeze(voiceFacade)

  const pluginFacade = objectCreate(null)
  defineFacadeMethod(pluginFacade, 'getLocale', () => snapshot.locale)
  if (hasFeatureFacade) {
    objectDefineProperty(pluginFacade, 'feature', { value: featureFacade, enumerable: true })
  }
  if (hasStorageFacade) {
    objectDefineProperty(pluginFacade, 'storage', { value: storageFacade, enumerable: true })
  }
  if (hasVoiceFacade) {
    objectDefineProperty(pluginFacade, 'voice', { value: voiceFacade, enumerable: true })
  }
  objectFreeze(pluginFacade)

  const featuresFacade = objectCreate(null)
  if (hasDeclaredCapability('feature.registry.add')) {
    defineFacadeMethod(featuresFacade, 'addFeature', (feature) =>
      mapCapabilityResult(
        invokeCapability('feature.registry.add', { feature }),
        (result) => result.added === true
      )
    )
  }
  if (hasDeclaredCapability('feature.registry.remove')) {
    defineFacadeMethod(featuresFacade, 'removeFeature', (featureId) =>
      mapCapabilityResult(
        invokeCapability('feature.registry.remove', { featureId: stringConstructor(featureId) }),
        (result) => result.removed === true
      )
    )
  }
  if (hasDeclaredCapability('feature.registry.list')) {
    defineFacadeMethod(featuresFacade, 'getFeature', (featureId) =>
      mapCapabilityResult(invokeCapability('feature.registry.list', null), (result) => {
        const expectedId = stringConstructor(featureId)
        for (const feature of result.features) {
          if (feature.id === expectedId) return cloneLocalDto(feature)
        }
        return undefined
      })
    )
    defineFacadeMethod(featuresFacade, 'getFeatures', () =>
      mapCapabilityResult(
        invokeCapability('feature.registry.list', null),
        (result) => cloneLocalDto(result.features)
      )
    )
  }
  objectFreeze(featuresFacade)

  const secretFacade = objectCreate(null)
  if (hasDeclaredCapability('secret.get')) {
    defineFacadeMethod(secretFacade, 'get', (key) =>
      mapCapabilityResult(
        invokeCapability('secret.get', { key: stringConstructor(key) }),
        (result) => result.found === true ? result.value : null
      )
    )
  }
  if (hasDeclaredCapability('secret.set')) {
    defineFacadeMethod(secretFacade, 'set', (key, value) =>
      mapCapabilityResult(
        invokeCapability('secret.set', {
          key: stringConstructor(key),
          value: stringConstructor(value)
        }),
        () => undefined
      )
    )
  }
  if (hasDeclaredCapability('secret.delete')) {
    defineFacadeMethod(secretFacade, 'delete', (key) =>
      mapCapabilityResult(
        invokeCapability('secret.delete', { key: stringConstructor(key) }),
        () => undefined
      )
    )
  }
  objectFreeze(secretFacade)

  const clipboardFacade = objectCreate(null)
  if (hasDeclaredCapability('clipboard.read')) {
    defineFacadeMethod(clipboardFacade, 'readText', () =>
      mapCapabilityResult(
        invokeCapability('clipboard.read', { op: 'text' }),
        (result) => result.text
      )
    )
    defineFacadeMethod(clipboardFacade, 'read', () =>
      invokeCapability('clipboard.read', { op: 'snapshot' })
    )
  }
  if (hasDeclaredCapability('clipboard.write')) {
    defineFacadeMethod(clipboardFacade, 'writeText', (text) =>
      mapCapabilityResult(
        invokeCapability('clipboard.write', {
          op: 'write',
          content: { text: stringConstructor(text) }
        }),
        () => undefined
      )
    )
    defineFacadeMethod(clipboardFacade, 'clear', () =>
      mapCapabilityResult(invokeCapability('clipboard.write', { op: 'clear' }), () => undefined)
    )
  }
  if (hasDeclaredCapability('clipboard.copy-and-paste')) {
    defineFacadeMethod(clipboardFacade, 'copyAndPaste', (options) =>
      mapCapabilityResult(
        invokeCapability('clipboard.copy-and-paste', options),
        (result) => result.success === true
      )
    )
  }
  objectFreeze(clipboardFacade)

  const openUrlFacade = hasDeclaredCapability('open-url')
    ? objectFreeze((url) =>
        mapCapabilityResult(
          invokeCapability('open-url', { url: stringConstructor(url) }),
          () => undefined
        )
      )
    : undefined

  const normalizeHttpRequest = (input, forcedMethod, forcedUrl, forcedBody, hasForcedBody) => {
    const source = cloneLocalDto(input === undefined ? {} : input)
    if (!source || typeof source !== 'object' || arrayIsArray(source)) {
      throw new typeErrorConstructor('PLUGIN_HOST_CHILD_CAPABILITY_PAYLOAD_INVALID')
    }
    const request = objectCreate(null)
    const method = forcedMethod === undefined ? source.method : forcedMethod
    request.method = reflectApply(
      stringToUpperCase,
      stringConstructor(method === undefined ? 'GET' : method),
      []
    )
    request.url = stringConstructor(forcedUrl === undefined ? source.url : forcedUrl)
    const responseType = source.responseType === 'arraybuffer' ? 'bytes' : source.responseType
    request.responseType = responseType === undefined ? 'json' : stringConstructor(responseType)
    if (source.headers !== undefined) request.headers = source.headers
    if (source.query !== undefined) request.query = source.query
    else if (source.params !== undefined) request.query = source.params
    if (hasForcedBody) request.body = cloneLocalDto(forcedBody)
    else if (objectHasOwn(source, 'body')) request.body = source.body
    else if (objectHasOwn(source, 'data')) request.body = source.data
    const timeoutMs = source.timeoutMs === undefined ? source.timeout : source.timeoutMs
    if (timeoutMs !== undefined) request.timeoutMs = timeoutMs
    return request
  }
  const httpFacade = objectCreate(null)
  if (hasHttpFacade) {
    defineFacadeMethod(httpFacade, 'request', (config) =>
      invokeCapability('http.request', normalizeHttpRequest(config))
    )
    defineFacadeMethod(httpFacade, 'get', (url, config) =>
      invokeCapability('http.request', normalizeHttpRequest(config, 'GET', url))
    )
    defineFacadeMethod(httpFacade, 'post', (url, body, config) =>
      invokeCapability('http.request', normalizeHttpRequest(config, 'POST', url, body, true))
    )
  }
  objectFreeze(httpFacade)

  const permissionFacade = objectCreate(null)
  if (hasPermissionFacade) {
    defineFacadeMethod(permissionFacade, 'check', (permissionId) =>
      mapCapabilityResult(
        invokeCapability('permission.check', { permissionId: stringConstructor(permissionId) }),
        (result) => result.granted === true
      )
    )
  }
  objectFreeze(permissionFacade)

  const invokeOperation = (capability, operations, operation, payload) => {
    if (typeof operation !== 'string' || !hasSetValue(operations, operation)) {
      return rejectPromise(createCapabilityError('PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED'))
    }
    return mapCapabilityResult(
      invokeCapability(capability, { operation, payload }),
      (result) => cloneLocalDto(result.data)
    )
  }
  objectFreeze(invokeOperation)

  const touchChannelFacade = objectCreate(null)
  if (hasChannelFacade) {
    defineFacadeMethod(touchChannelFacade, 'send', (operation, payload = null) =>
      invokeOperation('channel.invoke', fixedChannelOperations, operation, payload)
    )
  }
  objectFreeze(touchChannelFacade)

  const quickOpsFacade = objectCreate(null)
  const defineQuickOpsMethod = (name, operation, payloadFactory) => {
    if (!hasQuickOpsFacade || !hasSetValue(fixedQuickOpsOperations, operation)) return
    defineFacadeMethod(quickOpsFacade, name, (...args) =>
      invokeOperation(
        'quick-ops.invoke',
        fixedQuickOpsOperations,
        operation,
        payloadFactory(...args)
      )
    )
  }
  defineQuickOpsMethod('capabilities', 'capabilities.get', () => null)
  defineQuickOpsMethod('sessions', 'sessions.get', () => null)
  defineQuickOpsMethod('auditRecent', 'audit.get', (request) => request === undefined ? {} : request)
  defineQuickOpsMethod('systemInfo', 'system-info.get', () => null)
  defineQuickOpsMethod('tuffDiagnostics', 'tuff-diagnostics.get', () => null)
  defineQuickOpsMethod('diskSpace', 'disk-space.get', () => null)
  defineQuickOpsMethod('directoryUsage', 'directory-usage.get', (request) => request === undefined ? {} : request)
  defineQuickOpsMethod('queryLocalIp', 'query-local-ip.get', () => null)
  defineQuickOpsMethod('portStatus', 'port-status.get', (request) => request)
  defineQuickOpsMethod('dnsQuery', 'dns-query.get', (request) => request)
  defineQuickOpsMethod('fileHash', 'file-hash.get', (request) => request)
  defineQuickOpsMethod('fileBase64', 'file-base64.get', (request) => request)
  defineQuickOpsMethod('recentDownload', 'recent-download.get', () => null)
  defineQuickOpsMethod('commonDirectory', 'common-directory.get', (request) => request === undefined ? {} : request)
  defineQuickOpsMethod('pathFormat', 'path-format.get', (request) => request)
  defineQuickOpsMethod('formatText', 'format-text.get', (request) => request)
  defineQuickOpsMethod('networkStatus', 'network-status.get', () => null)
  defineQuickOpsMethod('batteryStatus', 'battery-status.get', () => null)
  defineQuickOpsMethod('systemProxy', 'system-proxy.get', () => null)
  defineQuickOpsMethod('developerPreview', 'developer-preview.get', (request) => request)
  defineQuickOpsMethod('saveDeveloperPreview', 'developer-preview.save', (request) => request)
  objectFreeze(defineQuickOpsMethod)
  objectFreeze(quickOpsFacade)

  const flowFacade = objectCreate(null)
  if (hasFlowFacade) {
    defineFacadeMethod(flowFacade, 'dispatch', (payload, options) =>
      invokeOperation(
        'flow.invoke',
        fixedFlowOperations,
        'quickops.dispatch',
        { payload, options }
      )
    )
  }
  objectFreeze(flowFacade)

  const loggerFacade = objectCreate(null)
  const localLog = (...values) => {
    for (const value of values) {
      if (typeof value !== 'string') {
        throw new typeErrorConstructor('PLUGIN_HOST_CHILD_LOG_INVALID')
      }
      if (bridge.utf8ByteLength(value) > 4096) {
        throw new typeErrorConstructor('PLUGIN_HOST_CHILD_LOG_INVALID')
      }
    }
  }
  for (const level of ['debug', 'info', 'warn', 'error']) {
    defineFacadeMethod(loggerFacade, level, localLog)
  }
  objectFreeze(loggerFacade)

  class ChildTuffItemBuilder {
    #item
    #basic
    constructor(id) {
      this.#item = objectCreate(null)
      this.#basic = objectCreate(null)
      this.#item.id = stringConstructor(id)
    }
    setSource(type, id, name) {
      const source = objectCreate(null)
      source.type = stringConstructor(type)
      source.id = stringConstructor(id)
      if (name !== undefined && name !== '') source.name = stringConstructor(name)
      this.#item.source = source
      return this
    }
    setTitle(title) {
      this.#basic.title = stringConstructor(title)
      return this
    }
    setSubtitle(subtitle) {
      this.#basic.subtitle = stringConstructor(subtitle)
      return this
    }
    setIcon(icon) {
      this.#basic.icon = cloneLocalDto(icon)
      return this
    }
    setMeta(meta) {
      const next = cloneLocalDto(meta)
      if (!next || typeof next !== 'object' || arrayIsArray(next)) {
        throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
      }
      const merged = objectCreate(null)
      const current = this.#item.meta
      if (current) {
        for (const key of objectKeys(current)) merged[key] = current[key]
      }
      for (const key of objectKeys(next)) merged[key] = next[key]
      this.#item.meta = merged
      return this
    }
    createAndAddAction(id, type, label, payload) {
      const action = objectCreate(null)
      action.id = stringConstructor(id)
      action.type = stringConstructor(type)
      action.label = stringConstructor(label)
      action.primary = !this.#item.actions || this.#item.actions.length === 0
      if (payload !== undefined) action.payload = cloneLocalDto(payload)
      if (!this.#item.actions) this.#item.actions = []
      reflectApply(arrayPush, this.#item.actions, [action])
      return this
    }
    build() {
      if (!this.#item.id || !this.#item.source || !this.#basic.title) {
        throw new typeErrorConstructor('PLUGIN_HOST_CHILD_ITEM_INVALID')
      }
      const item = cloneLocalDto(this.#item)
      item.render = objectCreate(null)
      item.render.mode = 'default'
      item.render.basic = cloneLocalDto(this.#basic)
      return deepFreeze(item)
    }
  }
  objectFreeze(ChildTuffItemBuilder.prototype)
  objectFreeze(ChildTuffItemBuilder)

  objectDefineProperties(globalThis, {
    setTimeout: {
      value: (callback, delay = 0, ...args) =>
        typeof callback === 'function'
          ? bridge.setTimeout(createTimerTask(callback, args), Number(delay))
          : 0
    },
    clearTimeout: { value: (id) => bridge.clearTimer(Number(id)) },
    setInterval: {
      value: (callback, delay = 0, ...args) =>
        typeof callback === 'function'
          ? bridge.setInterval(createTimerTask(callback, args), Number(delay))
          : 0
    },
    clearInterval: { value: (id) => bridge.clearTimer(Number(id)) },
    setImmediate: {
      value: (callback, ...args) =>
        typeof callback === 'function' ? bridge.setImmediate(createTimerTask(callback, args)) : 0
    },
    clearImmediate: { value: (id) => bridge.clearTimer(Number(id)) },
    queueMicrotask: { value: scheduleMicrotask },
    URL: { value: TuffURL },
    URLSearchParams: { value: TuffURLSearchParams },
    TextEncoder: { value: TuffTextEncoder },
    TextDecoder: { value: TuffTextDecoder },
    AbortController: { value: TuffAbortController },
    AbortSignal: { value: TuffAbortSignal },
    crypto: { value: crypto },
    platform: { value: deepFreeze({ platform: snapshot.platform, arch: snapshot.arch }) },
    manifest: { value: deepFreeze(snapshot.manifest) },
    hostCapabilities: { value: hostCapabilities },
    plugin: { value: pluginFacade, configurable: true },
    features: { value: hasFeaturesFacade ? featuresFacade : undefined, configurable: true },
    secret: { value: hasSecretFacade ? secretFacade : undefined, configurable: true },
    clipboard: { value: hasClipboardFacade ? clipboardFacade : undefined, configurable: true },
    openUrl: { value: openUrlFacade, configurable: true },
    http: { value: hasHttpFacade ? httpFacade : undefined, configurable: true },
    filesystem: {
      value: hasFilesystemFacade ? filesystemFacade : undefined,
      configurable: true
    },
    touchChannel: {
      value: hasChannelFacade ? touchChannelFacade : undefined,
      configurable: true
    },
    quickOps: { value: hasQuickOpsFacade ? quickOpsFacade : undefined, configurable: true },
    flow: { value: hasFlowFacade ? flowFacade : undefined, configurable: true },
    permission: {
      value: hasPermissionFacade ? permissionFacade : undefined,
      configurable: true
    },
    logger: { value: loggerFacade, configurable: true },
    TuffItemBuilder: {
      value: hasDeclaredCapability('feature.items.push') ? ChildTuffItemBuilder : undefined,
      configurable: true
    },
    module: { value: { exports: {} }, writable: false },
    exports: { value: undefined, writable: true },
    __tuffCreateAbortController: { value: () => new TuffAbortController(), configurable: true },
    __tuffDecodeContextValue: { value: (json) => decodeNode(parseJson(json)), configurable: true },
    __tuffEncodeContextValue: { value: (value) => stringifyJson(encodeNode(value)), configurable: true },
    __tuffInvokeLifecycle: {
      value: (fn, args, signal) => thenPromise(
        resolvePromise(),
        () => reflectApply(fn, undefined, [...args, signal])
      ),
      configurable: true
    },
    __tuffInvokeCallback: {
      value: (fn, args) => thenPromise(
        resolvePromise(),
        () => reflectApply(fn, undefined, args)
      ),
      configurable: true
    }
  })
  globalThis.exports = globalThis.module.exports
})()
`

function createContextBridge(
  timers: TimerRegistry,
  options: LoadPluginPreludeOptions,
  limits: HostWireLimits,
  maxCallbacks: number,
  wrapContextCallback: (callback: Callback) => Callback,
  currentCapabilityScope: () => number | undefined
): ContextBridge {
  const stableCapabilityCode = (error: unknown): string => {
    if (!error || typeof error !== 'object') return 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code')
    return descriptor &&
      'value' in descriptor &&
      typeof descriptor.value === 'string' &&
      /^[A-Z][A-Z0-9_]{0,127}$/.test(descriptor.value)
      ? descriptor.value
      : 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'
  }

  return Object.freeze({
    setTimeout: (callback, delay) => timers.setTimeout(callback, delay),
    setInterval: (callback, delay) => timers.setInterval(callback, delay),
    setImmediate: (callback) => timers.setImmediate(callback),
    clearTimer: (id) => timers.clear(id),
    reportUnhandledError: () => options.onUnhandledError?.(),
    utf8ByteLength: (value) => Buffer.byteLength(value, 'utf8'),
    encodeUtf8: (value) => Array.from(Buffer.from(value, 'utf8')),
    decodeUtf8: (value) => Buffer.from(value).toString('utf8'),
    parseUrl: (input, base) => {
      try {
        if (
          Buffer.byteLength(input, 'utf8') > limits.maxBytes ||
          (base !== undefined && Buffer.byteLength(base, 'utf8') > limits.maxBytes)
        ) {
          return '{"ok":false}'
        }
        const parsed = new URL(input, base)
        const searchParams: string[][] = []
        let searchParamBytes = 0
        let searchParamMembers = 0
        for (const [key, value] of parsed.searchParams) {
          searchParamMembers += 3
          searchParamBytes += Buffer.byteLength(key, 'utf8') + Buffer.byteLength(value, 'utf8') + 40
          if (searchParamMembers > limits.maxMembers || searchParamBytes > limits.maxBytes) {
            return '{"ok":false}'
          }
          searchParams.push([key, value])
        }
        const serialized = JSON.stringify({
          ok: true,
          value: {
            href: parsed.href,
            origin: parsed.origin,
            protocol: parsed.protocol,
            username: parsed.username,
            password: parsed.password,
            host: parsed.host,
            hostname: parsed.hostname,
            port: parsed.port,
            pathname: parsed.pathname,
            search: parsed.search,
            hash: parsed.hash,
            searchParams
          }
        })
        return Buffer.byteLength(serialized, 'utf8') <= limits.maxBytes * MAX_CONTEXT_JSON_EXPANSION
          ? serialized
          : '{"ok":false}'
      } catch {
        return '{"ok":false}'
      }
    },
    randomBytes: (length) => Array.from(randomBytes(length)),
    randomUUID,
    digest: (algorithm, value) => {
      const resolved = CHILD_DIGEST_ALGORITHMS.get(algorithm)
      if (
        !resolved ||
        !Array.isArray(value) ||
        utilTypes.isProxy(value) ||
        value.length > limits.maxBytes
      ) {
        throw new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID')
      }
      const descriptors = Object.getOwnPropertyDescriptors(value)
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
      if (
        !lengthDescriptor ||
        !('value' in lengthDescriptor) ||
        lengthDescriptor.value !== value.length
      ) {
        throw new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID')
      }
      const bytes = new Uint8Array(value.length)
      const allowedKeys = new Set<PropertyKey>(['length'])
      for (let index = 0; index < value.length; index += 1) {
        const key = String(index)
        allowedKeys.add(key)
        const descriptor = descriptors[key]
        const entry = descriptor && 'value' in descriptor ? descriptor.value : undefined
        if (
          !descriptor?.enumerable ||
          !Number.isInteger(entry) ||
          Number(entry) < 0 ||
          Number(entry) > 255
        ) {
          throw new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID')
        }
        bytes[index] = Number(entry)
      }
      if (Reflect.ownKeys(descriptors).some((key) => !allowedKeys.has(key))) {
        throw new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID')
      }
      return Array.from(createHash(resolved).update(bytes).digest())
    },
    disposeResource: async (id, kind) => {
      if (typeof id !== 'string' || typeof kind !== 'string' || !options.disposeResource) {
        throw new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID')
      }
      await options.disposeResource(id, kind as HostWireResourceDescriptor['kind'])
    },
    invokeCapability: async (capability, payloadJson, callbacks) => {
      if (!options.invokeCapability) {
        return JSON.stringify({
          ok: false,
          code: 'PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE'
        })
      }
      let payload: unknown
      try {
        if (
          typeof payloadJson !== 'string' ||
          payloadJson.length > limits.maxBytes * MAX_CONTEXT_JSON_EXPANSION ||
          !Array.isArray(callbacks) ||
          utilTypes.isProxy(callbacks) ||
          callbacks.length > maxCallbacks
        ) {
          throw new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID')
        }
        const callbackDescriptors = Object.getOwnPropertyDescriptors(callbacks)
        const lengthDescriptor = callbackDescriptors['length'] as PropertyDescriptor | undefined
        if (
          !lengthDescriptor ||
          !('value' in lengthDescriptor) ||
          lengthDescriptor.value !== callbacks.length
        ) {
          throw new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID')
        }
        const allowedCallbackKeys = new Set<PropertyKey>(['length'])
        for (let index = 0; index < callbacks.length; index += 1) {
          allowedCallbackKeys.add(String(index))
        }
        if (Reflect.ownKeys(callbackDescriptors).some((key) => !allowedCallbackKeys.has(key))) {
          throw new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID')
        }
        const wrappedCallbacks: Callback[] = []
        for (let index = 0; index < callbacks.length; index += 1) {
          const descriptor = callbackDescriptors[String(index)]
          const callback = descriptor && 'value' in descriptor ? descriptor.value : undefined
          if (
            !descriptor?.enumerable ||
            typeof callback !== 'function' ||
            utilTypes.isProxy(callback) ||
            /^class\s/.test(Function.prototype.toString.call(callback))
          ) {
            throw new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID')
          }
          wrappedCallbacks.push(wrapContextCallback(callback))
        }
        const usedCallbacks = new Set<number>()
        payload = contextNodeToValue(JSON.parse(payloadJson), limits, undefined, 0, {
          resolveCallback(index) {
            if (index >= wrappedCallbacks.length || usedCallbacks.has(index)) {
              throw new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID')
            }
            usedCallbacks.add(index)
            return wrappedCallbacks[index]
          }
        })
        if (usedCallbacks.size !== wrappedCallbacks.length) {
          throw new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID')
        }
      } catch {
        return JSON.stringify({
          ok: false,
          code: 'PLUGIN_HOST_CHILD_CAPABILITY_PAYLOAD_INVALID'
        })
      }
      try {
        const result = await options.invokeCapability(
          capability as PluginHostCapability,
          payload,
          currentCapabilityScope()
        )
        try {
          return JSON.stringify({
            ok: true,
            value: valueToContextNode(
              result,
              limits,
              undefined,
              undefined,
              0,
              options.inspectResource
            )
          })
        } catch {
          return JSON.stringify({
            ok: false,
            code: 'PLUGIN_HOST_CHILD_CAPABILITY_RESULT_INVALID'
          })
        }
      } catch (error) {
        return JSON.stringify({ ok: false, code: stableCapabilityCode(error) })
      }
    }
  })
}

function stableChildError(
  error: unknown,
  fallback: PluginHostChildErrorCode
): PluginHostChildError {
  return error instanceof PluginHostChildError ? error : new PluginHostChildError(fallback)
}

export function loadPluginPrelude(
  value: unknown,
  options: LoadPluginPreludeOptions = {}
): PluginPreludeRuntime {
  const limits = contextLimits(options.limits)
  const payload = parsePluginHostLoadPayload(value, limits)
  const timers = new TimerRegistry(() => options.onUnhandledError?.())
  const lifecycleScopes = new AsyncLocalStorage<number>()
  const activeCapabilityScopes = new Set<number>()
  let nextLifecycleScopeId = 0
  let createAbortController!: () => ContextAbortController
  let decodeContextValue!: (json: string) => unknown
  let encodeContextValue!: (value: unknown) => string
  let invokeLifecycleInContext!: (
    fn: (...args: unknown[]) => unknown,
    args: unknown[],
    signal: ContextAbortSignal
  ) => unknown
  let invokeCallbackInContext!: (fn: Callback, args: unknown[]) => unknown
  const wrapContextCallback =
    (callback: Callback): Callback =>
    async (...args: unknown[]): Promise<unknown> => {
      const transport = valueToContextNode(args, limits)
      const contextArgs = decodeContextValue(JSON.stringify(transport)) as unknown[]
      const result = await invokeCallbackInContext(callback, contextArgs)
      return contextNodeToValue(JSON.parse(encodeContextValue(result)), limits)
    }
  const sandbox = Object.create(null) as Record<string, unknown>
  Object.defineProperties(sandbox, {
    __tuffHostBridge: {
      value: createContextBridge(
        timers,
        options,
        limits,
        payload.callbackLimits.maxCallbacks,
        wrapContextCallback,
        () => {
          const scopeId = lifecycleScopes.getStore()
          if (scopeId === undefined) return undefined
          if (!activeCapabilityScopes.has(scopeId)) {
            throw new PluginHostChildError('PLUGIN_HOST_CHILD_CANCELLED')
          }
          return scopeId
        }
      ),
      configurable: true
    },
    __tuffSnapshotJson: {
      value: JSON.stringify({
        platform: payload.snapshot.platform,
        arch: payload.snapshot.arch,
        locale: payload.snapshot.locale,
        manifest: payload.snapshot.manifest,
        capabilityManifest: payload.capabilityManifest,
        fixedCapabilities: PLUGIN_HOST_CAPABILITIES,
        wireLimits: limits,
        callbackLimits: payload.callbackLimits
      }),
      configurable: true
    }
  })
  const context = vm.createContext(sandbox, {
    name: 'tuff-plugin-prelude',
    codeGeneration: { strings: false, wasm: false }
  })

  let objectPrototype: object
  try {
    vm.runInContext(CONTEXT_BOOTSTRAP, context, { filename: 'plugin-host-bootstrap.js' })
    createAbortController = vm.runInContext('globalThis.__tuffCreateAbortController', context)
    decodeContextValue = vm.runInContext('globalThis.__tuffDecodeContextValue', context)
    encodeContextValue = vm.runInContext('globalThis.__tuffEncodeContextValue', context)
    invokeLifecycleInContext = vm.runInContext('globalThis.__tuffInvokeLifecycle', context)
    invokeCallbackInContext = vm.runInContext('globalThis.__tuffInvokeCallback', context)
    objectPrototype = vm.runInContext('Object.prototype', context)
    vm.runInContext(
      'delete globalThis.__tuffCreateAbortController; delete globalThis.__tuffDecodeContextValue; delete globalThis.__tuffEncodeContextValue; delete globalThis.__tuffInvokeLifecycle; delete globalThis.__tuffInvokeCallback',
      context
    )
    vm.runInContext(payload.scriptContent, context, { filename: 'plugin-prelude.js' })
  } catch {
    timers.close()
    throw new PluginHostChildError('PLUGIN_HOST_CHILD_SCRIPT_FAILED')
  }

  const exported = vm.runInContext('globalThis.module.exports', context) as unknown
  if (!exported || typeof exported !== 'object' || Array.isArray(exported)) {
    timers.close()
    throw new PluginHostChildError('PLUGIN_HOST_CHILD_EXPORT_INVALID')
  }
  const prototype = Object.getPrototypeOf(exported)
  if (prototype !== objectPrototype && prototype !== null) {
    timers.close()
    throw new PluginHostChildError('PLUGIN_HOST_CHILD_EXPORT_INVALID')
  }

  const lifecycle = new Map<PluginHostLifecycleMethod, (...args: unknown[]) => unknown>()
  for (const key of Reflect.ownKeys(exported)) {
    if (typeof key !== 'string' || !LIFECYCLE_METHODS.has(key)) {
      timers.close()
      throw new PluginHostChildError('PLUGIN_HOST_CHILD_EXPORT_INVALID')
    }
    const descriptor = Object.getOwnPropertyDescriptor(exported, key)
    if (
      !descriptor?.enumerable ||
      !('value' in descriptor) ||
      typeof descriptor.value !== 'function'
    ) {
      timers.close()
      throw new PluginHostChildError('PLUGIN_HOST_CHILD_EXPORT_INVALID')
    }
    lifecycle.set(key as PluginHostLifecycleMethod, descriptor.value)
  }

  let closed = false
  const activeCalls = new Set<{ cancel(): void }>()
  const methods = Object.freeze(
    PLUGIN_HOST_LIFECYCLE_METHODS.filter((method) => lifecycle.has(method))
  )

  const runtime: PluginPreludeRuntime = {
    methods,
    callLifecycle(method, input) {
      if (closed) {
        return {
          promise: Promise.reject(new PluginHostChildError('PLUGIN_HOST_CHILD_CLOSED')),
          completion: Promise.resolve(),
          cancel() {}
        }
      }
      if (!Array.isArray(input)) {
        return {
          promise: Promise.reject(
            new PluginHostChildError('PLUGIN_HOST_CHILD_LIFECYCLE_PAYLOAD_INVALID')
          ),
          completion: Promise.resolve(),
          cancel() {}
        }
      }

      let contextArgs: unknown[]
      try {
        const transport = valueToContextNode(input, limits)
        contextArgs = decodeContextValue(JSON.stringify(transport)) as unknown[]
      } catch (error) {
        return {
          promise: Promise.reject(
            stableChildError(error, 'PLUGIN_HOST_CHILD_LIFECYCLE_PAYLOAD_INVALID')
          ),
          completion: Promise.resolve(),
          cancel() {}
        }
      }

      const scopeId = ++nextLifecycleScopeId
      activeCapabilityScopes.add(scopeId)
      const controller = createAbortController()
      let cancelled = false
      let rejectCancellation!: (error: PluginHostChildError) => void
      const cancellation = new Promise<never>((_resolve, reject) => {
        rejectCancellation = reject
      })
      const handle = {
        cancel(): void {
          if (cancelled) return
          cancelled = true
          try {
            options.cancelCapabilityScope?.(scopeId)
          } catch {
            options.onUnhandledError?.()
          }
          controller.abort('PLUGIN_HOST_CHILD_CANCELLED')
          rejectCancellation(new PluginHostChildError('PLUGIN_HOST_CHILD_CANCELLED'))
        }
      }
      activeCalls.add(handle)

      const invoke = Promise.resolve()
        .then(() => {
          if (cancelled || closed) {
            throw new PluginHostChildError('PLUGIN_HOST_CHILD_CANCELLED')
          }
          const fn = lifecycle.get(method)
          return lifecycleScopes.run(scopeId, () =>
            fn ? invokeLifecycleInContext(fn, contextArgs, controller.signal) : undefined
          )
        })
        .then((result) => {
          if (cancelled || closed) throw new PluginHostChildError('PLUGIN_HOST_CHILD_CANCELLED')
          try {
            return contextNodeToValue(JSON.parse(encodeContextValue(result)), limits)
          } catch (error) {
            throw stableChildError(error, 'PLUGIN_HOST_CHILD_RESULT_INVALID')
          }
        })
        .catch((error) => {
          throw stableChildError(error, 'PLUGIN_HOST_CHILD_LIFECYCLE_FAILED')
        })

      const completion = invoke
        .then(
          () => undefined,
          () => undefined
        )
        .finally(() => {
          activeCapabilityScopes.delete(scopeId)
          try {
            options.releaseCapabilityScope?.(scopeId)
          } catch {
            options.onUnhandledError?.()
          }
        })
      const promise = Promise.race([invoke, cancellation]).finally(() => {
        activeCalls.delete(handle)
      })
      return { promise, completion, cancel: () => handle.cancel() }
    },
    callCallback(callback) {
      if (closed || typeof callback !== 'function') {
        return {
          promise: Promise.reject(new PluginHostChildError('PLUGIN_HOST_CHILD_CLOSED')),
          completion: Promise.resolve(),
          cancel() {}
        }
      }
      const scopeId = ++nextLifecycleScopeId
      activeCapabilityScopes.add(scopeId)
      let cancelled = false
      let rejectCancellation!: (error: PluginHostChildError) => void
      const cancellation = new Promise<never>((_resolve, reject) => {
        rejectCancellation = reject
      })
      const handle = {
        cancel(): void {
          if (cancelled) return
          cancelled = true
          try {
            options.cancelCapabilityScope?.(scopeId)
          } catch {
            options.onUnhandledError?.()
          }
          rejectCancellation(new PluginHostChildError('PLUGIN_HOST_CHILD_CANCELLED'))
        }
      }
      activeCalls.add(handle)
      const invoke = Promise.resolve().then(() => {
        if (cancelled || closed) {
          throw new PluginHostChildError('PLUGIN_HOST_CHILD_CANCELLED')
        }
        return lifecycleScopes.run(scopeId, callback)
      })
      const completion = invoke
        .then(
          () => undefined,
          () => undefined
        )
        .finally(() => {
          activeCapabilityScopes.delete(scopeId)
          try {
            options.releaseCapabilityScope?.(scopeId)
          } catch {
            options.onUnhandledError?.()
          }
        })
      const promise = Promise.race([invoke, cancellation]).finally(() => {
        activeCalls.delete(handle)
      })
      return { promise, completion, cancel: () => handle.cancel() }
    },
    shutdown() {
      if (closed) return
      closed = true
      try {
        options.cancelCapabilities?.()
      } catch {
        options.onUnhandledError?.()
      }
      for (const call of [...activeCalls]) call.cancel()
      activeCalls.clear()
      activeCapabilityScopes.clear()
      timers.close()
    }
  }
  return Object.freeze(runtime)
}
