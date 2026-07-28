import { randomUUID } from 'node:crypto'
import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { HOST_PROTOCOL_VERSION, type HostMessageOwner } from './plugin-host-wire'

export type PluginHostCallbackErrorCode =
  | 'PLUGIN_HOST_CALLBACK_INVALID_OPTIONS'
  | 'PLUGIN_HOST_CALLBACK_LIMIT'
  | 'PLUGIN_HOST_CALLBACK_DUPLICATE'
  | 'PLUGIN_HOST_CALLBACK_UNKNOWN'
  | 'PLUGIN_HOST_CALLBACK_DISPOSED'
  | 'PLUGIN_HOST_CALLBACK_CONCURRENCY_LIMIT'
  | 'PLUGIN_HOST_CALLBACK_OWNER_MISMATCH'
  | 'PLUGIN_HOST_CALLBACK_STALE_ACTIVATION'
  | 'PLUGIN_HOST_CALLBACK_FAILED'
  | 'PLUGIN_HOST_CALLBACK_CLOSED'

export class PluginHostCallbackError extends Error {
  constructor(readonly code: PluginHostCallbackErrorCode) {
    super(code)
    this.name = 'PluginHostCallbackError'
  }
}

type Callback = (...args: unknown[]) => unknown

interface MainCallbackRecord {
  readonly id: string
  readonly requestId: number
  readonly proxy: Callback
  retainedBy: string | null
  disposed: boolean
  failed: boolean
}

export interface PluginHostCallbackRegistryOptions {
  owner: HostMessageOwner
  activation: PluginActivationIdentity
  resolveCurrentActivation: (pluginName: string) => PluginActivationIdentity | undefined
  isActive: () => boolean
  maxCallbacks: number
  maxConcurrent: number
  invokeRemote: (id: string, args: unknown[]) => Promise<unknown>
  onRetainedCallbackFailure?: (resourceId: string) => void
}

interface ChildCallbackRecord {
  readonly id: string
  readonly requestId: number
  readonly callback: Callback
  retainedBy: string | null
  disposed: boolean
}

export interface PluginHostChildCallbackRegistryOptions {
  owner: HostMessageOwner
  maxCallbacks: number
  maxConcurrent: number
  createCallbackId?: () => string
}

const MAX_CALLBACKS = 64
const MAX_CONCURRENT = 16
const MAX_ID_LENGTH = 128
const MAX_TRACKED_CALLBACK_IDS = 65_536

function invalidOptions(): never {
  throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_INVALID_OPTIONS')
}

function snapshotOptions(
  input: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Readonly<Record<string, unknown>> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalidOptions()
  let descriptors: PropertyDescriptorMap
  try {
    descriptors = Object.getOwnPropertyDescriptors(input)
  } catch {
    invalidOptions()
  }
  const allowed = new Set([...required, ...optional])
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key]
    if (
      typeof key !== 'string' ||
      !allowed.has(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    ) {
      invalidOptions()
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(descriptors, key)) invalidOptions()
  }
  const output: Record<string, unknown> = {}
  for (const key of allowed) {
    const descriptor = descriptors[key]
    if (descriptor && 'value' in descriptor) output[key] = descriptor.value
  }
  return Object.freeze(output)
}

function readDataField(input: unknown, key: string): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalidOptions()
  let descriptor: PropertyDescriptor | undefined
  try {
    descriptor = Object.getOwnPropertyDescriptor(input, key)
  } catch {
    invalidOptions()
  }
  if (!descriptor?.enumerable || !('value' in descriptor)) invalidOptions()
  return descriptor.value
}

function snapshotOwner(input: unknown): HostMessageOwner {
  const protocolVersion = readDataField(input, 'protocolVersion')
  const activationHandle = readDataField(input, 'activationHandle')
  const hostGeneration = readDataField(input, 'hostGeneration')
  if (
    protocolVersion !== HOST_PROTOCOL_VERSION ||
    typeof activationHandle !== 'string' ||
    activationHandle.length < 1 ||
    activationHandle.length > MAX_ID_LENGTH ||
    !Number.isSafeInteger(hostGeneration) ||
    Number(hostGeneration) < 1
  ) {
    invalidOptions()
  }
  return Object.freeze({
    protocolVersion: HOST_PROTOCOL_VERSION,
    activationHandle,
    hostGeneration: Number(hostGeneration)
  })
}

function snapshotActivation(input: unknown): PluginActivationIdentity {
  const name = readDataField(input, 'name')
  const pluginInstanceId = readDataField(input, 'pluginInstanceId')
  const activationGeneration = readDataField(input, 'activationGeneration')
  const key = readDataField(input, 'key')
  if (
    typeof name !== 'string' ||
    name.length < 1 ||
    typeof pluginInstanceId !== 'string' ||
    pluginInstanceId.length < 1 ||
    !Number.isSafeInteger(activationGeneration) ||
    Number(activationGeneration) < 1 ||
    typeof key !== 'string' ||
    key.length < 1
  ) {
    invalidOptions()
  }
  return Object.freeze({
    name,
    pluginInstanceId,
    activationGeneration: Number(activationGeneration),
    key
  })
}

function sameOwner(expected: HostMessageOwner, input: unknown): boolean {
  try {
    const actual = snapshotOwner(input)
    return (
      actual.activationHandle === expected.activationHandle &&
      actual.hostGeneration === expected.hostGeneration
    )
  } catch {
    return false
  }
}

function sameActivation(expected: PluginActivationIdentity, input: unknown): boolean {
  try {
    const actual = snapshotActivation(input)
    return (
      actual.name === expected.name &&
      actual.pluginInstanceId === expected.pluginInstanceId &&
      actual.activationGeneration === expected.activationGeneration &&
      actual.key === expected.key
    )
  } catch {
    return false
  }
}

function assertId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || id.length < 1 || id.length > MAX_ID_LENGTH) invalidOptions()
}

function assertRequestId(requestId: unknown): asserts requestId is number {
  if (!Number.isSafeInteger(requestId) || Number(requestId) < 0) invalidOptions()
}

function assertLimits(maxCallbacks: unknown, maxConcurrent: unknown): void {
  if (
    !Number.isSafeInteger(maxCallbacks) ||
    Number(maxCallbacks) < 1 ||
    Number(maxCallbacks) > MAX_CALLBACKS ||
    !Number.isSafeInteger(maxConcurrent) ||
    Number(maxConcurrent) < 1 ||
    Number(maxConcurrent) > MAX_CONCURRENT
  ) {
    invalidOptions()
  }
}

export class PluginHostCallbackRegistry {
  readonly owner: HostMessageOwner
  readonly activation: PluginActivationIdentity
  private readonly maxCallbacks: number
  private readonly maxConcurrent: number
  private readonly invokeRemote: PluginHostCallbackRegistryOptions['invokeRemote']
  private readonly onRetainedCallbackFailure?: PluginHostCallbackRegistryOptions['onRetainedCallbackFailure']
  private readonly resolveCurrentActivation: PluginHostCallbackRegistryOptions['resolveCurrentActivation']
  private readonly isActive: PluginHostCallbackRegistryOptions['isActive']
  private readonly callbacks = new Map<string, MainCallbackRecord>()
  private readonly seenIds = new Set<string>()
  private readonly byRequest = new Map<number, Set<string>>()
  private readonly byResource = new Map<string, Set<string>>()
  private activeInvocations = 0
  private closed = false

  constructor(input: PluginHostCallbackRegistryOptions) {
    const options = snapshotOptions(
      input,
      [
        'owner',
        'activation',
        'resolveCurrentActivation',
        'isActive',
        'maxCallbacks',
        'maxConcurrent',
        'invokeRemote'
      ],
      ['onRetainedCallbackFailure']
    )
    assertLimits(options.maxCallbacks, options.maxConcurrent)
    if (
      typeof options.resolveCurrentActivation !== 'function' ||
      typeof options.isActive !== 'function' ||
      typeof options.invokeRemote !== 'function' ||
      (options.onRetainedCallbackFailure !== undefined &&
        typeof options.onRetainedCallbackFailure !== 'function')
    ) {
      invalidOptions()
    }
    this.owner = snapshotOwner(options.owner)
    this.activation = snapshotActivation(options.activation)
    this.maxCallbacks = Number(options.maxCallbacks)
    this.maxConcurrent = Number(options.maxConcurrent)
    this.resolveCurrentActivation =
      options.resolveCurrentActivation as PluginHostCallbackRegistryOptions['resolveCurrentActivation']
    this.isActive = options.isActive as PluginHostCallbackRegistryOptions['isActive']
    const invokeRemote = options.invokeRemote as PluginHostCallbackRegistryOptions['invokeRemote']
    this.invokeRemote = (id, args) => Promise.resolve(invokeRemote.call(input, id, args))
    this.onRetainedCallbackFailure = options.onRetainedCallbackFailure as
      | PluginHostCallbackRegistryOptions['onRetainedCallbackFailure']
      | undefined
  }

  get size(): number {
    return this.callbacks.size
  }

  resolve(id: string, requestId: number, owner: HostMessageOwner): Callback {
    this.assertCurrent(owner)
    assertId(id)
    assertRequestId(requestId)
    if (this.seenIds.has(id)) {
      throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_DUPLICATE')
    }
    if (this.callbacks.size >= this.maxCallbacks || this.seenIds.size >= MAX_TRACKED_CALLBACK_IDS) {
      throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_LIMIT')
    }
    const record = {} as MainCallbackRecord
    const proxy = Object.freeze((...args: unknown[]) => this.invoke(record, args))
    Object.assign(record, {
      id,
      requestId,
      proxy,
      retainedBy: null,
      disposed: false,
      failed: false
    })
    this.seenIds.add(id)
    this.callbacks.set(id, record)
    const requestCallbacks = this.byRequest.get(requestId) ?? new Set<string>()
    requestCallbacks.add(id)
    this.byRequest.set(requestId, requestCallbacks)
    return proxy
  }

  rollback(id: string, proxy: Callback, requestId: number): void {
    const record = this.callbacks.get(id)
    if (!record || record.proxy !== proxy || record.requestId !== requestId || record.retainedBy)
      return
    this.releaseRecord(record)
  }

  hasRequest(requestId: number): boolean {
    return (this.byRequest.get(requestId)?.size ?? 0) > 0
  }

  releaseRequest(requestId: number): void {
    const ids = this.byRequest.get(requestId)
    if (!ids) return
    this.byRequest.delete(requestId)
    for (const id of ids) {
      const record = this.callbacks.get(id)
      if (record && !record.retainedBy) this.releaseRecord(record)
    }
  }

  retainRequest(requestId: number, resourceId: string): readonly string[] {
    assertId(resourceId)
    const ids = this.byRequest.get(requestId)
    if (!ids) return Object.freeze([])
    if ([...ids].some((id) => this.callbacks.get(id)?.failed === true)) {
      this.releaseRequest(requestId)
      throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_FAILED')
    }
    this.byRequest.delete(requestId)
    const retained = this.byResource.get(resourceId) ?? new Set<string>()
    const retainedIds: string[] = []
    for (const id of ids) {
      const record = this.callbacks.get(id)
      if (!record || record.disposed) continue
      record.retainedBy = resourceId
      retained.add(id)
      retainedIds.push(id)
    }
    if (retained.size > 0) this.byResource.set(resourceId, retained)
    return Object.freeze(retainedIds)
  }

  releaseResource(resourceId: string): void {
    const ids = this.byResource.get(resourceId)
    if (!ids) return
    this.byResource.delete(resourceId)
    for (const id of ids) {
      const record = this.callbacks.get(id)
      if (record) this.releaseRecord(record)
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    for (const record of [...this.callbacks.values()]) this.releaseRecord(record)
    this.byRequest.clear()
    this.byResource.clear()
  }

  private assertCurrent(owner: HostMessageOwner): void {
    if (this.closed) throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_CLOSED')
    if (!sameOwner(this.owner, owner)) {
      throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_OWNER_MISMATCH')
    }
    let active: unknown
    let current: unknown
    try {
      active = this.isActive()
      current = this.resolveCurrentActivation(this.activation.name)
    } catch {
      throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_STALE_ACTIVATION')
    }
    if (active !== true || !sameActivation(this.activation, current)) {
      throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_STALE_ACTIVATION')
    }
  }

  private async invoke(record: MainCallbackRecord, args: unknown[]): Promise<unknown> {
    if (this.closed) throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_CLOSED')
    if (record.disposed || this.callbacks.get(record.id) !== record) {
      throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_DISPOSED')
    }
    this.assertCurrent(this.owner)
    if (this.activeInvocations >= this.maxConcurrent) {
      this.markFailed(record)
      throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_CONCURRENCY_LIMIT')
    }
    this.activeInvocations += 1
    try {
      return await this.invokeRemote(record.id, args)
    } catch (error) {
      this.markFailed(record)
      if (error instanceof PluginHostCallbackError) throw new PluginHostCallbackError(error.code)
      throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_FAILED')
    } finally {
      this.activeInvocations -= 1
    }
  }

  private markFailed(record: MainCallbackRecord): void {
    record.failed = true
    if (!record.retainedBy || !this.onRetainedCallbackFailure) return
    try {
      this.onRetainedCallbackFailure(record.retainedBy)
    } catch {
      // The runtime host owns fail-closed resource cleanup.
    }
  }

  private releaseRecord(record: MainCallbackRecord): void {
    if (record.disposed) return
    record.disposed = true
    this.callbacks.delete(record.id)
    this.byRequest.get(record.requestId)?.delete(record.id)
    if (this.byRequest.get(record.requestId)?.size === 0) this.byRequest.delete(record.requestId)
    if (record.retainedBy) {
      this.byResource.get(record.retainedBy)?.delete(record.id)
      if (this.byResource.get(record.retainedBy)?.size === 0) {
        this.byResource.delete(record.retainedBy)
      }
    }
  }
}

export class PluginHostChildCallbackRegistry {
  readonly owner: HostMessageOwner
  private readonly maxCallbacks: number
  private readonly maxConcurrent: number
  private readonly createCallbackId: () => string
  private readonly callbacks = new Map<string, ChildCallbackRecord>()
  private readonly seenIds = new Set<string>()
  private readonly byRequest = new Map<number, Set<string>>()
  private readonly byResource = new Map<string, Set<string>>()
  private activeInvocations = 0
  private closed = false

  constructor(input: PluginHostChildCallbackRegistryOptions) {
    const options = snapshotOptions(
      input,
      ['owner', 'maxCallbacks', 'maxConcurrent'],
      ['createCallbackId']
    )
    assertLimits(options.maxCallbacks, options.maxConcurrent)
    if (options.createCallbackId !== undefined && typeof options.createCallbackId !== 'function') {
      invalidOptions()
    }
    this.owner = snapshotOwner(options.owner)
    this.maxCallbacks = Number(options.maxCallbacks)
    this.maxConcurrent = Number(options.maxConcurrent)
    const createCallbackId = (options.createCallbackId as (() => string) | undefined) ?? randomUUID
    this.createCallbackId = () => createCallbackId.call(input)
  }

  get size(): number {
    return this.callbacks.size
  }

  register(callback: Callback, requestId: number, owner: HostMessageOwner): string {
    this.assertOwner(owner)
    if (this.closed) throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_CLOSED')
    assertRequestId(requestId)
    if (typeof callback !== 'function') invalidOptions()
    if (this.callbacks.size >= this.maxCallbacks) {
      throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_LIMIT')
    }
    let id: unknown
    try {
      id = this.createCallbackId()
    } catch {
      invalidOptions()
    }
    assertId(id)
    if (this.seenIds.has(id)) {
      throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_DUPLICATE')
    }
    if (this.seenIds.size >= MAX_TRACKED_CALLBACK_IDS) {
      throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_LIMIT')
    }
    const record: ChildCallbackRecord = {
      id,
      requestId,
      callback,
      retainedBy: null,
      disposed: false
    }
    this.seenIds.add(id)
    this.callbacks.set(id, record)
    const requestCallbacks = this.byRequest.get(requestId) ?? new Set<string>()
    requestCallbacks.add(id)
    this.byRequest.set(requestId, requestCallbacks)
    return id
  }

  unregister(id: string, requestId: number, owner: HostMessageOwner): void {
    this.assertOwner(owner)
    const record = this.callbacks.get(id)
    if (!record || record.requestId !== requestId || record.retainedBy) return
    this.releaseRecord(record)
  }

  async invoke(id: string, args: unknown[], owner: HostMessageOwner): Promise<unknown> {
    this.assertOwner(owner)
    if (this.closed) throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_CLOSED')
    assertId(id)
    const record = this.callbacks.get(id)
    if (!record || record.disposed) {
      throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_UNKNOWN')
    }
    if (!Array.isArray(args)) throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_FAILED')
    if (this.activeInvocations >= this.maxConcurrent) {
      throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_CONCURRENCY_LIMIT')
    }
    this.activeInvocations += 1
    try {
      return await record.callback(...args)
    } catch {
      throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_FAILED')
    } finally {
      this.activeInvocations -= 1
    }
  }

  hasRequest(requestId: number): boolean {
    return (this.byRequest.get(requestId)?.size ?? 0) > 0
  }

  releaseRequest(requestId: number): void {
    const ids = this.byRequest.get(requestId)
    if (!ids) return
    this.byRequest.delete(requestId)
    for (const id of ids) {
      const record = this.callbacks.get(id)
      if (record && !record.retainedBy) this.releaseRecord(record)
    }
  }

  retainRequest(requestId: number, resourceId: string): readonly string[] {
    assertId(resourceId)
    const ids = this.byRequest.get(requestId)
    if (!ids) return Object.freeze([])
    this.byRequest.delete(requestId)
    const retained = this.byResource.get(resourceId) ?? new Set<string>()
    const retainedIds: string[] = []
    for (const id of ids) {
      const record = this.callbacks.get(id)
      if (!record || record.disposed) continue
      record.retainedBy = resourceId
      retained.add(id)
      retainedIds.push(id)
    }
    if (retained.size > 0) this.byResource.set(resourceId, retained)
    return Object.freeze(retainedIds)
  }

  releaseResource(resourceId: string): void {
    const ids = this.byResource.get(resourceId)
    if (!ids) return
    this.byResource.delete(resourceId)
    for (const id of ids) {
      const record = this.callbacks.get(id)
      if (record) this.releaseRecord(record)
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    for (const record of [...this.callbacks.values()]) this.releaseRecord(record)
    this.byRequest.clear()
    this.byResource.clear()
  }

  private assertOwner(owner: HostMessageOwner): void {
    if (!sameOwner(this.owner, owner)) {
      throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_OWNER_MISMATCH')
    }
  }

  private releaseRecord(record: ChildCallbackRecord): void {
    if (record.disposed) return
    record.disposed = true
    this.callbacks.delete(record.id)
    this.byRequest.get(record.requestId)?.delete(record.id)
    if (this.byRequest.get(record.requestId)?.size === 0) this.byRequest.delete(record.requestId)
    if (record.retainedBy) {
      this.byResource.get(record.retainedBy)?.delete(record.id)
      if (this.byResource.get(record.retainedBy)?.size === 0) {
        this.byResource.delete(record.retainedBy)
      }
    }
  }
}
