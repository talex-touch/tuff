import { randomUUID } from 'node:crypto'
import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import {
  PluginHostCapabilityError,
  type PluginHostCapabilityErrorCode
} from './plugin-host-capabilities'
import { PluginHostCallbackError, PluginHostCallbackRegistry } from './plugin-host-callbacks'
import { PluginHostResourceError, type PluginHostResourceDispatcher } from './plugin-host-resources'
import {
  encodeHostWireValue,
  type HostWireLimits,
  type HostWireResourceDescriptor
} from './plugin-host-wire-codec'
import {
  PluginHostSession,
  type PluginHostPendingRequest,
  type PluginHostSessionError,
  type PluginHostSessionState
} from './plugin-host-session'
import {
  HOST_PROTOCOL_VERSION,
  type HostMessageOwner,
  type HostWireMessage,
  type PluginHostCallbackLifetime,
  type PluginHostCapability,
  type PluginHostLifecycleMethod,
  type StableHostError
} from './plugin-host-wire'

export type PluginRuntimeHostState =
  | 'created'
  | 'starting'
  | 'active'
  | 'stopping'
  | 'closed'
  | 'failed'
  | 'crashed'

export type PluginRuntimeHostErrorCode =
  | 'PLUGIN_RUNTIME_HOST_INVALID_OPTIONS'
  | 'PLUGIN_RUNTIME_HOST_ARTIFACT_UNAVAILABLE'
  | 'PLUGIN_RUNTIME_HOST_SPAWN_FAILED'
  | 'PLUGIN_RUNTIME_HOST_INACTIVE'
  | 'PLUGIN_RUNTIME_HOST_PROTOCOL_VIOLATION'
  | 'PLUGIN_RUNTIME_HOST_LOAD_FAILED'
  | 'PLUGIN_RUNTIME_HOST_LIFECYCLE_FAILED'
  | 'PLUGIN_RUNTIME_HOST_TIMEOUT'
  | 'PLUGIN_RUNTIME_HOST_CANCELLED'
  | 'PLUGIN_RUNTIME_HOST_CRASHED'
  | 'PLUGIN_RUNTIME_HOST_CLEANUP_FAILED'
  | 'PLUGIN_RUNTIME_HOST_CLOSED'

export type PluginRuntimeTerminationCode = Extract<
  PluginRuntimeHostErrorCode,
  'PLUGIN_RUNTIME_HOST_PROTOCOL_VIOLATION' | 'PLUGIN_RUNTIME_HOST_TIMEOUT'
>

export class PluginRuntimeHostError extends Error {
  constructor(readonly code: PluginRuntimeHostErrorCode) {
    super(code)
    this.name = 'PluginRuntimeHostError'
  }
}

export interface PluginRuntimeHostResourceLimits extends HostWireLimits {
  maxOldSpaceMb: number
  maxPendingRequests: number
  maxTrackedRequestIds: number
  handshakeTimeoutMs: number
  loadTimeoutMs: number
  lifecycleTimeoutMs: number
  heartbeatIntervalMs: number
  heartbeatTimeoutMs: number
  shutdownTimeoutMs: number
  cancelGraceMs: number
  callbackTimeoutMs: number
  maxCallbacks: number
  maxConcurrentCallbacks: number
  maxResources: number
}

export const DEFAULT_PLUGIN_RUNTIME_HOST_LIMITS: Readonly<PluginRuntimeHostResourceLimits> =
  Object.freeze({
    maxDepth: 32,
    maxMembers: 10_000,
    maxBytes: 1024 * 1024,
    maxOldSpaceMb: 128,
    maxPendingRequests: 32,
    maxTrackedRequestIds: 65_536,
    handshakeTimeoutMs: 10_000,
    loadTimeoutMs: 10_000,
    lifecycleTimeoutMs: 60_000,
    heartbeatIntervalMs: 2_000,
    heartbeatTimeoutMs: 5_000,
    shutdownTimeoutMs: 2_000,
    cancelGraceMs: 500,
    callbackTimeoutMs: 5_000,
    maxCallbacks: 64,
    maxConcurrentCallbacks: 16,
    maxResources: 64
  })

export interface PluginRuntimeControlPortAdapter {
  postMessage(message: unknown): void
  onMessage(listener: (message: unknown) => void): () => void
  start(): void
  close(): void
}

export interface PluginRuntimeChildAdapter {
  readonly processId?: number
  transferControlPort(port: unknown): void | Promise<void>
  /** The exit event is the termination barrier; forceKill only requests termination. */
  onExit(listener: () => void): () => void
  forceKill(): Promise<void>
}

export interface PluginRuntimeSpawnResult {
  child: PluginRuntimeChildAdapter
  controlPort: PluginRuntimeControlPortAdapter
  childPort: unknown
}

export interface PluginRuntimeProcessFactory {
  artifactExists(artifactPath: string): boolean | Promise<boolean>
  spawn(options: {
    artifactPath: string
    resourceLimits: Readonly<PluginRuntimeHostResourceLimits>
  }): PluginRuntimeSpawnResult | Promise<PluginRuntimeSpawnResult>
}

export interface PluginRuntimeCrashDiagnostic {
  code: 'PLUGIN_RUNTIME_HOST_CRASHED'
  pluginName: string
  activationGeneration: number
}

export interface PluginRuntimeTerminationDiagnostic {
  code: PluginRuntimeTerminationCode
  pluginName: string
  activationGeneration: number
}

export interface PluginRuntimeCapabilityDispatcher {
  readonly owner: HostMessageOwner
  readonly activation: PluginActivationIdentity
  dispatch(
    capability: PluginHostCapability,
    payload: unknown,
    signal: AbortSignal
  ): Promise<unknown>
  getCallbackLifetime?(capability: PluginHostCapability): PluginHostCallbackLifetime
  close?(): void | Promise<void>
}

export interface PluginRuntimeHostOptions {
  activation: PluginActivationIdentity
  activationHandle: string
  hostGeneration: number
  artifactPath: string
  factory: PluginRuntimeProcessFactory
  resourceLimits?: Partial<PluginRuntimeHostResourceLimits>
  invalidateAuthority: () => void | Promise<void>
  closeResources: () => void | Promise<void>
  resolveCurrentActivation?: (pluginName: string) => PluginActivationIdentity | undefined
  capabilityDispatcher?: PluginRuntimeCapabilityDispatcher
  ownsCapabilityDispatcher?: boolean
  resourceDispatcher?: PluginHostResourceDispatcher
  ownsResourceDispatcher?: boolean
  onCrash?: (diagnostic: PluginRuntimeCrashDiagnostic) => void
  onTerminated?: (diagnostic: PluginRuntimeTerminationDiagnostic) => void
  createNonce?: () => string
}

export interface PluginRuntimeStartOptions {
  loadPayload: unknown
  initialize?: boolean
  initPayload?: unknown
}

interface RuntimePendingRequest {
  readonly requestId: number
  readonly expectedType: HostWireMessage['type']
  readonly resolve: (message: HostWireMessage) => void
  readonly reject: (error: PluginRuntimeHostError) => void
  timer: NodeJS.Timeout | null
  signal: AbortSignal | undefined
  abortListener: (() => void) | null
  posted: boolean
  queuedCancellation: RuntimeCancellationGrace['code'] | null
}

interface RuntimeInboundCapability {
  readonly requestId: number
  readonly controller: AbortController
  readonly callbackLifetime: PluginHostCallbackLifetime
  cancelled: boolean
}

interface RuntimeCancellationGrace {
  readonly code: Extract<
    PluginRuntimeHostErrorCode,
    'PLUGIN_RUNTIME_HOST_TIMEOUT' | 'PLUGIN_RUNTIME_HOST_CANCELLED'
  >
  readonly timer: NodeJS.Timeout
}

export class PluginRuntimeCallbackError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'PluginRuntimeCallbackError'
  }
}

interface CleanupOptions {
  finalState: Extract<PluginRuntimeHostState, 'closed' | 'failed' | 'crashed'>
  graceful: boolean
  reportCrash?: boolean
  terminationCode?: PluginRuntimeTerminationCode
}

const MAX_LIMIT = 2 ** 31 - 1

function snapshotActivation(input: PluginActivationIdentity): PluginActivationIdentity {
  let descriptors: PropertyDescriptorMap
  try {
    if (!input || typeof input !== 'object') {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
    }
    descriptors = Object.getOwnPropertyDescriptors(input)
  } catch {
    throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
  }
  const read = (key: keyof PluginActivationIdentity): unknown => {
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
    }
    return descriptor.value
  }
  const name = read('name')
  const pluginInstanceId = read('pluginInstanceId')
  const activationGeneration = read('activationGeneration')
  const key = read('key')
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
    throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
  }
  return Object.freeze({
    name,
    pluginInstanceId,
    activationGeneration: Number(activationGeneration),
    key
  })
}

export function resolvePluginRuntimeHostResourceLimits(
  partial: Partial<PluginRuntimeHostResourceLimits> | undefined
): Readonly<PluginRuntimeHostResourceLimits> {
  const limits = { ...DEFAULT_PLUGIN_RUNTIME_HOST_LIMITS }
  if (partial !== undefined) {
    let descriptors: PropertyDescriptorMap
    try {
      if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
        throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
      }
      descriptors = Object.getOwnPropertyDescriptors(partial)
    } catch {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
    }
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key]
      if (
        typeof key !== 'string' ||
        !Object.hasOwn(DEFAULT_PLUGIN_RUNTIME_HOST_LIMITS, key) ||
        !descriptor?.enumerable ||
        !('value' in descriptor)
      ) {
        throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
      }
      Object.assign(limits, { [key]: descriptor.value })
    }
  }
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_LIMIT) {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
    }
  }
  if (
    limits.maxPendingRequests > 32 ||
    limits.maxTrackedRequestIds > 65_536 ||
    limits.maxCallbacks > 64 ||
    limits.maxConcurrentCallbacks > 16 ||
    limits.maxResources > 64
  ) {
    throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
  }
  return Object.freeze(limits)
}

function snapshotProcessFactory(value: unknown): PluginRuntimeProcessFactory {
  try {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
    }
    const factory = value as PluginRuntimeProcessFactory
    const artifactExists = factory.artifactExists
    const spawn = factory.spawn
    if (typeof artifactExists !== 'function' || typeof spawn !== 'function') {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
    }
    return Object.freeze({
      artifactExists: (artifactPath) => artifactExists.call(factory, artifactPath),
      spawn: (options) => spawn.call(factory, options)
    })
  } catch {
    throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
  }
}

function sameOwner(left: HostMessageOwner, right: HostMessageOwner): boolean {
  return (
    left.protocolVersion === right.protocolVersion &&
    left.activationHandle === right.activationHandle &&
    left.hostGeneration === right.hostGeneration
  )
}

function snapshotCapabilityDispatcher(
  value: unknown,
  expectedOwner: HostMessageOwner,
  expectedActivation: PluginActivationIdentity
): PluginRuntimeCapabilityDispatcher | null {
  if (value === undefined) return null
  try {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
    }
    const dispatcher = value as PluginRuntimeCapabilityDispatcher
    const owner = Object.freeze({
      protocolVersion: dispatcher.owner.protocolVersion,
      activationHandle: dispatcher.owner.activationHandle,
      hostGeneration: dispatcher.owner.hostGeneration
    }) as HostMessageOwner
    const activation = snapshotActivation(dispatcher.activation)
    const dispatch = dispatcher.dispatch
    const getCallbackLifetime = dispatcher.getCallbackLifetime
    const close = dispatcher.close
    if (
      !sameOwner(owner, expectedOwner) ||
      !sameActivation(activation, expectedActivation) ||
      typeof dispatch !== 'function' ||
      (getCallbackLifetime !== undefined && typeof getCallbackLifetime !== 'function') ||
      (close !== undefined && typeof close !== 'function')
    ) {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
    }
    return Object.freeze({
      owner: expectedOwner,
      activation: expectedActivation,
      dispatch: (capability, payload, signal) =>
        Promise.resolve(dispatch.call(dispatcher, capability, payload, signal)),
      ...(getCallbackLifetime
        ? {
            getCallbackLifetime: (capability: PluginHostCapability) => {
              const lifetime = getCallbackLifetime.call(dispatcher, capability)
              return lifetime === 'resource' ? 'resource' : 'transient'
            }
          }
        : {}),
      ...(close ? { close: () => Promise.resolve(close.call(dispatcher)) } : {})
    })
  } catch {
    throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
  }
}

function snapshotResourceDispatcher(
  value: unknown,
  expectedOwner: HostMessageOwner,
  expectedActivation: PluginActivationIdentity
): PluginHostResourceDispatcher | null {
  if (value === undefined) return null
  try {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
    }
    const dispatcher = value as PluginHostResourceDispatcher
    const owner = Object.freeze({
      protocolVersion: dispatcher.owner.protocolVersion,
      activationHandle: dispatcher.owner.activationHandle,
      hostGeneration: dispatcher.owner.hostGeneration
    }) as HostMessageOwner
    const activation = snapshotActivation(dispatcher.activation)
    const beginInvocation = dispatcher.beginInvocation
    const dispose = dispatcher.dispose
    const inspect = dispatcher.inspect
    const retainCallbacks = dispatcher.retainCallbacks
    const close = dispatcher.close
    if (
      !sameOwner(owner, expectedOwner) ||
      !sameActivation(activation, expectedActivation) ||
      typeof beginInvocation !== 'function' ||
      typeof dispose !== 'function' ||
      typeof inspect !== 'function' ||
      typeof retainCallbacks !== 'function' ||
      typeof close !== 'function'
    ) {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
    }
    return Object.freeze({
      owner: expectedOwner,
      activation: expectedActivation,
      beginInvocation: (options) => beginInvocation.call(dispatcher, options),
      dispose: (id, kind, releaseCallbacks) =>
        Promise.resolve(dispose.call(dispatcher, id, kind, releaseCallbacks)),
      inspect: (input) => inspect.call(dispatcher, input),
      retainCallbacks: (handle, callbackIds) =>
        retainCallbacks.call(dispatcher, handle, callbackIds),
      close: (releaseCallbacks) => Promise.resolve(close.call(dispatcher, releaseCallbacks))
    })
  } catch {
    throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
  }
}

function isUsableChildAdapter(value: unknown): value is PluginRuntimeChildAdapter {
  try {
    return Boolean(
      value &&
      typeof value === 'object' &&
      typeof (value as PluginRuntimeChildAdapter).transferControlPort === 'function' &&
      typeof (value as PluginRuntimeChildAdapter).onExit === 'function' &&
      typeof (value as PluginRuntimeChildAdapter).forceKill === 'function'
    )
  } catch {
    return false
  }
}

function isUsableControlPortAdapter(value: unknown): value is PluginRuntimeControlPortAdapter {
  try {
    return Boolean(
      value &&
      typeof value === 'object' &&
      typeof (value as PluginRuntimeControlPortAdapter).postMessage === 'function' &&
      typeof (value as PluginRuntimeControlPortAdapter).onMessage === 'function' &&
      typeof (value as PluginRuntimeControlPortAdapter).start === 'function' &&
      typeof (value as PluginRuntimeControlPortAdapter).close === 'function'
    )
  } catch {
    return false
  }
}

function readSpawnAdapter(
  spawned: PluginRuntimeSpawnResult,
  key: keyof PluginRuntimeSpawnResult
): unknown {
  try {
    return spawned?.[key]
  } catch {
    return undefined
  }
}

function closeRejectedControlPort(value: unknown): void {
  try {
    if (value && typeof value === 'object') {
      const close = (value as { close?: unknown }).close
      if (typeof close === 'function') close.call(value)
    }
  } catch {
    // A malformed factory result has no stronger cleanup contract available.
  }
}

async function terminateRejectedChild(value: unknown): Promise<void> {
  try {
    if (value && typeof value === 'object') {
      const forceKill = (value as { forceKill?: unknown }).forceKill
      if (typeof forceKill === 'function') {
        await Promise.resolve(forceKill.call(value)).catch(() => undefined)
      }
    }
  } catch {
    // A malformed factory result has no observable exit barrier available.
  }
}

function stableCapabilityError(error: unknown): StableHostError {
  const code: PluginHostCapabilityErrorCode =
    error instanceof PluginHostCapabilityError
      ? error.code
      : 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'
  return Object.freeze({ code })
}

function sameActivation(left: PluginActivationIdentity, right: PluginActivationIdentity): boolean {
  return (
    left.name === right.name &&
    left.pluginInstanceId === right.pluginInstanceId &&
    left.activationGeneration === right.activationGeneration &&
    left.key === right.key
  )
}

function safeInvoke(callback: () => void | Promise<void>): Promise<void> {
  try {
    return Promise.resolve(callback()).catch(() => undefined)
  } catch {
    return Promise.resolve()
  }
}

async function invokeCleanup(callback: () => void | Promise<void>): Promise<boolean> {
  try {
    await callback()
    return true
  } catch {
    return false
  }
}

function snapshotHostConstructorOptions(input: PluginRuntimeHostOptions): PluginRuntimeHostOptions {
  let descriptors: PropertyDescriptorMap
  try {
    if (!input || (typeof input !== 'object' && typeof input !== 'function')) {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
    }
    descriptors = Object.getOwnPropertyDescriptors(input)
  } catch {
    throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
  }
  const read = (key: keyof PluginRuntimeHostOptions, required = true): unknown => {
    const descriptor = descriptors[key]
    if (!descriptor) {
      if (required) throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
      return undefined
    }
    if (!descriptor.enumerable || !('value' in descriptor)) {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
    }
    return descriptor.value
  }
  return Object.freeze({
    activation: read('activation') as PluginActivationIdentity,
    activationHandle: read('activationHandle') as string,
    hostGeneration: read('hostGeneration') as number,
    artifactPath: read('artifactPath') as string,
    factory: read('factory') as PluginRuntimeProcessFactory,
    resourceLimits: read('resourceLimits', false) as
      | Partial<PluginRuntimeHostResourceLimits>
      | undefined,
    invalidateAuthority: read(
      'invalidateAuthority'
    ) as PluginRuntimeHostOptions['invalidateAuthority'],
    closeResources: read('closeResources') as PluginRuntimeHostOptions['closeResources'],
    resolveCurrentActivation: read(
      'resolveCurrentActivation',
      false
    ) as PluginRuntimeHostOptions['resolveCurrentActivation'],
    capabilityDispatcher: read('capabilityDispatcher', false) as
      | PluginRuntimeCapabilityDispatcher
      | undefined,
    ownsCapabilityDispatcher: read('ownsCapabilityDispatcher', false) as boolean | undefined,
    resourceDispatcher: read('resourceDispatcher', false) as
      | PluginHostResourceDispatcher
      | undefined,
    ownsResourceDispatcher: read('ownsResourceDispatcher', false) as boolean | undefined,
    onCrash: read('onCrash', false) as PluginRuntimeHostOptions['onCrash'],
    onTerminated: read('onTerminated', false) as PluginRuntimeHostOptions['onTerminated'],
    createNonce: read('createNonce', false) as PluginRuntimeHostOptions['createNonce']
  })
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds)
    timer.unref?.()
  })
}

export class PluginRuntimeHost {
  readonly activation: PluginActivationIdentity
  readonly owner: HostMessageOwner
  readonly resourceLimits: Readonly<PluginRuntimeHostResourceLimits>

  private readonly artifactPath: string
  private readonly factory: PluginRuntimeProcessFactory
  private readonly invalidateAuthority: PluginRuntimeHostOptions['invalidateAuthority']
  private readonly closeResources: PluginRuntimeHostOptions['closeResources']
  private readonly capabilityDispatcher: PluginRuntimeCapabilityDispatcher | null
  private readonly ownsCapabilityDispatcher: boolean
  private readonly resourceDispatcher: PluginHostResourceDispatcher | null
  private readonly ownsResourceDispatcher: boolean
  private readonly callbackRegistry: PluginHostCallbackRegistry
  private readonly retainedCallbackResources = new Map<string, HostWireResourceDescriptor['kind']>()
  private readonly onCrash?: PluginRuntimeHostOptions['onCrash']
  private readonly onTerminated?: PluginRuntimeHostOptions['onTerminated']
  private readonly createNonce: () => string
  private readonly session: PluginHostSession
  private readonly pending = new Map<number, RuntimePendingRequest>()
  private readonly inboundCapabilities = new Map<number, RuntimeInboundCapability>()
  private readonly cancellationCodes = new Map<number, PluginRuntimeHostErrorCode>()
  private child: PluginRuntimeChildAdapter | null = null
  private controlPort: PluginRuntimeControlPortAdapter | null = null
  private unadoptedChild: unknown = null
  private unadoptedControlPort: unknown = null
  private controlPortTransferred = false
  private disposePortListener: (() => void) | null = null
  private disposeExitListener: (() => void) | null = null
  private startPromise: Promise<void> | null = null
  private startupAcquisition: Promise<void> | null = null
  private resolveStartupAcquisition: (() => void) | null = null
  private cleanupPromise: Promise<void> | null = null
  private readonly cancellationGrace = new Map<number, RuntimeCancellationGrace>()
  private heartbeatTimer: NodeJS.Timeout | null = null
  private heartbeatInFlight: Promise<void> | null = null
  private nextRequestId = 0
  private currentState: PluginRuntimeHostState = 'created'
  private terminalCode: PluginRuntimeHostErrorCode = 'PLUGIN_RUNTIME_HOST_CLOSED'
  private childExited = false
  private capabilityDispatcherClosed = false
  private resourceDispatcherClosed = false
  private hasActivated = false
  private terminalNotificationSent = false
  private resolveChildExit!: () => void
  private readonly childExit = new Promise<void>((resolve) => {
    this.resolveChildExit = resolve
  })

  constructor(input: PluginRuntimeHostOptions) {
    const options = snapshotHostConstructorOptions(input)
    this.activation = snapshotActivation(options.activation)
    this.resourceLimits = resolvePluginRuntimeHostResourceLimits(options.resourceLimits)
    const ownsCapabilityDispatcher = options.ownsCapabilityDispatcher ?? false
    const ownsResourceDispatcher = options.ownsResourceDispatcher ?? false
    if (
      typeof ownsCapabilityDispatcher !== 'boolean' ||
      typeof ownsResourceDispatcher !== 'boolean' ||
      typeof options.activationHandle !== 'string' ||
      options.activationHandle.length < 1 ||
      options.activationHandle.length > 128 ||
      !Number.isSafeInteger(options.hostGeneration) ||
      options.hostGeneration < 1 ||
      typeof options.artifactPath !== 'string' ||
      options.artifactPath.length < 1 ||
      typeof options.invalidateAuthority !== 'function' ||
      typeof options.closeResources !== 'function' ||
      (options.resolveCurrentActivation !== undefined &&
        typeof options.resolveCurrentActivation !== 'function') ||
      (options.onCrash !== undefined && typeof options.onCrash !== 'function') ||
      (options.onTerminated !== undefined && typeof options.onTerminated !== 'function') ||
      (options.createNonce !== undefined && typeof options.createNonce !== 'function')
    ) {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
    }
    this.owner = Object.freeze({
      protocolVersion: HOST_PROTOCOL_VERSION,
      activationHandle: options.activationHandle,
      hostGeneration: options.hostGeneration
    })
    const capabilityDispatcher = snapshotCapabilityDispatcher(
      options.capabilityDispatcher,
      this.owner,
      this.activation
    )
    if (ownsCapabilityDispatcher && (!capabilityDispatcher || !capabilityDispatcher.close)) {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
    }
    const resourceDispatcher = snapshotResourceDispatcher(
      options.resourceDispatcher,
      this.owner,
      this.activation
    )
    if (ownsResourceDispatcher && !resourceDispatcher) {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
    }
    this.artifactPath = options.artifactPath
    this.factory = snapshotProcessFactory(options.factory)
    this.invalidateAuthority = options.invalidateAuthority
    this.closeResources = options.closeResources
    this.capabilityDispatcher = capabilityDispatcher
    this.ownsCapabilityDispatcher = ownsCapabilityDispatcher
    this.resourceDispatcher = resourceDispatcher
    this.ownsResourceDispatcher = ownsResourceDispatcher
    this.callbackRegistry = new PluginHostCallbackRegistry({
      owner: this.owner,
      activation: this.activation,
      resolveCurrentActivation: options.resolveCurrentActivation ?? (() => this.activation),
      isActive: () =>
        !this.cleanupPromise &&
        (this.currentState === 'starting' || this.currentState === 'active'),
      maxCallbacks: this.resourceLimits.maxCallbacks,
      maxConcurrent: this.resourceLimits.maxConcurrentCallbacks,
      invokeRemote: (id, args) => this.invokeChildCallback(id, args),
      onRetainedCallbackFailure: (resourceId) => this.disposeFailedCallbackResource(resourceId)
    })
    this.onCrash = options.onCrash
    this.onTerminated = options.onTerminated
    this.createNonce = options.createNonce ?? randomUUID
    this.session = new PluginHostSession({
      owner: this.owner,
      maxPendingRequests: this.resourceLimits.maxPendingRequests,
      maxTrackedRequestIds: this.resourceLimits.maxTrackedRequestIds,
      codec: {
        limits: this.resourceLimits,
        resolveCallback: (_owner, id, context) => {
          if (context.messageType !== 'capability-call') return undefined
          return this.callbackRegistry.resolve(id, context.requestId, this.owner)
        },
        releaseCallback: (_owner, id, callback, context) => {
          this.callbackRegistry.rollback(id, callback, context.requestId)
        }
      },
      onPendingRejected: (pending, error) => this.rejectSessionPending(pending, error)
    })
  }

  get state(): PluginRuntimeHostState {
    return this.currentState
  }

  get pendingCount(): number {
    return this.pending.size
  }

  get processId(): number | undefined {
    return this.child?.processId
  }

  async start(options: PluginRuntimeStartOptions): Promise<void> {
    if (this.currentState === 'active') return
    if (this.startPromise) return this.startPromise
    if (this.currentState !== 'created') {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_CLOSED')
    }
    this.currentState = 'starting'
    this.startupAcquisition = new Promise<void>((resolve) => {
      this.resolveStartupAcquisition = resolve
    })
    this.startPromise = this.runStart(options)
    return this.startPromise
  }

  async callLifecycle(
    method: PluginHostLifecycleMethod,
    payload: unknown = [],
    options: { timeoutMs?: number; signal?: AbortSignal } = {}
  ): Promise<unknown> {
    if (this.currentState !== 'active') {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INACTIVE')
    }
    if (options.signal?.aborted) {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_CANCELLED')
    }
    const response = await this.request(
      'lifecycle-result',
      (requestId) => ({
        ...this.owner,
        type: 'lifecycle-call',
        requestId,
        method,
        payload
      }),
      options.timeoutMs ?? this.resourceLimits.lifecycleTimeoutMs,
      options.signal
    )
    if (response.type !== 'lifecycle-result') {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_PROTOCOL_VIOLATION')
    }
    if (!response.ok) {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_LIFECYCLE_FAILED')
    }
    return response.result
  }

  private async invokeChildCallback(id: string, args: unknown[]): Promise<unknown> {
    if (this.currentState !== 'starting' && this.currentState !== 'active') {
      throw new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_CLOSED')
    }
    const response = await this.request(
      'callback-result',
      (requestId) => ({
        ...this.owner,
        type: 'callback-call',
        requestId,
        callbackId: id,
        payload: args
      }),
      this.resourceLimits.callbackTimeoutMs
    )
    if (response.type !== 'callback-result') {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_PROTOCOL_VIOLATION')
    }
    if (!response.ok) {
      const code = /^[A-Z][A-Z0-9_]{0,127}$/.test(response.error.code)
        ? response.error.code
        : 'PLUGIN_HOST_CALLBACK_FAILED'
      throw new PluginRuntimeCallbackError(code)
    }
    return response.result
  }

  stop(): Promise<void> {
    if (this.cleanupPromise) return this.cleanupPromise
    if (this.currentState === 'closed') return Promise.resolve()
    this.currentState = 'stopping'
    return this.cleanup('PLUGIN_RUNTIME_HOST_CLOSED', {
      finalState: 'closed',
      graceful: true
    })
  }

  close(): Promise<void> {
    return this.stop()
  }

  private async runStart(options: PluginRuntimeStartOptions): Promise<void> {
    try {
      try {
        let artifactExists: boolean
        try {
          artifactExists = await this.factory.artifactExists(this.artifactPath)
        } catch {
          throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_ARTIFACT_UNAVAILABLE')
        }
        if (artifactExists !== true) {
          throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_ARTIFACT_UNAVAILABLE')
        }
        this.assertStarting()

        let spawned: PluginRuntimeSpawnResult
        try {
          spawned = await this.factory.spawn({
            artifactPath: this.artifactPath,
            resourceLimits: this.resourceLimits
          })
        } catch {
          if (this.currentState !== 'starting') {
            throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_CLOSED')
          }
          throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_SPAWN_FAILED')
        }
        const childAdapter = readSpawnAdapter(spawned, 'child')
        const controlPortAdapter = readSpawnAdapter(spawned, 'controlPort')
        const childPort = readSpawnAdapter(spawned, 'childPort')

        if (!isUsableChildAdapter(childAdapter)) {
          this.unadoptedChild = childAdapter
          this.unadoptedControlPort = controlPortAdapter
          throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_SPAWN_FAILED')
        }
        this.child = childAdapter
        try {
          const disposeExitListener = childAdapter.onExit(() => this.handleExit())
          if (typeof disposeExitListener !== 'function') {
            this.child = null
            this.unadoptedChild = childAdapter
            this.unadoptedControlPort = controlPortAdapter
            throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_SPAWN_FAILED')
          }
          this.disposeExitListener = disposeExitListener
        } catch {
          this.child = null
          this.unadoptedChild = childAdapter
          this.unadoptedControlPort = controlPortAdapter
          throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_SPAWN_FAILED')
        }

        if (!isUsableControlPortAdapter(controlPortAdapter)) {
          this.unadoptedControlPort = controlPortAdapter
          throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_SPAWN_FAILED')
        }
        if (childPort === undefined || childPort === null) {
          this.unadoptedControlPort = controlPortAdapter
          throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_SPAWN_FAILED')
        }
        this.controlPort = controlPortAdapter
        try {
          const disposePortListener = controlPortAdapter.onMessage((message) => {
            this.handleMessage(message)
          })
          if (typeof disposePortListener !== 'function') {
            throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_SPAWN_FAILED')
          }
          this.disposePortListener = disposePortListener
        } catch {
          throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_SPAWN_FAILED')
        }

        this.assertStarting()
        try {
          await childAdapter.transferControlPort(childPort)
          this.controlPortTransferred = true
        } catch {
          if (this.currentState !== 'starting') {
            throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_CLOSED')
          }
          throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_SPAWN_FAILED')
        }
        this.assertStarting()
        try {
          controlPortAdapter.start()
        } catch {
          throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_SPAWN_FAILED')
        }
      } finally {
        this.finishStartupAcquisition()
      }

      const handshakeNonce = this.createNonce()
      const ready = await this.request(
        'host-ready',
        (requestId) => ({
          ...this.owner,
          type: 'host-init',
          requestId,
          handshakeNonce
        }),
        this.resourceLimits.handshakeTimeoutMs
      )
      if (ready.type !== 'host-ready') {
        throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_PROTOCOL_VIOLATION')
      }

      const loaded = await this.request(
        'load-result',
        (requestId) => ({
          ...this.owner,
          type: 'host-load',
          requestId,
          payload: options.loadPayload
        }),
        this.resourceLimits.loadTimeoutMs
      )
      if (loaded.type !== 'load-result') {
        throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_PROTOCOL_VIOLATION')
      }
      if (!loaded.ok) {
        throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_LOAD_FAILED')
      }

      if (options.initialize !== false) {
        const initialized = await this.request(
          'lifecycle-result',
          (requestId) => ({
            ...this.owner,
            type: 'lifecycle-call',
            requestId,
            method: 'onInit',
            payload: options.initPayload ?? []
          }),
          this.resourceLimits.lifecycleTimeoutMs
        )
        if (initialized.type !== 'lifecycle-result') {
          throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_PROTOCOL_VIOLATION')
        }
        if (!initialized.ok) {
          throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_LIFECYCLE_FAILED')
        }
      }
      if (this.currentState !== 'starting') {
        throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_CLOSED')
      }
      this.currentState = 'active'
      this.hasActivated = true
      this.startHeartbeat()
    } catch (error) {
      const stable =
        error instanceof PluginRuntimeHostError
          ? error
          : new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_PROTOCOL_VIOLATION')
      await this.cleanup(stable.code, {
        finalState: this.currentState === 'crashed' ? 'crashed' : 'failed',
        graceful: this.currentState !== 'crashed'
      })
      throw stable
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer || this.currentState !== 'active' || this.cleanupPromise) return
    const timer = setInterval(() => this.sendHeartbeat(), this.resourceLimits.heartbeatIntervalMs)
    timer.unref?.()
    this.heartbeatTimer = timer
  }

  private sendHeartbeat(): void {
    if (
      this.heartbeatInFlight ||
      this.currentState !== 'active' ||
      this.cleanupPromise ||
      !this.controlPort
    ) {
      return
    }
    let heartbeat!: Promise<void>
    heartbeat = this.request(
      'heartbeat-result',
      (requestId) => ({
        ...this.owner,
        type: 'heartbeat',
        requestId
      }),
      this.resourceLimits.heartbeatTimeoutMs
    ).then(
      (response) => {
        if (response.type !== 'heartbeat-result') {
          void this.failProtocol()
          return
        }
        if (this.heartbeatInFlight === heartbeat) this.heartbeatInFlight = null
      },
      () => {
        // Request cancellation owns timeout classification and terminal cleanup.
      }
    )
    if (!this.cleanupPromise && this.currentState === 'active') {
      this.heartbeatInFlight = heartbeat
    }
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
    this.heartbeatInFlight = null
  }

  private request(
    expectedType: HostWireMessage['type'],
    createMessage: (requestId: number) => HostWireMessage,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<HostWireMessage> {
    if (this.cleanupPromise || !this.controlPort) {
      return Promise.reject(new PluginRuntimeHostError(this.terminalCode))
    }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_LIMIT) {
      return Promise.reject(new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS'))
    }
    const requestId = this.allocateRequestId()
    const message = createMessage(requestId)
    let wireMessage: HostWireMessage
    try {
      wireMessage = this.session.accept('main-to-child', message)
    } catch {
      void this.failProtocol()
      return Promise.reject(new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_PROTOCOL_VIOLATION'))
    }

    return new Promise<HostWireMessage>((resolve, reject) => {
      const pending: RuntimePendingRequest = {
        requestId,
        expectedType,
        resolve,
        reject,
        timer: null,
        signal,
        abortListener: null,
        posted: false,
        queuedCancellation: null
      }
      pending.timer = setTimeout(() => {
        this.requestCancellation(pending, 'PLUGIN_RUNTIME_HOST_TIMEOUT')
      }, timeoutMs)
      pending.timer.unref?.()
      if (signal) {
        pending.abortListener = () => {
          this.requestCancellation(pending, 'PLUGIN_RUNTIME_HOST_CANCELLED')
        }
        signal.addEventListener('abort', pending.abortListener, { once: true })
        if (signal.aborted) pending.queuedCancellation = 'PLUGIN_RUNTIME_HOST_CANCELLED'
      }
      this.pending.set(requestId, pending)
      try {
        this.controlPort!.postMessage(wireMessage)
        pending.posted = true
        if (pending.queuedCancellation && this.pending.has(requestId)) {
          this.cancelRequest(requestId, pending.queuedCancellation)
        }
      } catch {
        this.settlePending(
          requestId,
          new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_PROTOCOL_VIOLATION')
        )
        void this.failProtocol()
      }
    })
  }

  private handleMessage(value: unknown): void {
    if (this.cleanupPromise) return
    try {
      const message = this.session.accept('child-to-main', value)
      switch (message.type) {
        case 'host-ready':
        case 'heartbeat-result':
        case 'load-result':
        case 'lifecycle-result':
        case 'callback-result':
          this.acknowledgeCancellation(message.requestId)
          this.settlePending(message.requestId, message)
          return
        case 'capability-call':
          this.handleCapabilityCall(message)
          return
        case 'cancel':
          return
        case 'resource-dispose':
          this.handleResourceDispose(message)
          return
        case 'violation':
          void this.failProtocol()
          return
        default:
          void this.failProtocol()
      }
    } catch {
      void this.failProtocol()
    }
  }

  private disposeFailedCallbackResource(resourceId: string): void {
    const kind = this.retainedCallbackResources.get(resourceId)
    if (!kind || !this.resourceDispatcher) return
    void this.resourceDispatcher
      .dispose(resourceId, kind, (releasedId) => {
        this.releaseRetainedCallbackResource(releasedId, kind, true)
      })
      .catch(() => void this.failProtocol())
  }

  private releaseRetainedCallbackResource(
    resourceId: string,
    kind: HostWireResourceDescriptor['kind'],
    notifyChild: boolean
  ): void {
    this.retainedCallbackResources.delete(resourceId)
    this.callbackRegistry.releaseResource(resourceId)
    if (!notifyChild || !this.controlPort || this.childExited) return
    const message: HostWireMessage = {
      ...this.owner,
      type: 'resource-dispose',
      requestId: this.allocateRequestId(),
      resourceId,
      resourceKind: kind
    }
    try {
      const wireMessage = this.session.accept('main-to-child', message)
      this.controlPort.postMessage(wireMessage)
    } catch {
      if (!this.cleanupPromise) void this.failProtocol()
    }
  }

  private handleResourceDispose(
    message: Extract<HostWireMessage, { type: 'resource-dispose' }>
  ): void {
    const resourceKind = message.resourceKind
    if (
      !this.resourceDispatcher ||
      resourceKind === 'callback' ||
      (this.currentState !== 'starting' && this.currentState !== 'active')
    ) {
      void this.failProtocol()
      return
    }
    void this.resourceDispatcher
      .dispose(message.resourceId, resourceKind, (resourceId) => {
        this.releaseRetainedCallbackResource(resourceId, resourceKind, false)
      })
      .catch(() => void this.failProtocol())
  }

  private handleCapabilityCall(
    message: Extract<HostWireMessage, { type: 'capability-call' }>
  ): void {
    if (
      this.session.state !== 'active' ||
      (this.currentState !== 'starting' && this.currentState !== 'active') ||
      this.inboundCapabilities.has(message.requestId)
    ) {
      void this.failProtocol()
      return
    }

    const active: RuntimeInboundCapability = {
      requestId: message.requestId,
      controller: new AbortController(),
      callbackLifetime:
        this.capabilityDispatcher?.getCallbackLifetime?.(message.capability) ?? 'transient',
      cancelled: false
    }
    this.inboundCapabilities.set(message.requestId, active)
    const operation = Promise.resolve().then(() => {
      if (!this.capabilityDispatcher) {
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE')
      }
      return this.capabilityDispatcher.dispatch(
        message.capability,
        message.payload,
        active.controller.signal
      )
    })

    void operation.then(
      (result) => {
        void this.completeCapabilityCall(active, { ok: true, result })
      },
      (error: unknown) => {
        void this.completeCapabilityCall(active, {
          ok: false,
          error: stableCapabilityError(error)
        })
      }
    )
  }

  private async completeCapabilityCall(
    active: RuntimeInboundCapability,
    outcome: { ok: true; result: unknown } | { ok: false; error: StableHostError }
  ): Promise<void> {
    if (
      this.cleanupPromise ||
      this.inboundCapabilities.get(active.requestId) !== active ||
      !this.controlPort
    ) {
      return
    }
    this.inboundCapabilities.delete(active.requestId)

    if (active.cancelled && outcome.ok && this.resourceDispatcher) {
      const lateResource = this.resourceDispatcher.inspect(outcome.result)
      if (lateResource) {
        try {
          await this.resourceDispatcher.dispose(lateResource.id, lateResource.kind, (resourceId) =>
            this.callbackRegistry.releaseResource(resourceId)
          )
        } catch {
          void this.failProtocol()
          return
        }
      }
    }

    let normalized = active.cancelled
      ? ({
          ok: false,
          error: { code: 'PLUGIN_HOST_CAPABILITY_CANCELLED' }
        } as const)
      : outcome
    let retainedResource: HostWireResourceDescriptor | null = null
    if (normalized.ok) {
      const successful = normalized
      try {
        encodeHostWireValue(successful.result, { limits: this.resourceLimits })
        if (active.callbackLifetime === 'resource') {
          const resource = this.resourceDispatcher?.inspect(successful.result)
          if (!resource) throw new PluginHostResourceError('PLUGIN_HOST_RESOURCE_UNKNOWN')
          retainedResource = resource
          this.retainedCallbackResources.set(resource.id, resource.kind)
          const callbackIds = this.callbackRegistry.retainRequest(active.requestId, resource.id)
          this.resourceDispatcher!.retainCallbacks(successful.result, callbackIds)
        } else {
          this.callbackRegistry.releaseRequest(active.requestId)
        }
      } catch {
        this.callbackRegistry.releaseRequest(active.requestId)
        if (retainedResource && this.resourceDispatcher) {
          this.retainedCallbackResources.delete(retainedResource.id)
          this.callbackRegistry.releaseResource(retainedResource.id)
          await this.resourceDispatcher
            .dispose(retainedResource.id, retainedResource.kind)
            .catch(() => undefined)
          retainedResource = null
        }
        normalized = {
          ok: false,
          error: { code: 'PLUGIN_HOST_CAPABILITY_INVALID_RESULT' }
        }
      }
    } else {
      this.callbackRegistry.releaseRequest(active.requestId)
    }
    const response: HostWireMessage = normalized.ok
      ? {
          ...this.owner,
          type: 'capability-result',
          requestId: active.requestId,
          ok: true,
          result: normalized.result
        }
      : {
          ...this.owner,
          type: 'capability-result',
          requestId: active.requestId,
          ok: false,
          error: normalized.error
        }
    try {
      const wireMessage = this.session.accept('main-to-child', response)
      this.controlPort.postMessage(wireMessage)
    } catch {
      if (retainedResource && this.resourceDispatcher) {
        this.retainedCallbackResources.delete(retainedResource.id)
        this.callbackRegistry.releaseResource(retainedResource.id)
        await this.resourceDispatcher
          .dispose(retainedResource.id, retainedResource.kind)
          .catch(() => undefined)
      }
      void this.failProtocol()
    }
  }

  private settlePending(
    requestId: number,
    outcome: HostWireMessage | PluginRuntimeHostError
  ): void {
    const pending = this.pending.get(requestId)
    if (!pending) return
    this.pending.delete(requestId)
    this.clearPending(pending)
    if (outcome instanceof PluginRuntimeHostError) {
      pending.reject(outcome)
      return
    }
    if (outcome.type !== pending.expectedType) {
      pending.reject(new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_PROTOCOL_VIOLATION'))
      void this.failProtocol()
      return
    }
    pending.resolve(outcome)
  }

  private requestCancellation(
    pending: RuntimePendingRequest,
    code: RuntimeCancellationGrace['code']
  ): void {
    if (!this.pending.has(pending.requestId)) return
    if (!pending.posted) {
      pending.queuedCancellation = code
      return
    }
    this.cancelRequest(pending.requestId, code)
  }

  private cancelRequest(requestId: number, code: RuntimeCancellationGrace['code']): void {
    if (!this.pending.has(requestId) || !this.controlPort || this.cleanupPromise) return
    this.cancellationCodes.set(requestId, code)
    const message: HostWireMessage = {
      ...this.owner,
      type: 'cancel',
      requestId: this.allocateRequestId(),
      targetRequestId: requestId
    }
    let grace!: RuntimeCancellationGrace
    const timer = setTimeout(() => {
      if (this.cancellationGrace.get(requestId) !== grace) return
      this.cancellationGrace.delete(requestId)
      void this.cleanup(code, {
        finalState: 'failed',
        graceful: true,
        terminationCode:
          code === 'PLUGIN_RUNTIME_HOST_TIMEOUT' && this.hasActivated ? code : undefined
      }).catch(() => undefined)
    }, this.resourceLimits.cancelGraceMs)
    timer.unref?.()
    grace = Object.freeze({ code, timer })
    this.cancellationGrace.set(requestId, grace)
    try {
      this.session.accept('main-to-child', message)
      this.controlPort.postMessage(message)
    } catch {
      this.cancellationCodes.delete(requestId)
      void this.failProtocol()
      return
    }
    this.cancellationCodes.delete(requestId)
  }

  private acknowledgeCancellation(requestId: number): void {
    const grace = this.cancellationGrace.get(requestId)
    if (!grace) return
    clearTimeout(grace.timer)
    this.cancellationGrace.delete(requestId)
  }

  private rejectSessionPending(
    pending: PluginHostPendingRequest,
    error: PluginHostSessionError
  ): void {
    if (pending.direction === 'child-to-main' && pending.requestType === 'capability-call') {
      const active = this.inboundCapabilities.get(pending.requestId)
      if (active) {
        active.cancelled = true
        active.controller.abort()
      }
      return
    }
    const code =
      this.cancellationCodes.get(pending.requestId) ??
      (error.code === 'PLUGIN_HOST_SESSION_VIOLATED'
        ? 'PLUGIN_RUNTIME_HOST_PROTOCOL_VIOLATION'
        : this.terminalCode)
    this.settlePending(pending.requestId, new PluginRuntimeHostError(code))
  }

  private clearPending(pending: RuntimePendingRequest): void {
    if (pending.timer) clearTimeout(pending.timer)
    if (pending.signal && pending.abortListener) {
      pending.signal.removeEventListener('abort', pending.abortListener)
    }
  }

  private assertStarting(): void {
    if (this.currentState !== 'starting' || this.cleanupPromise) {
      throw new PluginRuntimeHostError(this.terminalCode)
    }
  }

  private finishStartupAcquisition(): void {
    const resolve = this.resolveStartupAcquisition
    this.resolveStartupAcquisition = null
    resolve?.()
  }

  private allocateRequestId(): number {
    this.nextRequestId += 1
    if (!Number.isSafeInteger(this.nextRequestId)) {
      throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_PROTOCOL_VIOLATION')
    }
    return this.nextRequestId
  }

  private handleExit(): void {
    if (this.childExited) return
    this.childExited = true
    this.resolveChildExit()
    if (this.cleanupPromise || this.currentState === 'closed' || this.currentState === 'failed')
      return
    const cancelled = this.cancellationGrace.values().next().value
    if (cancelled) {
      this.currentState = 'stopping'
      void this.cleanup(cancelled.code, {
        finalState: 'failed',
        graceful: false,
        terminationCode:
          cancelled.code === 'PLUGIN_RUNTIME_HOST_TIMEOUT' && this.hasActivated
            ? cancelled.code
            : undefined
      }).catch(() => undefined)
      return
    }
    this.currentState = 'crashed'
    void this.cleanup('PLUGIN_RUNTIME_HOST_CRASHED', {
      finalState: 'crashed',
      graceful: false,
      reportCrash: true
    }).catch(() => undefined)
  }

  private failProtocol(): void {
    if (!this.cleanupPromise) this.currentState = 'stopping'
    const cancelled = this.cancellationGrace.values().next().value
    if (cancelled) {
      void this.cleanup(cancelled.code, {
        finalState: 'failed',
        graceful: true,
        terminationCode:
          cancelled.code === 'PLUGIN_RUNTIME_HOST_TIMEOUT' && this.hasActivated
            ? cancelled.code
            : undefined
      }).catch(() => undefined)
      return
    }
    void this.cleanup('PLUGIN_RUNTIME_HOST_PROTOCOL_VIOLATION', {
      finalState: 'failed',
      graceful: false,
      terminationCode: this.hasActivated ? 'PLUGIN_RUNTIME_HOST_PROTOCOL_VIOLATION' : undefined
    }).catch(() => undefined)
  }

  private cleanup(code: PluginRuntimeHostErrorCode, options: CleanupOptions): Promise<void> {
    if (this.cleanupPromise) return this.cleanupPromise
    this.clearHeartbeat()
    this.terminalCode = code
    this.cleanupPromise = Promise.resolve().then(async () => {
      let cleanupFailed = false
      for (const grace of this.cancellationGrace.values()) clearTimeout(grace.timer)
      this.cancellationGrace.clear()

      if (!(await invokeCleanup(this.invalidateAuthority))) cleanupFailed = true
      if (
        this.ownsCapabilityDispatcher &&
        this.capabilityDispatcher?.close &&
        !this.capabilityDispatcherClosed
      ) {
        this.capabilityDispatcherClosed = true
        if (!(await invokeCleanup(() => this.capabilityDispatcher!.close!()))) cleanupFailed = true
      }
      if (
        this.ownsResourceDispatcher &&
        this.resourceDispatcher &&
        !this.resourceDispatcherClosed
      ) {
        this.resourceDispatcherClosed = true
        if (
          !(await invokeCleanup(() =>
            this.resourceDispatcher!.close((resourceId) => {
              const kind = this.retainedCallbackResources.get(resourceId)
              if (kind) this.releaseRetainedCallbackResource(resourceId, kind, true)
              else this.callbackRegistry.releaseResource(resourceId)
            })
          ))
        ) {
          cleanupFailed = true
        }
      }
      this.retainedCallbackResources.clear()
      this.callbackRegistry.close()
      if (!(await invokeCleanup(this.closeResources))) cleanupFailed = true
      await this.startupAcquisition

      const unadoptedControlPort = this.unadoptedControlPort
      const unadoptedChild = this.unadoptedChild
      this.unadoptedControlPort = null
      this.unadoptedChild = null
      closeRejectedControlPort(unadoptedControlPort)
      await terminateRejectedChild(unadoptedChild)

      if (options.reportCrash) {
        try {
          this.onCrash?.({
            code: 'PLUGIN_RUNTIME_HOST_CRASHED',
            pluginName: this.activation.name,
            activationGeneration: this.activation.activationGeneration
          })
        } catch {
          // Crash reporting cannot weaken cleanup.
        }
      }

      let gracefulShutdown = false
      if (
        options.graceful &&
        this.controlPortTransferred &&
        this.controlPort &&
        !this.childExited &&
        this.canBeginShutdown(this.session.state)
      ) {
        const shutdown: HostWireMessage = {
          ...this.owner,
          type: 'shutdown',
          requestId: this.allocateRequestId()
        }
        try {
          this.session.accept('main-to-child', shutdown)
          this.controlPort.postMessage(shutdown)
          gracefulShutdown = true
        } catch {
          this.session.close()
        }
      } else {
        this.session.close()
      }

      if (this.child && !this.childExited) {
        if (gracefulShutdown) {
          await Promise.race([this.childExit, delay(this.resourceLimits.shutdownTimeoutMs)])
        }
        if (!this.childExited) {
          const child = this.child
          void safeInvoke(() => child.forceKill())
          await this.childExit
        }
      }

      this.session.close()
      for (const pending of [...this.pending.values()]) {
        this.settlePending(pending.requestId, new PluginRuntimeHostError(code))
      }
      try {
        this.disposePortListener?.()
      } catch {
        // Listener ownership is already being discarded.
      }
      try {
        this.disposeExitListener?.()
      } catch {
        // Listener ownership is already being discarded.
      }
      try {
        this.controlPort?.close()
      } catch {
        // Port closure cannot reopen the activation.
      }
      this.disposePortListener = null
      this.disposeExitListener = null
      this.controlPort = null
      this.controlPortTransferred = false
      this.child = null
      this.currentState = options.finalState

      if (options.terminationCode && !this.terminalNotificationSent) {
        this.terminalNotificationSent = true
        try {
          this.onTerminated?.(
            Object.freeze({
              code: options.terminationCode,
              pluginName: this.activation.name,
              activationGeneration: this.activation.activationGeneration
            })
          )
        } catch {
          // Terminal observers run after cleanup and cannot weaken the barrier.
        }
      }

      if (cleanupFailed) {
        throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_CLEANUP_FAILED')
      }
    })
    for (const active of this.inboundCapabilities.values()) active.controller.abort()
    this.inboundCapabilities.clear()
    for (const pending of [...this.pending.values()]) {
      this.settlePending(pending.requestId, new PluginRuntimeHostError(code))
    }
    return this.cleanupPromise
  }

  private canBeginShutdown(state: PluginHostSessionState): boolean {
    return state !== 'closed' && state !== 'violated' && state !== 'closing'
  }
}

export class PluginRuntimeHostManager {
  private readonly current = new Map<string, PluginRuntimeHost>()
  private readonly operations = new Map<string, Promise<void>>()
  private readonly barrierStops = new Set<Promise<void>>()
  private stopAllPromise: Promise<void> | null = null

  replace(host: PluginRuntimeHost): Promise<void> {
    if (this.stopAllPromise) return this.trackBarrierStop(host.stop())
    const pluginName = host.activation.name
    return this.enqueue(pluginName, async () => {
      const previous = this.current.get(pluginName)
      if (previous === host) {
        if (!this.isRetainable(host)) {
          this.current.delete(pluginName)
          await host.stop()
        }
        return
      }
      if (previous) {
        this.current.delete(pluginName)
        await previous.stop()
      }
      if (this.isRetainable(host)) this.current.set(pluginName, host)
      else await host.stop()
    })
  }

  resolve(identity: PluginActivationIdentity): PluginRuntimeHost | undefined {
    const host = this.current.get(identity.name)
    return host?.state === 'active' && sameActivation(host.activation, identity) ? host : undefined
  }

  stopPlugin(pluginName: string): Promise<void> {
    return this.enqueue(pluginName, async () => {
      const host = this.current.get(pluginName)
      if (!host) return
      this.current.delete(pluginName)
      await host.stop()
    })
  }

  stopAll(): Promise<void> {
    if (this.stopAllPromise) return this.stopAllPromise
    this.stopAllPromise = Promise.resolve().then(async () => {
      while (true) {
        const pluginNames = new Set([...this.current.keys(), ...this.operations.keys()])
        const barriers = [
          ...[...pluginNames].map((pluginName) => this.stopPlugin(pluginName)),
          ...this.barrierStops
        ]
        const results = await Promise.allSettled(barriers)
        if (results.some((result) => result.status === 'rejected')) {
          throw new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_CLEANUP_FAILED')
        }
        await Promise.resolve()
        if (this.current.size === 0 && this.operations.size === 0 && this.barrierStops.size === 0) {
          return
        }
      }
    })
    return this.stopAllPromise
  }

  private trackBarrierStop(stopping: Promise<void>): Promise<void> {
    this.barrierStops.add(stopping)
    void stopping.then(
      () => this.barrierStops.delete(stopping),
      () => this.barrierStops.delete(stopping)
    )
    return stopping
  }

  private isRetainable(host: PluginRuntimeHost): boolean {
    return host.state === 'created' || host.state === 'starting' || host.state === 'active'
  }

  private enqueue(pluginName: string, operation: () => Promise<void>): Promise<void> {
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
