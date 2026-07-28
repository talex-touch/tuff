import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { types as utilTypes } from 'node:util'
import {
  isAuthoritativePluginContext,
  issuePluginSecurityContext
} from '@talex-touch/utils/transport/security/plugin-identity'
import {
  unavailablePluginHostResourceContext,
  type PluginHostCapabilityResourceContext,
  type PluginHostResourceDispatcher
} from './plugin-host-resources'
import {
  HOST_PROTOCOL_VERSION,
  PLUGIN_HOST_CAPABILITIES,
  type HostMessageOwner,
  type PluginHostCallbackLifetime,
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
  callbackLifetime?: PluginHostCallbackLifetime
  callbackFields?: readonly string[]
  validateRequest: (value: unknown) => Request
  validateResult: (value: unknown) => Result
  invoke(
    context: PluginSecurityContext,
    request: Request,
    signal: AbortSignal,
    resources: PluginHostCapabilityResourceContext
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
  resources?: PluginHostResourceDispatcher
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
  'callbackLifetime',
  'callbackFields',
  'validateRequest',
  'validateResult',
  'invoke'
])

function readOwnDataField(input: unknown, key: string): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input) || utilTypes.isProxy(input)) {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
  }
  let descriptor: PropertyDescriptor | undefined
  try {
    descriptor = Object.getOwnPropertyDescriptor(input, key)
  } catch {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
  }
  if (!descriptor?.enumerable || !('value' in descriptor)) {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
  }
  return descriptor.value
}

function readOptionalOwnDataField(input: unknown, key: string): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input) || utilTypes.isProxy(input)) {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
  }
  let descriptor: PropertyDescriptor | undefined
  try {
    descriptor = Object.getOwnPropertyDescriptor(input, key)
  } catch {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
  }
  if (!descriptor) return undefined
  if (!descriptor.enumerable || !('value' in descriptor)) {
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

const CALLBACK_FIELD_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
const MAX_CALLBACK_SCAN_DEPTH = 64
const MAX_CALLBACK_SCAN_MEMBERS = 10_000
const FORBIDDEN_CALLBACK_FIELDS = new Set(['__proto__', 'prototype', 'constructor', 'then'])

function snapshotCallbackFields(input: unknown): readonly string[] {
  if (input === undefined) return Object.freeze([])
  if (!Array.isArray(input) || utilTypes.isProxy(input)) {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
  }
  let descriptors: PropertyDescriptorMap
  try {
    descriptors = Object.getOwnPropertyDescriptors(input) as unknown as PropertyDescriptorMap
  } catch {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
  }
  const lengthDescriptor = descriptors.length
  const length =
    lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined
  if (!Number.isSafeInteger(length) || Number(length) < 0 || Number(length) > 64) {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
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
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
    }
    fields.push(field)
  }
  if (Reflect.ownKeys(descriptors).some((key) => !allowedKeys.has(key))) {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
  }
  return Object.freeze(fields)
}

function callbacksMatchDeclaration(input: unknown, callbackFields: readonly string[]): boolean {
  const allowed = new Set(callbackFields)
  const ancestors = new WeakSet<object>()
  let members = 0
  const visit = (value: unknown, callbackAllowed: boolean, depth: number): boolean => {
    if (depth > MAX_CALLBACK_SCAN_DEPTH) return false
    if (typeof value === 'function') return callbackAllowed
    if (!value || typeof value !== 'object') return true
    if (utilTypes.isProxy(value)) return false
    if (ancestors.has(value)) return false
    ancestors.add(value)
    try {
      let descriptors: PropertyDescriptorMap
      try {
        descriptors = Object.getOwnPropertyDescriptors(value)
      } catch {
        return false
      }
      if (Array.isArray(value)) {
        const lengthDescriptor = descriptors.length
        const length =
          lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined
        if (!Number.isSafeInteger(length) || Number(length) < 0) return false
        members += Number(length)
        if (members > MAX_CALLBACK_SCAN_MEMBERS) return false
        const allowedKeys = new Set<PropertyKey>(['length'])
        for (let index = 0; index < Number(length); index += 1) {
          const key = String(index)
          allowedKeys.add(key)
          const descriptor = descriptors[key]
          if (!descriptor?.enumerable || !('value' in descriptor)) return false
          if (!visit(descriptor.value, false, depth + 1)) return false
        }
        return !Reflect.ownKeys(descriptors).some((key) => !allowedKeys.has(key))
      }
      const prototype = Object.getPrototypeOf(value)
      if (prototype !== Object.prototype && prototype !== null) return false
      for (const key of Reflect.ownKeys(descriptors)) {
        members += 1
        if (members > MAX_CALLBACK_SCAN_MEMBERS) return false
        if (typeof key !== 'string') return false
        const descriptor = descriptors[key]
        if (!descriptor?.enumerable || !('value' in descriptor)) return false
        const fieldAllowsCallback = depth === 0 && allowed.has(key)
        if (!visit(descriptor.value, fieldAllowsCallback, depth + 1)) return false
      }
      return true
    } finally {
      ancestors.delete(value)
    }
  }
  return visit(input, false, 0)
}

export function snapshotPluginHostCapabilityDefinition<Request, Result>(
  input: PluginHostCapabilityDefinition<Request, Result>
): PluginHostCapabilityDefinition<Request, Result> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || utilTypes.isProxy(input)) {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
  }
  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = Object.getPrototypeOf(input)
    descriptors = Object.getOwnPropertyDescriptors(input)
  } catch {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
  }
  if (prototype !== Object.prototype) {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
  }
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
    }
    const descriptor = descriptors[key]
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
  const callbackLifetime = value('callbackLifetime')
  const callbackFields = snapshotCallbackFields(value('callbackFields'))
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
    (callbackLifetime !== undefined &&
      callbackLifetime !== 'transient' &&
      callbackLifetime !== 'resource') ||
    typeof validateRequest !== 'function' ||
    utilTypes.isProxy(validateRequest) ||
    typeof validateResult !== 'function' ||
    utilTypes.isProxy(validateResult) ||
    typeof invoke !== 'function' ||
    utilTypes.isProxy(invoke)
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
    callbackLifetime: callbackLifetime ?? 'transient',
    callbackFields,
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
  private readonly resources: PluginHostResourceDispatcher
  private readonly isActive: () => boolean
  private readonly maxConcurrent: number
  private readonly abortGraceMs: number
  private closed = false
  private fatalReported = false

  constructor(options: PluginHostCapabilityRegistryOptions) {
    const maxConcurrent = readOptionalOwnDataField(options, 'maxConcurrent')
    const abortGraceMs = readOptionalOwnDataField(options, 'abortGraceMs')
    const owner = snapshotOwner(readOwnDataField(options, 'owner') as HostMessageOwner)
    const activation = snapshotActivation(
      readOwnDataField(options, 'activation') as PluginActivationIdentity
    )
    const resolveCurrentActivation = readOwnDataField(options, 'resolveCurrentActivation')
    const authorize = readOwnDataField(options, 'authorize')
    const watchPermissionRevoked = readOwnDataField(options, 'watchPermissionRevoked')
    const onFatalViolation = readOwnDataField(options, 'onFatalViolation')
    assertPositiveLimit((maxConcurrent ?? DEFAULT_MAX_CONCURRENT) as number, DEFAULT_MAX_CONCURRENT)
    assertPositiveLimit((abortGraceMs ?? DEFAULT_ABORT_GRACE_MS) as number, MAX_ABORT_GRACE_MS)
    if (
      typeof resolveCurrentActivation !== 'function' ||
      utilTypes.isProxy(resolveCurrentActivation) ||
      typeof authorize !== 'function' ||
      utilTypes.isProxy(authorize) ||
      typeof watchPermissionRevoked !== 'function' ||
      utilTypes.isProxy(watchPermissionRevoked) ||
      typeof onFatalViolation !== 'function' ||
      utilTypes.isProxy(onFatalViolation)
    ) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
    }
    this.owner = owner
    this.activation = activation
    this.resolveCurrentActivation =
      resolveCurrentActivation as PluginHostCapabilityRegistryOptions['resolveCurrentActivation']
    this.authorize = authorize as PluginHostCapabilityRegistryOptions['authorize']
    this.watchPermissionRevoked =
      watchPermissionRevoked as PluginHostCapabilityRegistryOptions['watchPermissionRevoked']
    this.onFatalViolation =
      onFatalViolation as PluginHostCapabilityRegistryOptions['onFatalViolation']
    const suppliedResources = readOptionalOwnDataField(options, 'resources') as
      | PluginHostResourceDispatcher
      | undefined
    if (suppliedResources) {
      const resourceOwner = snapshotOwner(
        readOwnDataField(suppliedResources, 'owner') as HostMessageOwner
      )
      const resourceActivation = snapshotActivation(
        readOwnDataField(suppliedResources, 'activation') as PluginActivationIdentity
      )
      if (
        resourceOwner.protocolVersion !== owner.protocolVersion ||
        resourceOwner.activationHandle !== owner.activationHandle ||
        resourceOwner.hostGeneration !== owner.hostGeneration ||
        !isSameActivation(activation, resourceActivation)
      ) {
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
      }
    }
    this.resources =
      suppliedResources ??
      Object.freeze({
        owner,
        activation,
        ...unavailablePluginHostResourceContext(),
        beginInvocation: () =>
          Object.freeze({
            resources: unavailablePluginHostResourceContext(),
            owns: () => false,
            commit: async () => undefined,
            rollback: async () => undefined
          }),
        inspect: () => null,
        retainCallbacks: () => undefined,
        dispose: async () => {
          throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE')
        },
        close: async () => undefined
      })
    const isActive = readOptionalOwnDataField(options, 'isActive')
    if (isActive !== undefined && (typeof isActive !== 'function' || utilTypes.isProxy(isActive))) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
    }
    this.isActive = (isActive as (() => boolean) | undefined) ?? (() => true)
    this.maxConcurrent = (maxConcurrent as number | undefined) ?? DEFAULT_MAX_CONCURRENT
    this.abortGraceMs = (abortGraceMs as number | undefined) ?? DEFAULT_ABORT_GRACE_MS
  }

  get activeCount(): number {
    return this.activeCalls.size
  }

  get isClosed(): boolean {
    return this.closed
  }

  getCallbackLifetime(capability: PluginHostCapability): PluginHostCallbackLifetime {
    return this.definitions.get(capability)?.callbackLifetime ?? 'transient'
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
      if (!callbacksMatchDeclaration(payload, definition.callbackFields ?? [])) {
        throw new Error()
      }
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
    const invocation = this.resources.beginInvocation({
      capabilityId: definition.id,
      ...(definition.permission === undefined ? {} : { permissionId: definition.permission })
    })
    call.invoked = true
    let result: unknown
    try {
      result = await definition.invoke(
        context,
        request,
        call.controller.signal,
        invocation.resources
      )
    } catch {
      await invocation.rollback()
      if (call.controller.signal.aborted) {
        throw new PluginHostCapabilityError(call.abortCode)
      }
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED')
    }
    if (call.controller.signal.aborted) {
      await invocation.rollback()
      throw new PluginHostCapabilityError(call.abortCode)
    }
    this.assertRuntimeCurrent()
    if (call.controller.signal.aborted) {
      await invocation.rollback()
      throw new PluginHostCapabilityError(call.abortCode)
    }
    let validatedResult: unknown
    try {
      validatedResult = definition.validateResult(result)
    } catch {
      await invocation.rollback()
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_RESULT')
    }
    if (validatedResult instanceof Promise) {
      void validatedResult.catch(() => undefined)
      await invocation.rollback()
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_RESULT')
    }
    if (definition.callbackLifetime === 'resource') {
      if (!invocation.owns(validatedResult)) {
        await invocation.rollback()
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_RESULT')
      }
      try {
        await invocation.commit(validatedResult)
      } catch {
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_RESULT')
      }
    } else {
      const returnedResource =
        invocation.owns(validatedResult) || Boolean(this.resources.inspect(validatedResult))
      await invocation.rollback()
      if (returnedResource) {
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_RESULT')
      }
    }
    if (call.controller.signal.aborted) {
      const resource = this.resources.inspect(validatedResult)
      if (resource) {
        try {
          await this.resources.dispose(resource.id, resource.kind)
        } catch {
          // Activation teardown remains the final resource barrier.
        }
      }
      throw new PluginHostCapabilityError(call.abortCode)
    }
    this.assertRuntimeCurrent()
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
