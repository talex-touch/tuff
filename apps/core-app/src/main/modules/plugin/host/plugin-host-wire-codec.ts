export const DEFAULT_HOST_WIRE_LIMITS = Object.freeze({
  maxDepth: 32,
  maxMembers: 10_000,
  maxBytes: 1024 * 1024
})

export type HostWireErrorCode =
  | 'PLUGIN_HOST_WIRE_UNSUPPORTED'
  | 'PLUGIN_HOST_WIRE_NON_PLAIN_OBJECT'
  | 'PLUGIN_HOST_WIRE_CALLBACK_UNSUPPORTED'
  | 'PLUGIN_HOST_WIRE_CYCLIC'
  | 'PLUGIN_HOST_WIRE_DEPTH'
  | 'PLUGIN_HOST_WIRE_MEMBERS'
  | 'PLUGIN_HOST_WIRE_BYTES'
  | 'PLUGIN_HOST_WIRE_FORBIDDEN_KEY'
  | 'PLUGIN_HOST_WIRE_ACCESSOR'
  | 'PLUGIN_HOST_WIRE_INVALID_HANDLE'
  | 'PLUGIN_HOST_WIRE_UNKNOWN_HANDLE'

export class HostWireValueError extends Error {
  constructor(readonly code: HostWireErrorCode) {
    super(code)
    this.name = 'HostWireValueError'
  }
}

export type HostWireResourceKind = 'subscription' | 'stream' | 'disposer' | 'process'
export type HostWireCallback = (...args: unknown[]) => unknown

type ResourceKind = HostWireResourceKind
type Callback = HostWireCallback

interface HostWireHandle {
  readonly kind: 'cancel' | 'resource'
  readonly id: string
  readonly resourceKind?: ResourceKind
}

export interface HostWireLimits {
  maxDepth: number
  maxMembers: number
  maxBytes: number
}

export interface EncodeHostWireOptions {
  registerCallback?: (callback: Callback) => string
  unregisterCallback?: (id: string) => void
  limits?: Partial<HostWireLimits>
}

export interface DecodeHostWireOptions {
  resolveCallback?: (id: string) => Callback | undefined
  resolveCancel?: (id: string) => unknown
  resolveResource?: (id: string, kind: ResourceKind) => unknown
  limits?: Partial<HostWireLimits>
}

const ownedHandles = new WeakSet<object>()
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor', '__tuffHostWire'])
const RESOURCE_KINDS = new Set<ResourceKind>(['subscription', 'stream', 'disposer', 'process'])
const MARKER_KEY = '__tuffHostWire'
const MAX_HANDLE_LENGTH = 128

class WireBudget {
  private bytes = 0
  private members = 0

  constructor(readonly limits: HostWireLimits) {}

  enter(depth: number): void {
    if (depth > this.limits.maxDepth) throw new HostWireValueError('PLUGIN_HOST_WIRE_DEPTH')
  }

  addBytes(bytes: number): void {
    this.bytes += bytes
    if (this.bytes > this.limits.maxBytes) throw new HostWireValueError('PLUGIN_HOST_WIRE_BYTES')
  }

  addMembers(members: number): void {
    this.members += members
    if (this.members > this.limits.maxMembers) {
      throw new HostWireValueError('PLUGIN_HOST_WIRE_MEMBERS')
    }
    this.addBytes(members * 8)
  }

  addString(value: string): void {
    if (this.bytes + value.length + 8 > this.limits.maxBytes) {
      throw new HostWireValueError('PLUGIN_HOST_WIRE_BYTES')
    }
    this.addBytes(Buffer.byteLength(value, 'utf8') + 8)
  }
}

function limitsOf(partial?: Partial<HostWireLimits>): HostWireLimits {
  const limits = { ...DEFAULT_HOST_WIRE_LIMITS, ...partial }
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new HostWireValueError('PLUGIN_HOST_WIRE_UNSUPPORTED')
    }
  }
  return limits
}

function assertHandleId(id: unknown): asserts id is string {
  if (
    typeof id !== 'string' ||
    id.length < 1 ||
    id.length > MAX_HANDLE_LENGTH ||
    Buffer.byteLength(id, 'utf8') > MAX_HANDLE_LENGTH
  ) {
    throw new HostWireValueError('PLUGIN_HOST_WIRE_INVALID_HANDLE')
  }
}

function createOwnedHandle(handle: HostWireHandle): HostWireHandle {
  assertHandleId(handle.id)
  const frozen = Object.freeze(handle)
  ownedHandles.add(frozen)
  return frozen
}

export function hostWireCancelHandle(id: string): HostWireHandle {
  return createOwnedHandle({ kind: 'cancel', id })
}

export function hostWireResourceHandle(id: string, kind: ResourceKind): HostWireHandle {
  if (!RESOURCE_KINDS.has(kind)) {
    throw new HostWireValueError('PLUGIN_HOST_WIRE_INVALID_HANDLE')
  }
  return createOwnedHandle({ kind: 'resource', id, resourceKind: kind })
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function forEachEnumerableData(value: object, visit: (key: string, entry: unknown) => void): void {
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable) continue
    if (!('value' in descriptor)) throw new HostWireValueError('PLUGIN_HOST_WIRE_ACCESSOR')
    visit(key, descriptor.value)
  }
}

function denseArrayValues(value: unknown[], budget: WireBudget): unknown[] {
  budget.addMembers(value.length)
  const values = new Array<unknown>(value.length)
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor?.enumerable || !('value' in descriptor)) {
      throw new HostWireValueError(
        descriptor && !('value' in descriptor)
          ? 'PLUGIN_HOST_WIRE_ACCESSOR'
          : 'PLUGIN_HOST_WIRE_UNSUPPORTED'
      )
    }
    values[index] = descriptor.value
  }
  forEachEnumerableData(value, (key) => {
    const index = Number(key)
    if (!Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== key) {
      throw new HostWireValueError('PLUGIN_HOST_WIRE_UNSUPPORTED')
    }
  })
  return values
}

function encodeError(value: Error, budget: WireBudget): Record<string, unknown> {
  const messageDescriptor = Object.getOwnPropertyDescriptor(value, 'message')
  const codeDescriptor = Object.getOwnPropertyDescriptor(value, 'code')
  if (
    (messageDescriptor && !('value' in messageDescriptor)) ||
    (codeDescriptor && !('value' in codeDescriptor))
  ) {
    throw new HostWireValueError('PLUGIN_HOST_WIRE_ACCESSOR')
  }
  const message = messageDescriptor?.value ?? ''
  const code = codeDescriptor?.value
  if (typeof message !== 'string' || message.length > 4096) {
    throw new HostWireValueError('PLUGIN_HOST_WIRE_UNSUPPORTED')
  }
  if (code !== undefined && (typeof code !== 'string' || code.length > 128)) {
    throw new HostWireValueError('PLUGIN_HOST_WIRE_UNSUPPORTED')
  }
  budget.addMembers(code === undefined ? 3 : 4)
  budget.addString('error')
  budget.addString(message)
  budget.addString('Error')
  if (typeof code === 'string') budget.addString(code)
  return {
    [MARKER_KEY]: 'error',
    ...(typeof code === 'string' ? { code } : {}),
    message,
    name: 'Error'
  }
}

export function encodeHostWireValue(value: unknown, options: EncodeHostWireOptions = {}): unknown {
  if (options.registerCallback && !options.unregisterCallback) {
    throw new HostWireValueError('PLUGIN_HOST_WIRE_CALLBACK_UNSUPPORTED')
  }
  const budget = new WireBudget(limitsOf(options.limits))
  const ancestors = new WeakSet<object>()
  const pendingCallbacks: Array<{ callback: Callback; marker: Record<string, unknown> }> = []
  const registeredIds: string[] = []

  const visit = (current: unknown, depth: number): unknown => {
    budget.enter(depth)
    if (current === undefined) {
      budget.addBytes(24)
      return { [MARKER_KEY]: 'undefined' }
    }
    if (current === null || typeof current === 'boolean') {
      budget.addBytes(8)
      return current
    }
    if (typeof current === 'string') {
      budget.addString(current)
      return current
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) throw new HostWireValueError('PLUGIN_HOST_WIRE_UNSUPPORTED')
      budget.addBytes(8)
      return current
    }
    if (typeof current === 'function') {
      if (!options.registerCallback) {
        throw new HostWireValueError('PLUGIN_HOST_WIRE_CALLBACK_UNSUPPORTED')
      }
      budget.addBytes(MAX_HANDLE_LENGTH + 32)
      const marker: Record<string, unknown> = { [MARKER_KEY]: 'callback', id: '' }
      pendingCallbacks.push({ callback: current as Callback, marker })
      return marker
    }
    if (typeof current !== 'object') throw new HostWireValueError('PLUGIN_HOST_WIRE_UNSUPPORTED')

    if (ownedHandles.has(current)) {
      const handle = current as HostWireHandle
      budget.addString(handle.id)
      budget.addBytes(48)
      return handle.kind === 'cancel'
        ? { [MARKER_KEY]: 'cancel', id: handle.id }
        : { [MARKER_KEY]: 'resource', id: handle.id, kind: handle.resourceKind }
    }
    if (current instanceof Error) return encodeError(current, budget)
    if (ArrayBuffer.isView(current)) {
      budget.addBytes(current.byteLength + 32)
      const bytes = new Uint8Array(current.buffer, current.byteOffset, current.byteLength)
      return { [MARKER_KEY]: 'bytes', value: Uint8Array.from(bytes) }
    }
    if (current instanceof ArrayBuffer) {
      budget.addBytes(current.byteLength + 32)
      return { [MARKER_KEY]: 'bytes', value: Uint8Array.from(new Uint8Array(current)) }
    }
    if (!Array.isArray(current) && !isPlainObject(current)) {
      throw new HostWireValueError('PLUGIN_HOST_WIRE_NON_PLAIN_OBJECT')
    }
    if (ancestors.has(current)) throw new HostWireValueError('PLUGIN_HOST_WIRE_CYCLIC')
    ancestors.add(current)
    try {
      if (Array.isArray(current)) {
        const values = denseArrayValues(current, budget)
        return values.map((entry) => visit(entry, depth + 1))
      }
      const output: Record<string, unknown> = {}
      forEachEnumerableData(current, (key, entry) => {
        budget.addMembers(1)
        if (FORBIDDEN_KEYS.has(key)) throw new HostWireValueError('PLUGIN_HOST_WIRE_FORBIDDEN_KEY')
        budget.addString(key)
        output[key] = visit(entry, depth + 1)
      })
      return output
    } finally {
      ancestors.delete(current)
    }
  }

  try {
    const encoded = visit(value, 0)
    for (const pending of pendingCallbacks) {
      const id = options.registerCallback!(pending.callback)
      registeredIds.push(id)
      assertHandleId(id)
      pending.marker.id = id
    }
    return encoded
  } catch (error) {
    for (const id of registeredIds.reverse()) {
      try {
        options.unregisterCallback?.(id)
      } catch {
        // Rollback failures cannot replace the stable codec error.
      }
    }
    if (error instanceof HostWireValueError) throw new HostWireValueError(error.code)
    throw new HostWireValueError('PLUGIN_HOST_WIRE_UNSUPPORTED')
  }
}

function exactMarkerEntries(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  budget: WireBudget
): Record<string, unknown> {
  const expected = new Set(expectedKeys)
  const output: Record<string, unknown> = {}
  let count = 0
  forEachEnumerableData(value, (key, entry) => {
    count += 1
    budget.addMembers(1)
    if (count > expected.size || !expected.has(key)) {
      throw new HostWireValueError('PLUGIN_HOST_WIRE_INVALID_HANDLE')
    }
    budget.addString(key)
    output[key] = entry
  })
  if (count !== expected.size) throw new HostWireValueError('PLUGIN_HOST_WIRE_INVALID_HANDLE')
  return output
}

function resolveOwnedHandle<T>(resolver: (() => T | undefined) | undefined): T | undefined {
  if (!resolver) return undefined
  try {
    return resolver()
  } catch {
    throw new HostWireValueError('PLUGIN_HOST_WIRE_UNKNOWN_HANDLE')
  }
}

export function decodeHostWireValue(value: unknown, options: DecodeHostWireOptions = {}): unknown {
  const budget = new WireBudget(limitsOf(options.limits))
  const ancestors = new WeakSet<object>()

  const visit = (current: unknown, depth: number): unknown => {
    budget.enter(depth)
    if (current === null || typeof current === 'boolean') {
      budget.addBytes(8)
      return current
    }
    if (typeof current === 'string') {
      budget.addString(current)
      return current
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) throw new HostWireValueError('PLUGIN_HOST_WIRE_UNSUPPORTED')
      budget.addBytes(8)
      return current
    }
    if (typeof current !== 'object') throw new HostWireValueError('PLUGIN_HOST_WIRE_UNSUPPORTED')
    if (!Array.isArray(current) && !isPlainObject(current)) {
      throw new HostWireValueError('PLUGIN_HOST_WIRE_NON_PLAIN_OBJECT')
    }
    if (ancestors.has(current)) throw new HostWireValueError('PLUGIN_HOST_WIRE_CYCLIC')
    ancestors.add(current)
    try {
      if (Array.isArray(current)) {
        const values = denseArrayValues(current, budget)
        return values.map((entry) => visit(entry, depth + 1))
      }

      const recordValue = current as Record<string, unknown>
      const markerDescriptor = Object.getOwnPropertyDescriptor(recordValue, MARKER_KEY)
      if (markerDescriptor) {
        if (!markerDescriptor.enumerable || !('value' in markerDescriptor)) {
          throw new HostWireValueError('PLUGIN_HOST_WIRE_INVALID_HANDLE')
        }
        const marker = markerDescriptor.value
        if (typeof marker !== 'string')
          throw new HostWireValueError('PLUGIN_HOST_WIRE_INVALID_HANDLE')
        switch (marker) {
          case 'undefined': {
            exactMarkerEntries(recordValue, [MARKER_KEY], budget)
            budget.addBytes(24)
            return undefined
          }
          case 'error': {
            const hasCode = Object.hasOwn(recordValue, 'code')
            const record = exactMarkerEntries(
              recordValue,
              hasCode ? [MARKER_KEY, 'code', 'message', 'name'] : [MARKER_KEY, 'message', 'name'],
              budget
            )
            if (
              typeof record.message !== 'string' ||
              record.message.length > 4096 ||
              record.name !== 'Error' ||
              (hasCode && (typeof record.code !== 'string' || record.code.length > 128))
            ) {
              throw new HostWireValueError('PLUGIN_HOST_WIRE_INVALID_HANDLE')
            }
            budget.addString('error')
            budget.addString(record.message)
            budget.addString('Error')
            if (hasCode) budget.addString(record.code as string)
            return {
              ...(hasCode ? { code: record.code } : {}),
              message: record.message,
              name: 'Error'
            }
          }
          case 'bytes': {
            const record = exactMarkerEntries(recordValue, [MARKER_KEY, 'value'], budget)
            if (!(record.value instanceof Uint8Array)) {
              throw new HostWireValueError('PLUGIN_HOST_WIRE_INVALID_HANDLE')
            }
            budget.addBytes(record.value.byteLength + 32)
            return Uint8Array.from(record.value)
          }
          case 'callback': {
            const record = exactMarkerEntries(recordValue, [MARKER_KEY, 'id'], budget)
            const id = record.id
            assertHandleId(id)
            budget.addString(id)
            budget.addBytes(32)
            const callback = resolveOwnedHandle(
              options.resolveCallback ? () => options.resolveCallback!(id) : undefined
            )
            if (typeof callback !== 'function') {
              throw new HostWireValueError('PLUGIN_HOST_WIRE_UNKNOWN_HANDLE')
            }
            return callback
          }
          case 'cancel': {
            const record = exactMarkerEntries(recordValue, [MARKER_KEY, 'id'], budget)
            const id = record.id
            assertHandleId(id)
            budget.addString(id)
            budget.addBytes(32)
            const cancel = resolveOwnedHandle(
              options.resolveCancel ? () => options.resolveCancel!(id) : undefined
            )
            if (cancel === undefined)
              throw new HostWireValueError('PLUGIN_HOST_WIRE_UNKNOWN_HANDLE')
            return cancel
          }
          case 'resource': {
            const record = exactMarkerEntries(recordValue, [MARKER_KEY, 'id', 'kind'], budget)
            const id = record.id
            assertHandleId(id)
            if (
              typeof record.kind !== 'string' ||
              !RESOURCE_KINDS.has(record.kind as ResourceKind)
            ) {
              throw new HostWireValueError('PLUGIN_HOST_WIRE_INVALID_HANDLE')
            }
            budget.addString(id)
            budget.addString(record.kind)
            budget.addBytes(40)
            const resourceKind = record.kind as ResourceKind
            const resource = resolveOwnedHandle(
              options.resolveResource ? () => options.resolveResource!(id, resourceKind) : undefined
            )
            if (resource === undefined)
              throw new HostWireValueError('PLUGIN_HOST_WIRE_UNKNOWN_HANDLE')
            return resource
          }
          default:
            throw new HostWireValueError('PLUGIN_HOST_WIRE_INVALID_HANDLE')
        }
      }

      const output: Record<string, unknown> = {}
      forEachEnumerableData(recordValue, (key, entry) => {
        budget.addMembers(1)
        if (FORBIDDEN_KEYS.has(key)) throw new HostWireValueError('PLUGIN_HOST_WIRE_FORBIDDEN_KEY')
        budget.addString(key)
        output[key] = visit(entry, depth + 1)
      })
      return output
    } finally {
      ancestors.delete(current)
    }
  }

  return visit(value, 0)
}
