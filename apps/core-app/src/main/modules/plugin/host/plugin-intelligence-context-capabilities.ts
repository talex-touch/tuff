import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { types as utilTypes } from 'node:util'
import type { PluginHostCapabilityDefinition } from './plugin-host-capabilities'
import {
  type PluginIntelligenceContextHostService,
  type PluginIntelligenceContextRequest,
  type PluginIntelligenceContextResult,
  validatePluginIntelligenceContextRequest,
  validatePluginIntelligenceContextResult
} from './plugin-intelligence-context-host-service'

export interface PluginIntelligenceContextCapabilityOptions {
  readonly activation: PluginActivationIdentity
  resolveCurrentActivation(pluginName: string): PluginActivationIdentity | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  service: PluginIntelligenceContextHostService
}

export interface PluginIntelligenceContextCapabilities {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
}

const MAX_IDENTIFIER_BYTES = 256
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

function invalid(): never {
  throw new Error('PLUGIN_INTELLIGENCE_CONTEXT_CAPABILITY_INVALID')
}

function exactRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[]
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    invalid()
  }
  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = Object.getPrototypeOf(value)
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    invalid()
  }
  if (prototype !== Object.prototype && prototype !== null) invalid()
  const allowed = new Set(allowedKeys)
  const output: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key]
    if (
      typeof key !== 'string' ||
      FORBIDDEN_KEYS.has(key) ||
      !allowed.has(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    ) {
      invalid()
    }
    output[key] = descriptor.value
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(descriptors, key)) invalid()
  }
  return output
}

function required(record: Record<string, unknown>, key: string): unknown {
  if (!Object.hasOwn(record, key)) invalid()
  return record[key]
}

function boundedString(value: unknown, maximumBytes: number): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    Buffer.byteLength(value, 'utf8') > maximumBytes
  ) {
    invalid()
  }
  return value
}

function snapshotActivation(value: unknown): PluginActivationIdentity {
  const record = exactRecord(
    value,
    ['name', 'pluginInstanceId', 'activationGeneration', 'key'],
    ['name', 'pluginInstanceId', 'activationGeneration', 'key']
  )
  const activationGeneration = required(record, 'activationGeneration')
  if (!Number.isSafeInteger(activationGeneration) || Number(activationGeneration) < 1) invalid()
  return Object.freeze({
    name: boundedString(required(record, 'name'), MAX_IDENTIFIER_BYTES),
    pluginInstanceId: boundedString(required(record, 'pluginInstanceId'), MAX_IDENTIFIER_BYTES),
    activationGeneration: Number(activationGeneration),
    key: boundedString(required(record, 'key'), 512)
  })
}

function sameActivation(left: PluginActivationIdentity, right: PluginActivationIdentity): boolean {
  return (
    left.name === right.name &&
    left.pluginInstanceId === right.pluginInstanceId &&
    left.activationGeneration === right.activationGeneration &&
    left.key === right.key
  )
}

export function createPluginIntelligenceContextCapabilities(
  rawOptions: PluginIntelligenceContextCapabilityOptions
): PluginIntelligenceContextCapabilities {
  const options = exactRecord(
    rawOptions,
    ['activation', 'resolveCurrentActivation', 'resolveHostGeneration', 'service'],
    ['activation', 'resolveCurrentActivation', 'resolveHostGeneration', 'service']
  )
  const activation = snapshotActivation(options.activation)
  if (activation.name !== 'touch-intelligence') invalid()
  if (
    typeof options.resolveCurrentActivation !== 'function' ||
    utilTypes.isProxy(options.resolveCurrentActivation) ||
    typeof options.resolveHostGeneration !== 'function' ||
    utilTypes.isProxy(options.resolveHostGeneration)
  ) {
    invalid()
  }
  const serviceRecord = exactRecord(options.service, ['contextInvoke'], ['contextInvoke'])
  if (
    typeof serviceRecord.contextInvoke !== 'function' ||
    utilTypes.isProxy(serviceRecord.contextInvoke)
  ) {
    invalid()
  }
  const resolveCurrentActivation =
    options.resolveCurrentActivation as PluginIntelligenceContextCapabilityOptions['resolveCurrentActivation']
  const resolveHostGeneration =
    options.resolveHostGeneration as PluginIntelligenceContextCapabilityOptions['resolveHostGeneration']
  const contextInvoke =
    serviceRecord.contextInvoke as PluginIntelligenceContextHostService['contextInvoke']

  const assertAuthority = (context: PluginSecurityContext): PluginActivationIdentity => {
    if (!isAuthoritativePluginContext(context)) invalid()
    const identity = context.identity
    if (
      identity.authority !== 'plugin-host' ||
      identity.pluginName !== activation.name ||
      identity.pluginInstanceId !== activation.pluginInstanceId ||
      identity.activationGeneration !== activation.activationGeneration ||
      context.name !== activation.name ||
      context.uniqueKey !== activation.key ||
      !Number.isSafeInteger(identity.hostGeneration) ||
      Number(identity.hostGeneration) < 1
    ) {
      invalid()
    }
    const current = snapshotActivation(resolveCurrentActivation(activation.name))
    if (
      !sameActivation(current, activation) ||
      resolveHostGeneration(activation) !== identity.hostGeneration
    ) {
      invalid()
    }
    return current
  }

  const validateEphemeralRequest = (value: unknown): PluginIntelligenceContextRequest => {
    const request = validatePluginIntelligenceContextRequest(value)
    if (request.context.mode === 'continue') invalid()
    return request
  }

  const definition: PluginHostCapabilityDefinition<
    PluginIntelligenceContextRequest,
    PluginIntelligenceContextResult
  > = Object.freeze({
    id: 'intelligence.context.invoke',
    permission: 'intelligence.basic',
    timeoutMs: 60_000,
    maxConcurrency: 2,
    callbackLifetime: 'transient',
    callbackFields: Object.freeze([]),
    validateRequest: validateEphemeralRequest,
    validateResult: validatePluginIntelligenceContextResult,
    invoke: async (context, request, signal) => {
      const current = assertAuthority(context)
      const caller = `plugin:${current.name}`
      const result = await Reflect.apply(contextInvoke, undefined, [request, signal, caller])
      return validatePluginIntelligenceContextResult(result)
    }
  })

  return Object.freeze({ definitions: Object.freeze([definition]) })
}
