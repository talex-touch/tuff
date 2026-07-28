import type { IFeatureLifeCycle, IPluginFeature } from '@talex-touch/utils/plugin'
import type { PluginActivationIdentity, PluginKeyManager } from '@talex-touch/utils/transport'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import {
  PluginHostCapabilityRegistry,
  snapshotPluginHostCapabilityDefinition,
  type PluginHostCapabilityDefinition
} from './plugin-host-capabilities'
import {
  PluginRuntimeHost,
  PluginRuntimeHostError,
  PluginRuntimeHostManager,
  resolvePluginRuntimeHostResourceLimits,
  type PluginRuntimeCapabilityDispatcher,
  type PluginRuntimeCrashDiagnostic,
  type PluginRuntimeHostResourceLimits,
  type PluginRuntimeProcessFactory
} from './plugin-runtime-host'
import type { PluginHostCapability, PluginHostLifecycleMethod } from './plugin-host-wire'

export type PluginRuntimeServiceErrorCode =
  | 'PLUGIN_RUNTIME_SERVICE_INVALID_OPTIONS'
  | 'PLUGIN_RUNTIME_SERVICE_CLOSED'
  | 'PLUGIN_RUNTIME_ACTIVATION_STALE'

export class PluginRuntimeServiceError extends Error {
  constructor(readonly code: PluginRuntimeServiceErrorCode) {
    super(code)
    this.name = 'PluginRuntimeServiceError'
  }
}

export type PluginRuntimeSnapshotValue =
  | null
  | boolean
  | number
  | string
  | readonly PluginRuntimeSnapshotValue[]
  | { readonly [key: string]: PluginRuntimeSnapshotValue }

export interface PluginRuntimeSnapshot {
  readonly platform: string
  readonly arch: string
  readonly manifest: Readonly<Record<string, PluginRuntimeSnapshotValue>>
}

type ItemActionResult = Awaited<ReturnType<NonNullable<IFeatureLifeCycle['onItemAction']>>>

export interface PluginRuntimeLifecycleProxy {
  onMessage(key: string, info: unknown): Promise<void>
  onLaunch(feature: IPluginFeature): Promise<void>
  onFeatureTriggered(
    id: string,
    data: unknown,
    feature: IPluginFeature,
    signal?: AbortSignal
  ): Promise<boolean | void>
  onInputChanged(input: string): Promise<void>
  onActionClick(actionId: string, data?: unknown): Promise<void>
  onClose(feature: IPluginFeature): Promise<void>
  onItemAction(item: unknown, context?: { actionId?: string }): Promise<ItemActionResult>
  onStorageChange(key: string, value: unknown): Promise<void>
}

export interface PluginRuntimeActivationOptions {
  activation: PluginActivationIdentity
  scriptContent: string
  snapshot: PluginRuntimeSnapshot
  closeResources?: () => void | Promise<void>
  onCrash?: (diagnostic: PluginRuntimeCrashDiagnostic) => void
}

export interface PluginRuntimeActivation {
  readonly activation: PluginActivationIdentity
  readonly host: PluginRuntimeHost
  readonly lifecycle: PluginRuntimeLifecycleProxy
}

export interface PluginRuntimeServiceOptions {
  artifactPath: string
  factory: PluginRuntimeProcessFactory
  keyManager: PluginKeyManager
  capabilityDefinitions: readonly PluginHostCapabilityDefinition[]
  authorizeCapability(pluginName: string, permissionId: string): boolean
  watchPermissionRevoked(pluginName: string, permissionId: string, onRevoke: () => void): () => void
  closeResources(activation: PluginActivationIdentity): void | Promise<void>
  resourceLimits?: Partial<PluginRuntimeHostResourceLimits>
  teardownTimeoutMs?: number
  createActivationHandle?: () => string
  createHostGeneration?: () => number
}

interface RuntimeRecord extends PluginRuntimeActivation {
  acceptingWork: boolean
  destroyAttempted: boolean
  stopPromise: Promise<void> | null
}

interface SnapshotActivationOptions {
  activation: PluginActivationIdentity
  scriptContent: string
  snapshot: PluginRuntimeSnapshot
  closeResources?: () => void | Promise<void>
  onCrash?: (diagnostic: PluginRuntimeCrashDiagnostic) => void
}

interface RuntimeKeyManager {
  revokeKey(key: string): boolean
  resolveCurrentIdentity(pluginName: string): PluginActivationIdentity | undefined
}

const DEFAULT_TEARDOWN_TIMEOUT_MS = 2_000
const MAX_TEARDOWN_TIMEOUT_MS = 60_000
const SNAPSHOT_MAX_DEPTH = 32
const SNAPSHOT_MAX_MEMBERS = 10_000
const MAX_ISSUED_ACTIVATIONS = 65_536
const RESOURCE_LIMIT_KEYS = new Set<keyof PluginRuntimeHostResourceLimits>([
  'maxDepth',
  'maxMembers',
  'maxBytes',
  'maxOldSpaceMb',
  'maxPendingRequests',
  'maxTrackedRequestIds',
  'handshakeTimeoutMs',
  'loadTimeoutMs',
  'lifecycleTimeoutMs',
  'shutdownTimeoutMs',
  'cancelGraceMs'
])

function invalidOptions(): never {
  throw new PluginRuntimeServiceError('PLUGIN_RUNTIME_SERVICE_INVALID_OPTIONS')
}

function readDataProperty(input: unknown, key: string, required = true): unknown {
  if (!input || (typeof input !== 'object' && typeof input !== 'function')) invalidOptions()
  let descriptor: PropertyDescriptor | undefined
  try {
    descriptor = Object.getOwnPropertyDescriptor(input, key)
  } catch {
    invalidOptions()
  }
  if (!descriptor) {
    if (required) invalidOptions()
    return undefined
  }
  if (!descriptor.enumerable || !('value' in descriptor)) invalidOptions()
  return descriptor.value
}

function readMethod(input: unknown, key: string): (...args: unknown[]) => unknown {
  if (!input || (typeof input !== 'object' && typeof input !== 'function')) invalidOptions()
  let cursor: object | null = input as object
  try {
    while (cursor) {
      const descriptor = Object.getOwnPropertyDescriptor(cursor, key)
      if (descriptor) {
        if (!('value' in descriptor) || typeof descriptor.value !== 'function') invalidOptions()
        return descriptor.value as (...args: unknown[]) => unknown
      }
      cursor = Object.getPrototypeOf(cursor)
    }
  } catch {
    invalidOptions()
  }
  invalidOptions()
}

function snapshotKeyManager(input: unknown): RuntimeKeyManager {
  const revokeKey = readMethod(input, 'revokeKey')
  const resolveCurrentIdentity = readMethod(input, 'resolveCurrentIdentity')
  return Object.freeze({
    revokeKey: (key: string) => revokeKey.call(input, key) === true,
    resolveCurrentIdentity: (pluginName: string) =>
      resolveCurrentIdentity.call(input, pluginName) as PluginActivationIdentity | undefined
  })
}

function snapshotProcessFactory(input: unknown): PluginRuntimeProcessFactory {
  const artifactExists = readMethod(input, 'artifactExists')
  const spawn = readMethod(input, 'spawn')
  return Object.freeze({
    artifactExists: (artifactPath: string) =>
      artifactExists.call(input, artifactPath) as boolean | Promise<boolean>,
    spawn: (options) =>
      spawn.call(input, options) as ReturnType<PluginRuntimeProcessFactory['spawn']>
  })
}

function snapshotResourceLimits(input: unknown): Readonly<PluginRuntimeHostResourceLimits> {
  if (input === undefined) return resolvePluginRuntimeHostResourceLimits(undefined)
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalidOptions()
  const partial: Partial<PluginRuntimeHostResourceLimits> = {}
  let descriptors: PropertyDescriptorMap
  try {
    descriptors = Object.getOwnPropertyDescriptors(input)
  } catch {
    invalidOptions()
  }
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (
      !RESOURCE_LIMIT_KEYS.has(key as keyof PluginRuntimeHostResourceLimits) ||
      !descriptor.enumerable ||
      !('value' in descriptor)
    ) {
      invalidOptions()
    }
    Object.assign(partial, { [key]: descriptor.value })
  }
  try {
    return resolvePluginRuntimeHostResourceLimits(partial)
  } catch {
    invalidOptions()
  }
}

function snapshotDefinitions(input: unknown): readonly PluginHostCapabilityDefinition[] {
  if (!Array.isArray(input)) invalidOptions()
  const definitions: PluginHostCapabilityDefinition[] = []
  const ids = new Set<PluginHostCapability>()
  for (let index = 0; index < input.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index))
    if (!descriptor?.enumerable || !('value' in descriptor)) invalidOptions()
    let definition: PluginHostCapabilityDefinition
    try {
      definition = snapshotPluginHostCapabilityDefinition(
        descriptor.value as PluginHostCapabilityDefinition
      )
    } catch {
      invalidOptions()
    }
    if (ids.has(definition.id)) invalidOptions()
    ids.add(definition.id)
    definitions.push(definition)
  }
  return Object.freeze(definitions)
}

function sameActivation(left: PluginActivationIdentity, right: PluginActivationIdentity): boolean {
  return (
    left.name === right.name &&
    left.pluginInstanceId === right.pluginInstanceId &&
    left.activationGeneration === right.activationGeneration &&
    left.key === right.key
  )
}

function snapshotActivation(input: PluginActivationIdentity): PluginActivationIdentity {
  const name = readDataProperty(input, 'name')
  const pluginInstanceId = readDataProperty(input, 'pluginInstanceId')
  const activationGeneration = readDataProperty(input, 'activationGeneration')
  const key = readDataProperty(input, 'key')
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

function snapshotValue(
  input: unknown,
  state: { depth: number; members: number; seen: Set<object> }
): PluginRuntimeSnapshotValue {
  if (input === null || typeof input === 'boolean' || typeof input === 'string') return input
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) invalidOptions()
    return input
  }
  if (!input || typeof input !== 'object' || state.depth >= SNAPSHOT_MAX_DEPTH) invalidOptions()
  if (state.seen.has(input)) invalidOptions()
  state.seen.add(input)
  try {
    const descriptors = Object.getOwnPropertyDescriptors(input)
    if (Reflect.ownKeys(descriptors).some((key) => typeof key === 'symbol')) invalidOptions()
    const nextState = { ...state, depth: state.depth + 1 }
    if (Array.isArray(input)) {
      const lengthDescriptor = descriptors.length
      if (!lengthDescriptor || !('value' in lengthDescriptor)) invalidOptions()
      const length = lengthDescriptor.value
      if (!Number.isSafeInteger(length) || length < 0) invalidOptions()
      state.members += length
      if (state.members > SNAPSHOT_MAX_MEMBERS) invalidOptions()
      const result: PluginRuntimeSnapshotValue[] = []
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)]
        if (!descriptor?.enumerable || !('value' in descriptor)) invalidOptions()
        nextState.members = state.members
        const cloned = snapshotValue(descriptor.value, nextState)
        state.members = nextState.members
        result.push(cloned)
      }
      const allowedKeys = new Set(['length', ...result.map((_value, index) => String(index))])
      if (Object.keys(descriptors).some((key) => !allowedKeys.has(key))) invalidOptions()
      return Object.freeze(result)
    }
    const prototype = Object.getPrototypeOf(input)
    if (prototype !== Object.prototype && prototype !== null) invalidOptions()
    const result: Record<string, PluginRuntimeSnapshotValue> = {}
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (
        key === '__proto__' ||
        key === 'prototype' ||
        key === 'constructor' ||
        !descriptor.enumerable ||
        !('value' in descriptor)
      ) {
        invalidOptions()
      }
      state.members += 1
      if (state.members > SNAPSHOT_MAX_MEMBERS) invalidOptions()
      nextState.members = state.members
      const cloned = snapshotValue(descriptor.value, nextState)
      state.members = nextState.members
      result[key] = cloned
    }
    return Object.freeze(result)
  } catch (error) {
    if (error instanceof PluginRuntimeServiceError) throw error
    invalidOptions()
  } finally {
    state.seen.delete(input)
  }
}

function snapshotRuntimeSnapshot(input: unknown): PluginRuntimeSnapshot {
  const platform = readDataProperty(input, 'platform')
  const arch = readDataProperty(input, 'arch')
  const manifest = readDataProperty(input, 'manifest')
  if (
    typeof platform !== 'string' ||
    platform.length < 1 ||
    typeof arch !== 'string' ||
    arch.length < 1
  ) {
    invalidOptions()
  }
  const clonedManifest = snapshotValue(manifest, {
    depth: 0,
    members: 0,
    seen: new Set()
  })
  if (!clonedManifest || typeof clonedManifest !== 'object' || Array.isArray(clonedManifest)) {
    invalidOptions()
  }
  return Object.freeze({
    platform,
    arch,
    manifest: clonedManifest as Readonly<Record<string, PluginRuntimeSnapshotValue>>
  })
}

function snapshotActivationOptions(
  input: PluginRuntimeActivationOptions
): SnapshotActivationOptions {
  const activation = snapshotActivation(
    readDataProperty(input, 'activation') as PluginActivationIdentity
  )
  const scriptContent = readDataProperty(input, 'scriptContent')
  const snapshot = snapshotRuntimeSnapshot(readDataProperty(input, 'snapshot'))
  const closeResources = readDataProperty(input, 'closeResources', false)
  const onCrash = readDataProperty(input, 'onCrash', false)
  if (
    typeof scriptContent !== 'string' ||
    (closeResources !== undefined && typeof closeResources !== 'function') ||
    (onCrash !== undefined && typeof onCrash !== 'function')
  ) {
    invalidOptions()
  }
  return Object.freeze({
    activation,
    scriptContent,
    snapshot,
    ...(closeResources === undefined
      ? {}
      : { closeResources: closeResources as () => void | Promise<void> }),
    ...(onCrash === undefined
      ? {}
      : { onCrash: onCrash as (diagnostic: PluginRuntimeCrashDiagnostic) => void })
  })
}

function safeCall(callback: () => void | Promise<void>): Promise<void> {
  try {
    return Promise.resolve(callback()).catch(() => undefined)
  } catch {
    return Promise.resolve()
  }
}

export function resolvePluginRuntimeArtifactPath(): string {
  return path.join(__dirname, 'plugin-host.js')
}

export class PluginRuntimeService {
  private readonly artifactPath: string
  private readonly factory: PluginRuntimeProcessFactory
  private readonly keyManager: RuntimeKeyManager
  private readonly capabilityDefinitions: readonly PluginHostCapabilityDefinition[]
  private readonly capabilityManifest: readonly PluginHostCapability[]
  private readonly authorizeCapability: PluginRuntimeServiceOptions['authorizeCapability']
  private readonly watchPermissionRevoked: PluginRuntimeServiceOptions['watchPermissionRevoked']
  private readonly closeResources: PluginRuntimeServiceOptions['closeResources']
  private readonly resourceLimits: Readonly<PluginRuntimeHostResourceLimits>
  private readonly teardownTimeoutMs: number
  private readonly createActivationHandle: () => string
  private readonly createHostGeneration: () => number
  private readonly manager = new PluginRuntimeHostManager()
  private readonly records = new Map<string, RuntimeRecord>()
  private readonly operations = new Map<string, Promise<unknown>>()
  private readonly issuedActivationHandles = new Set<string>()
  private stopAllPromise: Promise<void> | null = null
  private disposed = false
  private stopping = false
  private lastIssuedHostGeneration = 0

  constructor(options: PluginRuntimeServiceOptions) {
    let artifactPath: unknown
    let factory: unknown
    let keyManager: unknown
    let capabilityDefinitions: unknown
    let authorizeCapability: unknown
    let watchPermissionRevoked: unknown
    let closeResources: unknown
    let resourceLimits: unknown
    let teardownTimeoutMs: unknown
    let createActivationHandle: unknown
    let createHostGeneration: unknown
    try {
      artifactPath = readDataProperty(options, 'artifactPath')
      factory = readDataProperty(options, 'factory')
      keyManager = readDataProperty(options, 'keyManager')
      capabilityDefinitions = readDataProperty(options, 'capabilityDefinitions')
      authorizeCapability = readDataProperty(options, 'authorizeCapability')
      watchPermissionRevoked = readDataProperty(options, 'watchPermissionRevoked')
      closeResources = readDataProperty(options, 'closeResources')
      resourceLimits = readDataProperty(options, 'resourceLimits', false)
      teardownTimeoutMs =
        readDataProperty(options, 'teardownTimeoutMs', false) ?? DEFAULT_TEARDOWN_TIMEOUT_MS
      createActivationHandle = readDataProperty(options, 'createActivationHandle', false)
      createHostGeneration = readDataProperty(options, 'createHostGeneration', false)
    } catch {
      invalidOptions()
    }

    if (
      typeof artifactPath !== 'string' ||
      artifactPath.length < 1 ||
      typeof authorizeCapability !== 'function' ||
      typeof watchPermissionRevoked !== 'function' ||
      typeof closeResources !== 'function' ||
      !Number.isSafeInteger(teardownTimeoutMs) ||
      Number(teardownTimeoutMs) < 1 ||
      Number(teardownTimeoutMs) > MAX_TEARDOWN_TIMEOUT_MS ||
      (createActivationHandle !== undefined && typeof createActivationHandle !== 'function') ||
      (createHostGeneration !== undefined && typeof createHostGeneration !== 'function')
    ) {
      invalidOptions()
    }

    this.artifactPath = artifactPath
    this.factory = snapshotProcessFactory(factory)
    this.keyManager = snapshotKeyManager(keyManager)
    this.capabilityDefinitions = snapshotDefinitions(capabilityDefinitions)
    this.capabilityManifest = Object.freeze(
      this.capabilityDefinitions.map((definition) => definition.id)
    )
    this.authorizeCapability =
      authorizeCapability as PluginRuntimeServiceOptions['authorizeCapability']
    this.watchPermissionRevoked =
      watchPermissionRevoked as PluginRuntimeServiceOptions['watchPermissionRevoked']
    this.closeResources = closeResources as PluginRuntimeServiceOptions['closeResources']
    this.resourceLimits = snapshotResourceLimits(resourceLimits)
    this.teardownTimeoutMs = Number(teardownTimeoutMs)
    this.createActivationHandle =
      (createActivationHandle as (() => string) | undefined) ?? randomUUID
    this.createHostGeneration =
      (createHostGeneration as (() => number) | undefined) ??
      (() => this.lastIssuedHostGeneration + 1)
  }

  startActivation(options: PluginRuntimeActivationOptions): Promise<PluginRuntimeActivation> {
    let snapshot: SnapshotActivationOptions
    try {
      snapshot = snapshotActivationOptions(options)
    } catch (error) {
      return Promise.reject(
        error instanceof PluginRuntimeServiceError
          ? error
          : new PluginRuntimeServiceError('PLUGIN_RUNTIME_SERVICE_INVALID_OPTIONS')
      )
    }
    return this.enqueue(snapshot.activation.name, () => this.startActivationNow(snapshot))
  }

  resolve(activation: PluginActivationIdentity): PluginRuntimeHost | undefined {
    try {
      return this.manager.resolve(snapshotActivation(activation))
    } catch {
      return undefined
    }
  }

  stopActivation(
    activation: PluginActivationIdentity,
    options: { runDestroy?: boolean } = {}
  ): Promise<void> {
    let expected: PluginActivationIdentity
    let runDestroy: boolean
    try {
      expected = snapshotActivation(activation)
      const requested = readDataProperty(options, 'runDestroy', false)
      if (requested !== undefined && typeof requested !== 'boolean') invalidOptions()
      runDestroy = requested !== false
    } catch (error) {
      return Promise.reject(
        error instanceof PluginRuntimeServiceError
          ? error
          : new PluginRuntimeServiceError('PLUGIN_RUNTIME_SERVICE_INVALID_OPTIONS')
      )
    }
    return this.enqueue(expected.name, async () => {
      const record = this.records.get(expected.name)
      if (!record || !sameActivation(record.activation, expected)) return
      await this.stopRecord(record, runDestroy)
    })
  }

  stopPlugin(pluginName: string, options: { runDestroy?: boolean } = {}): Promise<void> {
    if (typeof pluginName !== 'string' || pluginName.length < 1) {
      return Promise.reject(new PluginRuntimeServiceError('PLUGIN_RUNTIME_SERVICE_INVALID_OPTIONS'))
    }
    let runDestroy: boolean
    try {
      const requested = readDataProperty(options, 'runDestroy', false)
      if (requested !== undefined && typeof requested !== 'boolean') invalidOptions()
      runDestroy = requested !== false
    } catch (error) {
      return Promise.reject(
        error instanceof PluginRuntimeServiceError
          ? error
          : new PluginRuntimeServiceError('PLUGIN_RUNTIME_SERVICE_INVALID_OPTIONS')
      )
    }
    return this.enqueue(pluginName, async () => {
      const record = this.records.get(pluginName)
      if (!record) {
        await this.manager.stopPlugin(pluginName)
        return
      }
      await this.stopRecord(record, runDestroy)
    })
  }

  stopAll(): Promise<void> {
    if (this.stopAllPromise) return this.stopAllPromise
    this.stopping = true
    this.stopAllPromise = Promise.resolve().then(async () => {
      while (true) {
        const activeOperations = [...this.operations.values()]
        if (activeOperations.length > 0) await Promise.allSettled(activeOperations)

        const records = [...this.records.values()]
        if (records.length > 0) {
          await Promise.all(records.map((record) => this.stopRecord(record, true)))
        }
        await this.manager.stopAll()
        await Promise.resolve()
        if (this.operations.size === 0 && this.records.size === 0) return
      }
    })
    return this.stopAllPromise
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      await this.stopAllPromise
      return
    }
    this.disposed = true
    await this.stopAll()
  }

  private async startActivationNow(
    options: SnapshotActivationOptions
  ): Promise<PluginRuntimeActivation> {
    const activation = options.activation
    if (this.disposed || this.stopping) {
      throw new PluginRuntimeServiceError('PLUGIN_RUNTIME_SERVICE_CLOSED')
    }
    this.assertCurrentActivation(activation)

    const previous = this.records.get(activation.name)
    if (previous && sameActivation(previous.activation, activation)) {
      throw new PluginRuntimeServiceError('PLUGIN_RUNTIME_ACTIVATION_STALE')
    }
    if (previous) await this.stopRecord(previous, previous.host.state === 'active')
    this.assertCurrentActivation(activation)

    let activationHandle: unknown
    let hostGeneration: unknown
    try {
      activationHandle = this.createActivationHandle()
      hostGeneration = this.createHostGeneration()
    } catch {
      throw new PluginRuntimeServiceError('PLUGIN_RUNTIME_SERVICE_INVALID_OPTIONS')
    }
    if (
      typeof activationHandle !== 'string' ||
      activationHandle.length < 1 ||
      activationHandle.length > 128 ||
      !Number.isSafeInteger(hostGeneration) ||
      Number(hostGeneration) < 1 ||
      Number(hostGeneration) <= this.lastIssuedHostGeneration ||
      this.issuedActivationHandles.size >= MAX_ISSUED_ACTIVATIONS ||
      this.issuedActivationHandles.has(activationHandle)
    ) {
      throw new PluginRuntimeServiceError('PLUGIN_RUNTIME_SERVICE_INVALID_OPTIONS')
    }
    const resolvedHostGeneration = Number(hostGeneration)
    this.lastIssuedHostGeneration = resolvedHostGeneration
    this.issuedActivationHandles.add(activationHandle)

    let host!: PluginRuntimeHost
    let record!: RuntimeRecord
    let dispatcher: PluginRuntimeCapabilityDispatcher | undefined
    let ownsCapabilityDispatcher = false
    let crashReported = false
    const reportCrash = (): void => {
      if (crashReported) return
      crashReported = true
      try {
        options.onCrash?.({
          code: 'PLUGIN_RUNTIME_HOST_CRASHED',
          pluginName: activation.name,
          activationGeneration: activation.activationGeneration
        })
      } catch {
        // Crash observers cannot restore authority or expose native errors.
      }
    }
    const stopAndReportCrash = (): void => {
      const stopping = this.manager.stopPlugin(activation.name)
      void stopping.then(reportCrash, reportCrash)
    }

    if (this.capabilityDefinitions.length > 0) {
      const registry = new PluginHostCapabilityRegistry({
        owner: {
          protocolVersion: 2,
          activationHandle,
          hostGeneration: resolvedHostGeneration
        },
        activation,
        resolveCurrentActivation: (pluginName) =>
          this.keyManager.resolveCurrentIdentity(pluginName),
        authorize: this.authorizeCapability,
        watchPermissionRevoked: this.watchPermissionRevoked,
        isActive: () =>
          Boolean(record) &&
          this.records.get(activation.name) === record &&
          (host.state === 'starting' || host.state === 'active'),
        onFatalViolation: () => {
          if (!record || this.records.get(activation.name) !== record) {
            void host.stop()
            return
          }
          record.acceptingWork = false
          this.records.delete(activation.name)
          stopAndReportCrash()
        }
      })
      for (const definition of this.capabilityDefinitions) registry.register(definition)
      dispatcher = registry
      ownsCapabilityDispatcher = true
    }

    host = new PluginRuntimeHost({
      activation,
      activationHandle,
      hostGeneration: resolvedHostGeneration,
      artifactPath: this.artifactPath,
      factory: this.factory,
      resourceLimits: this.resourceLimits,
      invalidateAuthority: () => {
        this.keyManager.revokeKey(activation.key)
      },
      closeResources: async () => {
        await safeCall(() => this.closeResources(activation))
        if (options.closeResources) await safeCall(options.closeResources)
      },
      capabilityDispatcher: dispatcher,
      ownsCapabilityDispatcher,
      onCrash: () => {
        if (this.records.get(activation.name) !== record) return
        record.acceptingWork = false
        this.records.delete(activation.name)
        void this.manager.stopPlugin(activation.name)
        reportCrash()
      },
      onTerminated: () => {
        if (this.records.get(activation.name) !== record || !record.acceptingWork) {
          return
        }
        record.acceptingWork = false
        this.records.delete(activation.name)
        stopAndReportCrash()
      }
    })

    const lifecycle = this.createLifecycleProxy(activation)
    record = {
      activation,
      host,
      lifecycle,
      acceptingWork: false,
      destroyAttempted: false,
      stopPromise: null
    }
    this.records.set(activation.name, record)

    try {
      this.assertCurrentActivation(activation)
      await this.manager.replace(host)
      this.assertCurrentActivation(activation)
      await host.start({
        loadPayload: {
          scriptContent: options.scriptContent,
          snapshot: options.snapshot,
          capabilityManifest: this.capabilityManifest
        },
        initialize: true,
        initPayload: []
      })
      if (
        this.disposed ||
        this.stopping ||
        !this.isCurrentActivation(activation) ||
        this.records.get(activation.name) !== record ||
        this.manager.resolve(activation) !== host
      ) {
        throw new PluginRuntimeServiceError(
          this.disposed || this.stopping
            ? 'PLUGIN_RUNTIME_SERVICE_CLOSED'
            : 'PLUGIN_RUNTIME_ACTIVATION_STALE'
        )
      }
      record.acceptingWork = true
      return Object.freeze({ activation, host, lifecycle })
    } catch (error) {
      record.acceptingWork = false
      if (this.records.get(activation.name) === record) this.records.delete(activation.name)
      await this.manager.stopPlugin(activation.name)
      throw error
    }
  }

  private createLifecycleProxy(activation: PluginActivationIdentity): PluginRuntimeLifecycleProxy {
    const call = (
      method: PluginHostLifecycleMethod,
      payload: unknown[],
      signal?: AbortSignal
    ): Promise<unknown> => this.callLifecycle(activation, method, payload, signal)
    const callVoid = async (
      method: PluginHostLifecycleMethod,
      payload: unknown[],
      signal?: AbortSignal
    ): Promise<void> => {
      await call(method, payload, signal)
    }

    return Object.freeze({
      onMessage: (key, info) => callVoid('onMessage', [key, info]),
      onLaunch: (feature) => callVoid('onLaunch', [feature]),
      onFeatureTriggered: async (id, data, feature, signal) =>
        (await call('onFeatureTriggered', [id, data, feature], signal)) as boolean | void,
      onInputChanged: (input) => callVoid('onInputChanged', [input]),
      onActionClick: (actionId, data) => callVoid('onActionClick', [actionId, data]),
      onClose: (feature) => callVoid('onClose', [feature]),
      onItemAction: async (item, context) =>
        (await call('onItemAction', [item, context])) as ItemActionResult,
      onStorageChange: (key, value) => callVoid('onStorageChange', [key, value])
    })
  }

  private callLifecycle(
    activation: PluginActivationIdentity,
    method: PluginHostLifecycleMethod,
    payload: unknown[],
    signal?: AbortSignal
  ): Promise<unknown> {
    const record = this.records.get(activation.name)
    const current = this.manager.resolve(activation)
    if (
      !record ||
      !record.acceptingWork ||
      !sameActivation(record.activation, activation) ||
      current !== record.host
    ) {
      return Promise.reject(new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INACTIVE'))
    }
    return current.callLifecycle(method, payload, { signal })
  }

  private isCurrentActivation(activation: PluginActivationIdentity): boolean {
    try {
      const current = this.keyManager.resolveCurrentIdentity(activation.name)
      return Boolean(current && sameActivation(activation, snapshotActivation(current)))
    } catch {
      return false
    }
  }

  private assertCurrentActivation(activation: PluginActivationIdentity): void {
    if (!this.isCurrentActivation(activation)) {
      throw new PluginRuntimeServiceError('PLUGIN_RUNTIME_ACTIVATION_STALE')
    }
  }

  private stopRecord(record: RuntimeRecord, runDestroy: boolean): Promise<void> {
    if (record.stopPromise) return record.stopPromise
    record.acceptingWork = false
    record.stopPromise = Promise.resolve().then(async () => {
      if (runDestroy && !record.destroyAttempted && record.host.state === 'active') {
        record.destroyAttempted = true
        try {
          await record.host.callLifecycle('onDestroy', [], {
            timeoutMs: this.teardownTimeoutMs
          })
        } catch {
          // Teardown is bounded; authority revocation and process exit still follow.
        }
      }
      if (this.records.get(record.activation.name) === record) {
        this.records.delete(record.activation.name)
      }
      await this.manager.stopPlugin(record.activation.name)
    })
    return record.stopPromise
  }

  private enqueue<T>(pluginName: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.operations.get(pluginName) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(operation)
    this.operations.set(pluginName, next)
    void next.then(
      () => {
        if (this.operations.get(pluginName) === next) this.operations.delete(pluginName)
      },
      () => {
        if (this.operations.get(pluginName) === next) this.operations.delete(pluginName)
      }
    )
    return next
  }
}
