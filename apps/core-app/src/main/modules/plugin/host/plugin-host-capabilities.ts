import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import {
  isAuthoritativePluginContext,
  issuePluginSecurityContext
} from '@talex-touch/utils/transport/security/plugin-identity'
import {
  HOST_PROTOCOL_VERSION,
  PLUGIN_HOST_CAPABILITIES,
  type HostMessageOwner,
  type PluginHostCapability
} from './plugin-host-wire'

export type PluginHostCapabilityErrorCode =
  | 'PLUGIN_HOST_CAPABILITY_UNKNOWN'
  | 'PLUGIN_HOST_CAPABILITY_DUPLICATE'
  | 'PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION'
  | 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
  | 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE'
  | 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'
  | 'PLUGIN_HOST_CAPABILITY_INVALID_RESULT'
  | 'PLUGIN_HOST_CAPABILITY_CONCURRENCY_LIMIT'
  | 'PLUGIN_HOST_CAPABILITY_TIMEOUT'
  | 'PLUGIN_HOST_CAPABILITY_CANCELLED'
  | 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'
  | 'PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE'
  | 'PLUGIN_HOST_CAPABILITY_INACTIVE'
  | 'PLUGIN_HOST_CAPABILITY_CLOSED'

export class PluginHostCapabilityError extends Error {
  constructor(readonly code: PluginHostCapabilityErrorCode) {
    super(code)
    this.name = 'PluginHostCapabilityError'
  }
}

export interface PluginHostCapabilityDefinition<Request = unknown, Result = unknown> {
  id: PluginHostCapability
  permission?: string
  timeoutMs: number
  maxConcurrency: number
  validateRequest: (value: unknown) => Request
  validateResult: (value: unknown) => Result
  invoke(
    context: PluginSecurityContext,
    request: Request,
    signal: AbortSignal
  ): Result | Promise<Result>
}

export interface PluginHostCapabilityRegistryOptions {
  owner: HostMessageOwner
  activation: PluginActivationIdentity
  resolveCurrentActivation: (pluginName: string) => PluginActivationIdentity | undefined
  authorize: (pluginId: string, permissionId: string) => boolean
  watchPermissionRevoked: (
    pluginId: string,
    permissionId: string,
    onRevoke: () => void
  ) => () => void
  onFatalViolation: (code: PluginHostCapabilityErrorCode) => void
  isActive?: () => boolean
  maxConcurrent?: number
  abortGraceMs?: number
}

interface ActiveCall {
  capability: PluginHostCapability
  controller: AbortController
  abortCode: PluginHostCapabilityErrorCode
  invoked: boolean
  settled: boolean
  released: boolean
  timeout: NodeJS.Timeout | null
  graceTimer: NodeJS.Timeout | null
  revokeDisposer: (() => void) | null
}

const DEFAULT_MAX_CONCURRENT = 32
const DEFAULT_ABORT_GRACE_MS = 500
const MAX_TIMEOUT_MS = 120_000
const MAX_ABORT_GRACE_MS = 10_000
const MAX_DEFINITION_CONCURRENCY = 32
const MAX_OWNER_IDENTIFIER_LENGTH = 128
const ALLOWED_CAPABILITIES = new Set<string>(PLUGIN_HOST_CAPABILITIES)
const DEFINITION_KEYS = new Set([
  'id',
  'permission',
  'timeoutMs',
  'maxConcurrency',
  'validateRequest',
  'validateResult',
  'invoke'
])

function readOwnDataField(input: unknown, key: string): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
  }
  const descriptor = Object.getOwnPropertyDescriptor(input, key)
  if (!descriptor?.enumerable || !('value' in descriptor)) {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
  }
  return descriptor.value
}

function snapshotOwner(input: HostMessageOwner): HostMessageOwner {
  const protocolVersion = readOwnDataField(input, 'protocolVersion')
  const activationHandle = readOwnDataField(input, 'activationHandle')
  const hostGeneration = readOwnDataField(input, 'hostGeneration')
  if (
    protocolVersion !== HOST_PROTOCOL_VERSION ||
    typeof activationHandle !== 'string' ||
    activationHandle.length < 1 ||
    activationHandle.length > MAX_OWNER_IDENTIFIER_LENGTH ||
    !Number.isSafeInteger(hostGeneration) ||
    Number(hostGeneration) < 1
  ) {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
  }
  return Object.freeze({
    protocolVersion: HOST_PROTOCOL_VERSION,
    activationHandle,
    hostGeneration: Number(hostGeneration)
  })
}

function snapshotActivation(input: PluginActivationIdentity): PluginActivationIdentity {
  const name = readOwnDataField(input, 'name')
  const pluginInstanceId = readOwnDataField(input, 'pluginInstanceId')
  const activationGeneration = readOwnDataField(input, 'activationGeneration')
  const key = readOwnDataField(input, 'key')
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
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
  }
  return Object.freeze({
    name,
    pluginInstanceId,
    activationGeneration: Number(activationGeneration),
    key
  })
}

function isSameActivation(
  expected: PluginActivationIdentity,
  current: PluginActivationIdentity | undefined
): current is PluginActivationIdentity {
  return Boolean(
    current &&
    current.name === expected.name &&
    current.pluginInstanceId === expected.pluginInstanceId &&
    current.activationGeneration === expected.activationGeneration &&
    current.key === expected.key
  )
}

function assertPositiveLimit(value: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
  }
}

export function snapshotPluginHostCapabilityDefinition<Request, Result>(
  input: PluginHostCapabilityDefinition<Request, Result>
): PluginHostCapabilityDefinition<Request, Result> {
  if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
  }
  const descriptors = Object.getOwnPropertyDescriptors(input)
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!DEFINITION_KEYS.has(key) || !descriptor.enumerable || !('value' in descriptor)) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
    }
  }
  for (const required of [
    'id',
    'timeoutMs',
    'maxConcurrency',
    'validateRequest',
    'validateResult',
    'invoke'
  ]) {
    if (!Object.hasOwn(descriptors, required)) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
    }
  }
  const value = (key: string): unknown => descriptors[key]?.value
  const id = value('id')
  const permission = value('permission')
  const timeoutMs = value('timeoutMs')
  const maxConcurrency = value('maxConcurrency')
  const validateRequest = value('validateRequest')
  const validateResult = value('validateResult')
  const invoke = value('invoke')
  if (
    typeof id !== 'string' ||
    !ALLOWED_CAPABILITIES.has(id) ||
    (permission !== undefined &&
      (typeof permission !== 'string' || permission.length < 1 || permission.length > 128)) ||
    typeof timeoutMs !== 'number' ||
    typeof maxConcurrency !== 'number' ||
    typeof validateRequest !== 'function' ||
    typeof validateResult !== 'function' ||
    typeof invoke !== 'function'
  ) {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
  }
  assertPositiveLimit(timeoutMs, MAX_TIMEOUT_MS)
  assertPositiveLimit(maxConcurrency, MAX_DEFINITION_CONCURRENCY)
  return Object.freeze({
    id: id as PluginHostCapability,
    ...(permission === undefined ? {} : { permission }),
    timeoutMs,
    maxConcurrency,
    validateRequest: validateRequest as (value: unknown) => Request,
    validateResult: validateResult as (value: unknown) => Result,
    invoke: invoke as PluginHostCapabilityDefinition<Request, Result>['invoke']
  })
}

export class PluginHostCapabilityRegistry {
  private readonly definitions = new Map<PluginHostCapability, PluginHostCapabilityDefinition>()
  private readonly activeByCapability = new Map<PluginHostCapability, number>()
  private readonly activeCalls = new Set<ActiveCall>()
  readonly owner: HostMessageOwner
  readonly activation: PluginActivationIdentity
  private readonly resolveCurrentActivation: PluginHostCapabilityRegistryOptions['resolveCurrentActivation']
  private readonly authorize: PluginHostCapabilityRegistryOptions['authorize']
  private readonly watchPermissionRevoked: PluginHostCapabilityRegistryOptions['watchPermissionRevoked']
  private readonly onFatalViolation: PluginHostCapabilityRegistryOptions['onFatalViolation']
  private readonly isActive: () => boolean
  private readonly maxConcurrent: number
  private readonly abortGraceMs: number
  private closed = false
  private fatalReported = false

  constructor(options: PluginHostCapabilityRegistryOptions) {
    assertPositiveLimit(options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT, DEFAULT_MAX_CONCURRENT)
    assertPositiveLimit(options.abortGraceMs ?? DEFAULT_ABORT_GRACE_MS, MAX_ABORT_GRACE_MS)
    const owner = snapshotOwner(options.owner)
    const activation = snapshotActivation(options.activation)
    if (
      typeof options.resolveCurrentActivation !== 'function' ||
      typeof options.authorize !== 'function' ||
      typeof options.watchPermissionRevoked !== 'function' ||
      typeof options.onFatalViolation !== 'function'
    ) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
    }
    this.owner = owner
    this.activation = activation
    this.resolveCurrentActivation = options.resolveCurrentActivation
    this.authorize = options.authorize
    this.watchPermissionRevoked = options.watchPermissionRevoked
    this.onFatalViolation = options.onFatalViolation
    this.isActive = options.isActive ?? (() => true)
    this.maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT
    this.abortGraceMs = options.abortGraceMs ?? DEFAULT_ABORT_GRACE_MS
  }

  get activeCount(): number {
    return this.activeCalls.size
  }

  get isClosed(): boolean {
    return this.closed
  }

  register<Request, Result>(definition: PluginHostCapabilityDefinition<Request, Result>): void {
    if (this.closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CLOSED')
    const immutableDefinition = snapshotPluginHostCapabilityDefinition(definition)
    if (this.definitions.has(immutableDefinition.id)) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_DUPLICATE')
    }
    this.definitions.set(
      immutableDefinition.id,
      immutableDefinition as PluginHostCapabilityDefinition
    )
  }

  async dispatch(
    capability: PluginHostCapability,
    payload: unknown,
    callerSignal?: AbortSignal
  ): Promise<unknown> {
    this.assertRuntimeCurrent()
    if (callerSignal?.aborted) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
    }

    const definition = this.definitions.get(capability)
    if (!definition) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_UNKNOWN')

    const activeForCapability = this.activeByCapability.get(capability) ?? 0
    if (
      this.activeCalls.size >= this.maxConcurrent ||
      activeForCapability >= definition.maxConcurrency
    ) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CONCURRENCY_LIMIT')
    }

    const call: ActiveCall = {
      capability,
      controller: new AbortController(),
      abortCode: 'PLUGIN_HOST_CAPABILITY_CANCELLED',
      invoked: false,
      settled: false,
      released: false,
      timeout: null,
      graceTimer: null,
      revokeDisposer: null
    }
    this.activeCalls.add(call)
    this.activeByCapability.set(capability, activeForCapability + 1)

    const handleCallerAbort = (): void => this.abortCall(call, 'PLUGIN_HOST_CAPABILITY_CANCELLED')
    callerSignal?.addEventListener('abort', handleCallerAbort, { once: true })
    call.timeout = setTimeout(
      () => this.abortCall(call, 'PLUGIN_HOST_CAPABILITY_TIMEOUT'),
      definition.timeoutMs
    )
    call.timeout.unref?.()

    const aborted = new Promise<never>((_resolve, reject) => {
      const rejectAborted = (): void => {
        reject(new PluginHostCapabilityError(call.abortCode))
      }
      if (call.controller.signal.aborted) rejectAborted()
      else call.controller.signal.addEventListener('abort', rejectAborted, { once: true })
    })

    const operation = this.runCall(call, definition, payload)
    const settledOperation = operation.then(
      (result) => {
        this.settleCall(call)
        return result
      },
      (error: unknown) => {
        this.settleCall(call)
        throw error
      }
    )

    try {
      return await Promise.race([settledOperation, aborted])
    } finally {
      callerSignal?.removeEventListener('abort', handleCallerAbort)
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.definitions.clear()
    for (const call of this.activeCalls) {
      this.abortCall(call, 'PLUGIN_HOST_CAPABILITY_CLOSED')
    }
  }

  private async runCall(
    call: ActiveCall,
    definition: PluginHostCapabilityDefinition,
    payload: unknown
  ): Promise<unknown> {
    if (definition.permission) {
      try {
        const revokeDisposer = this.watchPermissionRevoked(
          this.activation.name,
          definition.permission,
          () => this.abortCall(call, 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
        )
        if (typeof revokeDisposer !== 'function') {
          throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
        }
        call.revokeDisposer = revokeDisposer
      } catch {
        if (call.controller.signal.aborted) {
          throw new PluginHostCapabilityError(call.abortCode)
        }
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
      }

      let decision: unknown
      try {
        decision = this.authorize(this.activation.name, definition.permission)
      } catch {
        if (call.controller.signal.aborted) {
          throw new PluginHostCapabilityError(call.abortCode)
        }
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
      }
      if (call.controller.signal.aborted) {
        throw new PluginHostCapabilityError(call.abortCode)
      }
      if (typeof decision !== 'boolean') {
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
      }
      if (!decision) {
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
      }
    }

    let request: unknown
    try {
      request = definition.validateRequest(payload)
    } catch {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
    }
    if (request instanceof Promise) {
      void request.catch(() => undefined)
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
    }
    if (call.controller.signal.aborted) {
      throw new PluginHostCapabilityError(call.abortCode)
    }
    this.assertRuntimeCurrent()
    if (call.controller.signal.aborted) {
      throw new PluginHostCapabilityError(call.abortCode)
    }

    const context = this.issueCurrentContext(call)
    call.invoked = true
    let result: unknown
    try {
      result = await definition.invoke(context, request, call.controller.signal)
    } catch {
      if (call.controller.signal.aborted) {
        throw new PluginHostCapabilityError(call.abortCode)
      }
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED')
    }
    if (call.controller.signal.aborted) {
      throw new PluginHostCapabilityError(call.abortCode)
    }
    this.assertRuntimeCurrent()
    if (call.controller.signal.aborted) {
      throw new PluginHostCapabilityError(call.abortCode)
    }
    let validatedResult: unknown
    try {
      validatedResult = definition.validateResult(result)
    } catch {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_RESULT')
    }
    if (validatedResult instanceof Promise) {
      void validatedResult.catch(() => undefined)
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_RESULT')
    }
    if (call.controller.signal.aborted) {
      throw new PluginHostCapabilityError(call.abortCode)
    }
    this.assertRuntimeCurrent()
    if (call.controller.signal.aborted) {
      throw new PluginHostCapabilityError(call.abortCode)
    }
    return validatedResult
  }

  private issueCurrentContext(call: ActiveCall): PluginSecurityContext {
    if (call.controller.signal.aborted) {
      throw new PluginHostCapabilityError(call.abortCode)
    }
    this.assertRuntimeCurrent()
    let context: PluginSecurityContext
    try {
      context = issuePluginSecurityContext(this.activation, 'plugin-host', {
        hostGeneration: this.owner.hostGeneration
      })
    } catch {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE')
    }
    if (!isAuthoritativePluginContext(context)) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
    }
    return context
  }

  private assertRuntimeCurrent(): void {
    if (this.closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CLOSED')
    let active: unknown
    let activationMatches: boolean
    try {
      active = this.isActive()
      const current = this.resolveCurrentActivation(this.activation.name)
      activationMatches = isSameActivation(this.activation, current)
    } catch {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE')
    }
    if (typeof active !== 'boolean') {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE')
    }
    if (!active) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INACTIVE')
    if (!activationMatches) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
    }
  }

  private abortCall(call: ActiveCall, code: PluginHostCapabilityErrorCode): void {
    if (call.settled || call.controller.signal.aborted) return
    call.abortCode = code
    call.controller.abort()
    call.graceTimer = setTimeout(() => {
      if (call.settled) return
      this.failClosed(code)
      this.releaseCall(call)
    }, this.abortGraceMs)
    call.graceTimer.unref?.()
  }

  private settleCall(call: ActiveCall): void {
    if (call.settled) return
    call.settled = true
    this.releaseCall(call)
  }

  private releaseCall(call: ActiveCall): void {
    if (call.released) return
    call.released = true
    if (call.timeout) clearTimeout(call.timeout)
    if (call.graceTimer) clearTimeout(call.graceTimer)
    try {
      call.revokeDisposer?.()
    } catch {
      // The registry is already dropping all authority for this call.
    }
    this.activeCalls.delete(call)
    const remaining = (this.activeByCapability.get(call.capability) ?? 1) - 1
    if (remaining <= 0) this.activeByCapability.delete(call.capability)
    else this.activeByCapability.set(call.capability, remaining)
  }

  private failClosed(code: PluginHostCapabilityErrorCode): void {
    if (!this.closed) {
      this.closed = true
      this.definitions.clear()
      for (const call of this.activeCalls) {
        this.abortCall(call, code)
      }
    }
    if (this.fatalReported) return
    this.fatalReported = true
    try {
      this.onFatalViolation(code)
    } catch {
      // Fatal diagnostics must not reopen or weaken the registry.
    }
  }
}
