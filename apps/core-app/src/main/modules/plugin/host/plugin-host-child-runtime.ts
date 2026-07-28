import { AsyncLocalStorage } from 'node:async_hooks'
import { randomBytes, randomUUID } from 'node:crypto'
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
const MAX_CONTEXT_JSON_EXPANSION = 8

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

  const snapshot = exactRecord(normalized.snapshot, ['platform', 'arch', 'manifest'])
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
  const objectCreate = Object.create
  const objectPrototype = Object.prototype
  const arrayConstructor = Array
  const arrayIsArray = Array.isArray
  const arrayFrom = Array.from
  const arrayMap = Array.prototype.map
  const arrayPush = Array.prototype.push
  const arrayBufferConstructor = ArrayBuffer
  const arrayBufferIsView = ArrayBuffer.isView
  const uint8ArrayConstructor = Uint8Array
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
  const stringConstructor = String
  const stringSlice = String.prototype.slice
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
        budget.addBytes(value.byteLength + 32)
        const bytes = new uint8ArrayConstructor(value.buffer, value.byteOffset, value.byteLength)
        return { type: 'bytes', value: reflectApply(arrayFrom, arrayConstructor, [bytes]) }
      }
      if (value instanceof arrayBufferConstructor) {
        budget.addBytes(value.byteLength + 32)
        return { type: 'bytes', value: reflectApply(arrayFrom, arrayConstructor, [new uint8ArrayConstructor(value)]) }
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

  class TuffURLSearchParams {
    #pairs
    constructor(pairs) { this.#pairs = pairs.map(([key, value]) => [String(key), String(value)]) }
    get(name) { const pair = this.#pairs.find(([key]) => key === String(name)); return pair ? pair[1] : null }
    getAll(name) { return this.#pairs.filter(([key]) => key === String(name)).map(([, value]) => value) }
    has(name) { return this.#pairs.some(([key]) => key === String(name)) }
    toString() { return this.#pairs.map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('&') }
    entries() { return this.#pairs[Symbol.iterator]() }
    [Symbol.iterator]() { return this.entries() }
  }
  class TuffURL {
    #data
    constructor(input, base) {
      const parsed = parseJson(bridge.parseUrl(stringConstructor(input), base === undefined ? undefined : stringConstructor(base)))
      if (!parsed.ok) throw new TypeError('PLUGIN_HOST_CHILD_RESULT_INVALID')
      this.#data = parsed.value
      this.searchParams = new TuffURLSearchParams(this.#data.searchParams)
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
    encode(value = '') { return new uint8ArrayConstructor(bridge.encodeUtf8(stringConstructor(value))) }
  }
  class TuffTextDecoder {
    decode(value = new uint8ArrayConstructor()) {
      if (value instanceof arrayBufferConstructor) value = new uint8ArrayConstructor(value)
      if (!arrayBufferIsView(value)) throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
      return bridge.decodeUtf8(reflectApply(arrayFrom, arrayConstructor, [new uint8ArrayConstructor(value.buffer, value.byteOffset, value.byteLength)]))
    }
  }

  const crypto = objectFreeze({
    randomUUID: () => bridge.randomUUID(),
    getRandomValues: (value) => {
      if (!arrayBufferIsView(value) || value.byteLength > 65536) throw new typeErrorConstructor('PLUGIN_HOST_CHILD_RESULT_INVALID')
      new uint8ArrayConstructor(value.buffer, value.byteOffset, value.byteLength).set(bridge.randomBytes(value.byteLength))
      return value
    }
  })

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
  const hostCapabilities = Object.create(null)
  objectDefineProperty(hostCapabilities, 'invoke', {
    value: invokeCapability,
    enumerable: true
  })
  objectFreeze(hostCapabilities)

  const hasDeclaredCapability = (id) => Boolean(getMapValue(declaredCapabilities, id))
  const hasFeatureFacade = [
    'feature.items.push',
    'feature.items.update',
    'feature.items.remove',
    'feature.items.clear',
    'feature.items.list'
  ].some(hasDeclaredCapability)
  const hasClipboardFacade = [
    'clipboard.read',
    'clipboard.write',
    'clipboard.copy-and-paste'
  ].some(hasDeclaredCapability)
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
      mapCapabilityResult(invokeCapability('feature.items.list', null), (result) => result.items)
    )
  }
  objectFreeze(featureFacade)
  const pluginFacade = objectCreate(null)
  objectDefineProperty(pluginFacade, 'feature', { value: featureFacade, enumerable: true })
  objectFreeze(pluginFacade)

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

  Object.defineProperties(globalThis, {
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
    plugin: { value: hasFeatureFacade ? pluginFacade : undefined, configurable: true },
    clipboard: { value: hasClipboardFacade ? clipboardFacade : undefined, configurable: true },
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
        const parsed = new URL(input, base)
        return JSON.stringify({
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
            searchParams: [...parsed.searchParams.entries()]
          }
        })
      } catch {
        return '{"ok":false}'
      }
    },
    randomBytes: (length) => Array.from(randomBytes(length)),
    randomUUID,
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
