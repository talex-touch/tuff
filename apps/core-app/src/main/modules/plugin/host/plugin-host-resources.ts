import { randomUUID } from 'node:crypto'
import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import {
  hostWireResourceHandle,
  type HostWireResourceDescriptor,
  type HostWireResourceKind
} from './plugin-host-wire-codec'
import {
  HOST_PROTOCOL_VERSION,
  PLUGIN_HOST_CAPABILITIES,
  type HostMessageOwner,
  type HostWireMessage,
  type PluginHostCapability,
  type PluginHostResourceKind,
  type PluginHostViolationCode
} from './plugin-host-wire'
import type { PluginHostSession } from './plugin-host-session'

export type PluginHostResourceErrorCode =
  | 'PLUGIN_HOST_RESOURCE_INVALID_OPTIONS'
  | 'PLUGIN_HOST_RESOURCE_LIMIT'
  | 'PLUGIN_HOST_RESOURCE_KIND_LIMIT'
  | 'PLUGIN_HOST_RESOURCE_DUPLICATE'
  | 'PLUGIN_HOST_RESOURCE_UNKNOWN'
  | 'PLUGIN_HOST_RESOURCE_KIND_MISMATCH'
  | 'PLUGIN_HOST_RESOURCE_STALE_ACTIVATION'
  | 'PLUGIN_HOST_RESOURCE_PERMISSION_REVOKED'
  | 'PLUGIN_HOST_RESOURCE_DISPOSE_FAILED'
  | 'PLUGIN_HOST_RESOURCE_CLOSED'

export class PluginHostResourceError extends Error {
  constructor(readonly code: PluginHostResourceErrorCode) {
    super(code)
    this.name = 'PluginHostResourceError'
  }
}

type ResourceHandle = ReturnType<typeof hostWireResourceHandle>
type ResourceDisposer = () => void | Promise<void>
type CallbackRelease = (resourceId: string, callbackIds: readonly string[]) => void | Promise<void>

export interface PluginHostCapabilityResourceContext {
  register(kind: HostWireResourceKind, dispose: ResourceDisposer): ResourceHandle
}

export interface PluginHostResourceInvocation {
  readonly resources: PluginHostCapabilityResourceContext
  owns(value: unknown): boolean
  commit(result: unknown): Promise<void>
  rollback(): Promise<void>
}

export interface PluginHostResourceDispatcher {
  readonly owner: HostMessageOwner
  readonly activation: PluginActivationIdentity
  beginInvocation(options: {
    capabilityId: PluginHostCapability
    permissionId?: string
  }): PluginHostResourceInvocation
  dispose(
    id: string,
    kind: PluginHostResourceKind,
    releaseCallbacks?: CallbackRelease
  ): Promise<void>
  inspect(value: unknown): HostWireResourceDescriptor | null
  retainCallbacks(handle: unknown, callbackIds: readonly string[]): void
  close(releaseCallbacks?: CallbackRelease): Promise<void>
}

export interface PluginHostResourceRegistryOptions {
  owner: HostMessageOwner
  activation: PluginActivationIdentity
  resolveCurrentActivation: (pluginName: string) => PluginActivationIdentity | undefined
  isActive: () => boolean
  maxResources?: number
  maxSubscriptions?: number
  maxStreams?: number
  maxDisposers?: number
  maxProcesses?: number
  createResourceId?: () => string
  watchPermissionRevoked?: (
    pluginName: string,
    permissionId: string,
    onRevoke: () => void
  ) => () => void
  onFatalViolation?: (code: PluginHostResourceErrorCode) => void
}

interface ResourceRecord {
  readonly id: string
  readonly kind: HostWireResourceKind
  readonly handle: ResourceHandle
  readonly dispose: ResourceDisposer
  readonly capabilityId: PluginHostCapability
  readonly permissionId?: string
  readonly callbackIds: Set<string>
  committed: boolean
  disposed: boolean
  permissionDisposer: (() => void) | null
  disposal: Promise<void> | null
}

interface InvocationOptions {
  readonly capabilityId: PluginHostCapability
  readonly permissionId?: string
}

const RESOURCE_KINDS = new Set<HostWireResourceKind>([
  'subscription',
  'stream',
  'disposer',
  'process'
])
const CAPABILITIES = new Set<string>(PLUGIN_HOST_CAPABILITIES)
const DEFAULT_LIMITS = Object.freeze({
  maxResources: 64,
  maxSubscriptions: 32,
  maxStreams: 8,
  maxDisposers: 32,
  maxProcesses: 2
})
const MAX_RESOURCES = 1024
const MAX_ID_LENGTH = 128
const MAX_TRACKED_RESOURCE_IDS = 65_536

function invalidOptions(): never {
  throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_INVALID_OPTIONS')
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
  for (const key of required) if (!Object.hasOwn(descriptors, key)) invalidOptions()
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

function assertResourceId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || id.length < 1 || id.length > MAX_ID_LENGTH) invalidOptions()
}

function resolveLimits(options: Readonly<Record<string, unknown>>) {
  const maxResources = Number(options.maxResources ?? DEFAULT_LIMITS.maxResources)
  const limits = {
    maxResources,
    maxSubscriptions: Number(
      options.maxSubscriptions ?? Math.min(DEFAULT_LIMITS.maxSubscriptions, maxResources)
    ),
    maxStreams: Number(options.maxStreams ?? Math.min(DEFAULT_LIMITS.maxStreams, maxResources)),
    maxDisposers: Number(
      options.maxDisposers ?? Math.min(DEFAULT_LIMITS.maxDisposers, maxResources)
    ),
    maxProcesses: Number(
      options.maxProcesses ?? Math.min(DEFAULT_LIMITS.maxProcesses, maxResources)
    )
  }
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_RESOURCES) invalidOptions()
  }
  if (
    limits.maxSubscriptions > limits.maxResources ||
    limits.maxStreams > limits.maxResources ||
    limits.maxDisposers > limits.maxResources ||
    limits.maxProcesses > limits.maxResources
  ) {
    invalidOptions()
  }
  return Object.freeze(limits)
}

export class PluginHostResourceRegistry
  implements PluginHostResourceDispatcher, PluginHostCapabilityResourceContext
{
  readonly owner: HostMessageOwner
  readonly activation: PluginActivationIdentity
  private readonly resolveCurrentActivation: PluginHostResourceRegistryOptions['resolveCurrentActivation']
  private readonly isActive: PluginHostResourceRegistryOptions['isActive']
  private readonly limits: ReturnType<typeof resolveLimits>
  private readonly createResourceId: () => string
  private readonly watchPermissionRevoked?: PluginHostResourceRegistryOptions['watchPermissionRevoked']
  private readonly onFatalViolation?: PluginHostResourceRegistryOptions['onFatalViolation']
  private readonly records = new Map<string, ResourceRecord>()
  private readonly handleRecords = new WeakMap<object, ResourceRecord>()
  private readonly seenIds = new Set<string>()
  private readonly activeDisposals = new Set<Promise<void>>()
  private closed = false
  private closePromise: Promise<void> | null = null
  private fatalReported = false

  constructor(input: PluginHostResourceRegistryOptions) {
    const options = snapshotOptions(
      input,
      ['owner', 'activation', 'resolveCurrentActivation', 'isActive'],
      [
        'maxResources',
        'maxSubscriptions',
        'maxStreams',
        'maxDisposers',
        'maxProcesses',
        'createResourceId',
        'watchPermissionRevoked',
        'onFatalViolation'
      ]
    )
    if (
      typeof options.resolveCurrentActivation !== 'function' ||
      typeof options.isActive !== 'function' ||
      (options.createResourceId !== undefined && typeof options.createResourceId !== 'function') ||
      (options.watchPermissionRevoked !== undefined &&
        typeof options.watchPermissionRevoked !== 'function') ||
      (options.onFatalViolation !== undefined && typeof options.onFatalViolation !== 'function')
    ) {
      invalidOptions()
    }
    this.owner = snapshotOwner(options.owner)
    this.activation = snapshotActivation(options.activation)
    this.resolveCurrentActivation =
      options.resolveCurrentActivation as PluginHostResourceRegistryOptions['resolveCurrentActivation']
    this.isActive = options.isActive as PluginHostResourceRegistryOptions['isActive']
    this.limits = resolveLimits(options)
    const createResourceId = (options.createResourceId as (() => string) | undefined) ?? randomUUID
    this.createResourceId = () => createResourceId.call(input)
    this.watchPermissionRevoked = options.watchPermissionRevoked as
      | PluginHostResourceRegistryOptions['watchPermissionRevoked']
      | undefined
    this.onFatalViolation = options.onFatalViolation as
      | PluginHostResourceRegistryOptions['onFatalViolation']
      | undefined
  }

  get size(): number {
    let size = 0
    for (const record of this.records.values()) if (record.committed && !record.disposed) size += 1
    return size
  }

  register(): never {
    throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_CLOSED')
  }

  beginInvocation(input: InvocationOptions): PluginHostResourceInvocation {
    this.assertCurrent()
    const options = snapshotOptions(input, ['capabilityId'], ['permissionId'])
    if (
      typeof options.capabilityId !== 'string' ||
      !CAPABILITIES.has(options.capabilityId) ||
      (options.permissionId !== undefined &&
        (typeof options.permissionId !== 'string' ||
          options.permissionId.length < 1 ||
          options.permissionId.length > MAX_ID_LENGTH))
    ) {
      invalidOptions()
    }
    const invocationOptions = Object.freeze({
      capabilityId: options.capabilityId as PluginHostCapability,
      ...(options.permissionId === undefined
        ? {}
        : { permissionId: options.permissionId as string })
    })
    const pending = new Set<ResourceRecord>()
    let active = true
    const rollback = async (): Promise<void> => {
      if (!active) return
      active = false
      await Promise.all([...pending].map((record) => this.dropRecord(record)))
      pending.clear()
    }
    const resources: PluginHostCapabilityResourceContext = Object.freeze({
      register: (kind, dispose) => {
        if (!active) throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_CLOSED')
        const record = this.createRecord(invocationOptions, kind, dispose)
        pending.add(record)
        return record.handle
      }
    })
    return Object.freeze({
      resources,
      owns: (value: unknown) =>
        active &&
        Boolean(
          value &&
          typeof value === 'object' &&
          [...pending].some((record) => record.handle === value && !record.disposed)
        ),
      commit: async (result: unknown) => {
        if (!active) throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_CLOSED')
        if (pending.size === 0) {
          active = false
          return
        }
        const retained =
          result && typeof result === 'object' ? this.handleRecords.get(result) : undefined
        if (!retained || !pending.has(retained) || retained.disposed) {
          await rollback()
          throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_UNKNOWN')
        }
        active = false
        for (const record of [...pending]) {
          if (record === retained) continue
          await this.dropRecord(record)
          pending.delete(record)
        }
        if (this.closed || retained.disposed || this.records.get(retained.id) !== retained) {
          await this.dropRecord(retained)
          pending.clear()
          throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_CLOSED')
        }
        retained.committed = true
        pending.clear()
        try {
          this.installPermissionWatcher(retained)
        } catch (error) {
          await this.dropRecord(retained)
          throw error
        }
      },
      rollback
    })
  }

  inspect(value: unknown): HostWireResourceDescriptor | null {
    if (!value || typeof value !== 'object' || !this.isCurrent()) return null
    const record = this.handleRecords.get(value)
    if (!record || !record.committed || record.disposed || this.records.get(record.id) !== record) {
      return null
    }
    return Object.freeze({ id: record.id, kind: record.kind })
  }

  retainCallbacks(handle: unknown, callbackIds: readonly string[]): void {
    const descriptor = this.inspect(handle)
    if (!descriptor || !handle || typeof handle !== 'object' || !Array.isArray(callbackIds)) {
      throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_UNKNOWN')
    }
    const record = this.handleRecords.get(handle)
    if (!record) throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_UNKNOWN')
    for (const id of callbackIds) {
      assertResourceId(id)
      record.callbackIds.add(id)
    }
  }

  async dispose(
    id: string,
    kind: PluginHostResourceKind,
    releaseCallbacks?: CallbackRelease
  ): Promise<void> {
    this.assertCurrent()
    assertResourceId(id)
    if (!RESOURCE_KINDS.has(kind as HostWireResourceKind)) {
      throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_KIND_MISMATCH')
    }
    const record = this.records.get(id)
    if (!record || !record.committed || record.disposed) {
      throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_UNKNOWN')
    }
    if (record.kind !== kind) {
      throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_KIND_MISMATCH')
    }
    await this.dropRecord(record, releaseCallbacks, true)
  }

  close(releaseCallbacks?: CallbackRelease): Promise<void> {
    if (this.closePromise) return this.closePromise
    this.closed = true
    let resolveClose!: () => void
    let rejectClose!: (error: PluginHostResourceError) => void
    this.closePromise = new Promise<void>((resolve, reject) => {
      resolveClose = resolve
      rejectClose = reject
    })
    const records = [...this.records.values()]
    const started = records.map((record) => this.dropRecord(record, releaseCallbacks, true))
    const barriers = new Set([...this.activeDisposals, ...started])
    void Promise.allSettled([...barriers]).then((results) => {
      if (results.some((result) => result.status === 'rejected')) {
        rejectClose(new PluginHostResourceError('PLUGIN_HOST_RESOURCE_DISPOSE_FAILED'))
      } else {
        resolveClose()
      }
    })
    return this.closePromise
  }

  private createRecord(
    invocation: InvocationOptions,
    kind: HostWireResourceKind,
    dispose: ResourceDisposer
  ): ResourceRecord {
    this.assertCurrent()
    if (!RESOURCE_KINDS.has(kind) || typeof dispose !== 'function') invalidOptions()
    if (this.records.size >= this.limits.maxResources) {
      throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_LIMIT')
    }
    const kindLimit =
      kind === 'subscription'
        ? this.limits.maxSubscriptions
        : kind === 'stream'
          ? this.limits.maxStreams
          : kind === 'disposer'
            ? this.limits.maxDisposers
            : this.limits.maxProcesses
    let kindCount = 0
    for (const record of this.records.values()) {
      if (!record.disposed && record.kind === kind) kindCount += 1
    }
    if (kindCount >= kindLimit) {
      throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_KIND_LIMIT')
    }
    let id: unknown
    try {
      id = this.createResourceId()
    } catch {
      invalidOptions()
    }
    assertResourceId(id)
    if (this.seenIds.has(id)) throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_DUPLICATE')
    if (this.seenIds.size >= MAX_TRACKED_RESOURCE_IDS) {
      throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_LIMIT')
    }
    const handle = hostWireResourceHandle(id, kind)
    const record: ResourceRecord = {
      id,
      kind,
      handle,
      dispose,
      capabilityId: invocation.capabilityId,
      ...(invocation.permissionId === undefined ? {} : { permissionId: invocation.permissionId }),
      callbackIds: new Set(),
      committed: false,
      disposed: false,
      permissionDisposer: null,
      disposal: null
    }
    this.seenIds.add(id)
    this.records.set(id, record)
    this.handleRecords.set(handle as object, record)
    return record
  }

  private installPermissionWatcher(record: ResourceRecord): void {
    if (!record.permissionId || !this.watchPermissionRevoked) return
    let revoked = false
    let disposer: unknown
    try {
      disposer = this.watchPermissionRevoked(this.activation.name, record.permissionId, () => {
        revoked = true
        this.failClosed('PLUGIN_HOST_RESOURCE_PERMISSION_REVOKED')
      })
      if (typeof disposer !== 'function') throw new Error()
    } catch {
      this.failClosed('PLUGIN_HOST_RESOURCE_PERMISSION_REVOKED')
      throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_PERMISSION_REVOKED')
    }
    if (revoked || this.closed || record.disposed || this.records.get(record.id) !== record) {
      try {
        disposer()
      } catch {
        // The registration never became authoritative.
      }
      throw new PluginHostResourceError(
        this.closed || record.disposed
          ? 'PLUGIN_HOST_RESOURCE_CLOSED'
          : 'PLUGIN_HOST_RESOURCE_PERMISSION_REVOKED'
      )
    }
    record.permissionDisposer = disposer as () => void
  }

  private dropRecord(
    record: ResourceRecord,
    releaseCallbacks?: CallbackRelease,
    surfaceFailure = false
  ): Promise<void> {
    if (record.disposal) return record.disposal
    if (record.disposed) return Promise.resolve()
    record.disposed = true
    this.records.delete(record.id)
    try {
      record.permissionDisposer?.()
    } catch {
      // Authority is already gone for this resource.
    }
    const callbackIds = [...record.callbackIds]
    record.callbackIds.clear()
    let resolveDisposal!: () => void
    let rejectDisposal!: (error: unknown) => void
    const disposal = new Promise<void>((resolve, reject) => {
      resolveDisposal = resolve
      rejectDisposal = reject
    })
    record.disposal = disposal
    this.activeDisposals.add(disposal)
    void (async (): Promise<void> => {
      if (releaseCallbacks) {
        try {
          await releaseCallbacks(record.id, Object.freeze(callbackIds))
        } catch {
          // Callback release failures cannot preserve native resource authority.
        }
      }
      try {
        await record.dispose()
      } catch {
        if (surfaceFailure) {
          throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_DISPOSE_FAILED')
        }
      }
    })().then(resolveDisposal, rejectDisposal)
    void disposal.then(
      () => this.activeDisposals.delete(disposal),
      () => this.activeDisposals.delete(disposal)
    )
    return disposal
  }

  private isCurrent(): boolean {
    if (this.closed) return false
    try {
      return (
        this.isActive() === true &&
        sameActivation(this.activation, this.resolveCurrentActivation(this.activation.name))
      )
    } catch {
      return false
    }
  }

  private assertCurrent(): void {
    if (this.closed) throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_CLOSED')
    if (!this.isCurrent()) {
      throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_STALE_ACTIVATION')
    }
  }

  private failClosed(code: PluginHostResourceErrorCode): void {
    if (this.closed || this.fatalReported) return
    this.fatalReported = true
    try {
      this.onFatalViolation?.(code)
    } catch {
      // Fatal observers cannot restore resource authority.
    }
  }
}

interface ChildResourceRecord {
  readonly id: string
  readonly kind: HostWireResourceKind
  readonly token: object
  disposed: boolean
}

export interface PluginHostChildResourceClientOptions {
  owner: HostMessageOwner
  session: PluginHostSession
  allocateRequestId: () => number
  postMessage: (message: HostWireMessage) => void
  onFatalViolation: (code: PluginHostViolationCode) => void
  onDisposed?: (id: string) => void
  maxResources?: number
  maxSubscriptions?: number
  maxStreams?: number
  maxDisposers?: number
  maxProcesses?: number
}

export class PluginHostChildResourceClient {
  private readonly owner: HostMessageOwner
  private readonly session: PluginHostSession
  private readonly allocateRequestId: () => number
  private readonly postMessage: (message: HostWireMessage) => void
  private readonly onFatalViolation: (code: PluginHostViolationCode) => void
  private readonly onDisposed?: (id: string) => void
  private readonly limits: ReturnType<typeof resolveLimits>
  private readonly resources = new Map<string, ChildResourceRecord>()
  private readonly disposedKinds = new Map<string, HostWireResourceKind>()
  private readonly tokenDescriptors = new WeakMap<object, HostWireResourceDescriptor>()
  private readonly seenIds = new Set<string>()
  private closed = false
  private fatalReported = false

  constructor(input: PluginHostChildResourceClientOptions) {
    const options = snapshotOptions(
      input,
      ['owner', 'session', 'allocateRequestId', 'postMessage', 'onFatalViolation'],
      [
        'onDisposed',
        'maxResources',
        'maxSubscriptions',
        'maxStreams',
        'maxDisposers',
        'maxProcesses'
      ]
    )
    if (
      typeof options.allocateRequestId !== 'function' ||
      typeof options.postMessage !== 'function' ||
      typeof options.onFatalViolation !== 'function' ||
      (options.onDisposed !== undefined && typeof options.onDisposed !== 'function')
    ) {
      invalidOptions()
    }
    this.owner = snapshotOwner(options.owner)
    if (!(options.session instanceof Object)) invalidOptions()
    this.session = options.session as PluginHostSession
    if (
      this.session.owner.activationHandle !== this.owner.activationHandle ||
      this.session.owner.hostGeneration !== this.owner.hostGeneration
    ) {
      invalidOptions()
    }
    const allocateRequestId = options.allocateRequestId as () => number
    const postMessage = options.postMessage as (message: HostWireMessage) => void
    this.allocateRequestId = () => allocateRequestId.call(input)
    this.postMessage = (message) => postMessage.call(input, message)
    this.onFatalViolation = options.onFatalViolation as (code: PluginHostViolationCode) => void
    this.onDisposed = options.onDisposed as ((id: string) => void) | undefined
    this.limits = resolveLimits(options)
  }

  get size(): number {
    return this.resources.size
  }

  resolve(id: string, kind: PluginHostResourceKind): object {
    if (this.closed) throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_CLOSED')
    assertResourceId(id)
    if (!RESOURCE_KINDS.has(kind as HostWireResourceKind)) {
      throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_KIND_MISMATCH')
    }
    if (this.seenIds.has(id)) throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_DUPLICATE')
    if (
      this.resources.size >= this.limits.maxResources ||
      this.seenIds.size >= MAX_TRACKED_RESOURCE_IDS
    ) {
      throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_LIMIT')
    }
    const resolvedKind = kind as HostWireResourceKind
    const kindLimit =
      resolvedKind === 'subscription'
        ? this.limits.maxSubscriptions
        : resolvedKind === 'stream'
          ? this.limits.maxStreams
          : resolvedKind === 'disposer'
            ? this.limits.maxDisposers
            : this.limits.maxProcesses
    let kindCount = 0
    for (const record of this.resources.values()) if (record.kind === resolvedKind) kindCount += 1
    if (kindCount >= kindLimit) {
      throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_KIND_LIMIT')
    }
    const token = Object.freeze(Object.create(null) as object)
    const descriptor = Object.freeze({ id, kind: resolvedKind })
    const record: ChildResourceRecord = { id, kind: resolvedKind, token, disposed: false }
    this.seenIds.add(id)
    this.resources.set(id, record)
    this.tokenDescriptors.set(token, descriptor)
    return token
  }

  inspect(value: unknown): HostWireResourceDescriptor | null {
    if (!value || typeof value !== 'object') return null
    const descriptor = this.tokenDescriptors.get(value)
    if (!descriptor || !this.resources.has(descriptor.id)) return null
    return descriptor
  }

  async dispose(id: string, kind: HostWireResourceKind): Promise<void> {
    const record = this.resources.get(id)
    if (!record) {
      if (this.disposedKinds.get(id) === kind) return
      this.failProtocol()
      throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_UNKNOWN')
    }
    if (record.kind !== kind) {
      this.failProtocol()
      throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_KIND_MISMATCH')
    }
    this.releaseLocal(record)
    if (this.closed) return
    try {
      const requestId = this.allocateRequestId()
      if (!Number.isSafeInteger(requestId) || requestId < 0) throw new Error()
      const message = this.session.accept('child-to-main', {
        ...this.owner,
        type: 'resource-dispose',
        requestId,
        resourceId: id,
        resourceKind: kind
      })
      this.postMessage(message)
    } catch {
      this.failProtocol()
      throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_DISPOSE_FAILED')
    }
  }

  releaseFromHost(id: string, kind: HostWireResourceKind): void {
    const record = this.resources.get(id)
    if (!record) {
      if (this.disposedKinds.get(id) === kind) return
      this.failProtocol()
      throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_UNKNOWN')
    }
    if (record.kind !== kind) {
      this.failProtocol()
      throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_KIND_MISMATCH')
    }
    this.releaseLocal(record)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    for (const record of [...this.resources.values()]) this.releaseLocal(record)
  }

  private releaseLocal(record: ChildResourceRecord): void {
    if (record.disposed) return
    record.disposed = true
    this.resources.delete(record.id)
    this.disposedKinds.set(record.id, record.kind)
    try {
      this.onDisposed?.(record.id)
    } catch {
      // Child-local release cannot restore the resource handle.
    }
  }

  private failProtocol(): void {
    if (this.fatalReported) return
    this.fatalReported = true
    try {
      this.onFatalViolation('PLUGIN_HOST_VIOLATION_PROTOCOL')
    } catch {
      // Fatal observers cannot keep resource authority alive.
    }
  }
}

export function unavailablePluginHostResourceContext(): PluginHostCapabilityResourceContext {
  return Object.freeze({
    register(): never {
      throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_CLOSED')
    }
  })
}
