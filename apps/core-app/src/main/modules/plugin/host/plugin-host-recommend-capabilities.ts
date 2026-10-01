import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import type { RecommendProvider } from '@talex-touch/utils/core-box'
import { types as utilTypes } from 'node:util'
import type { PluginHostCapabilityDefinition } from './plugin-host-capabilities'
import type { PluginHostCapabilityResourceContext } from './plugin-host-resources'

/** The slice of the recommendation engine the capability is allowed to touch. */
export interface PluginRecommendationHostApi {
  /**
   * Holds the provider under `pluginName` and returns the host disposer that revokes it.
   * The caller's tenant is always the host activation, never a field from the child payload.
   */
  registerPluginProvider(pluginName: string, provider: RecommendProvider): () => void
  /** Removes the id only when it belongs to `pluginName`; false means not removed. */
  unregisterPluginProvider(pluginName: string, providerId: string): boolean
}

export interface PluginRecommendationCapabilityOptions {
  resolveCurrentActivation(pluginName: string): PluginActivationIdentity | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  readonly api: PluginRecommendationHostApi
}

export interface PluginRecommendationCapabilities {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
}

const MAX_PROVIDER_ID_BYTES = 128
const MAX_PROVIDER_NAME_BYTES = 256

function invalid(): never {
  throw new Error('PLUGIN_RECOMMENDATION_CAPABILITY_INVALID')
}

function exactRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[] = []
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

function boundedString(value: unknown, maxBytes: number): string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > maxBytes) invalid()
  if (value.trim().length === 0) invalid()
  return value
}

/**
 * Accept the three callbacks the child declared and nothing else.
 *
 * The shape is exact on purpose: the provider object crosses the process boundary as plain data
 * plus the declared callback fields, so a field the capability did not declare (for example a
 * second execution hook) must fail closed instead of being carried into the engine. `onExecute` is
 * required here as well as in the engine because a candidate the host renders but no one can run
 * is a dead row; the child's own facade sends all three.
 */
function validateProvider(value: unknown): RecommendProvider {
  const record = exactRecord(
    value,
    ['id', 'name', 'canProvide', 'getCandidates', 'onExecute'],
    ['id', 'name', 'canProvide', 'getCandidates', 'onExecute']
  )
  if (
    typeof record.canProvide !== 'function' ||
    typeof record.getCandidates !== 'function' ||
    typeof record.onExecute !== 'function'
  ) {
    invalid()
  }
  return Object.freeze({
    id: boundedString(record.id, MAX_PROVIDER_ID_BYTES),
    name: boundedString(record.name, MAX_PROVIDER_NAME_BYTES),
    canProvide: record.canProvide as RecommendProvider['canProvide'],
    getCandidates: record.getCandidates as RecommendProvider['getCandidates'],
    onExecute: record.onExecute as RecommendProvider['onExecute']
  }) as RecommendProvider
}

function validateUnregisterRequest(value: unknown): { readonly providerId: string } {
  const record = exactRecord(value, ['providerId'], ['providerId'])
  return Object.freeze({ providerId: boundedString(record.providerId, MAX_PROVIDER_ID_BYTES) })
}

function validateBooleanResult(value: unknown): boolean {
  if (typeof value !== 'boolean') invalid()
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
    name: boundedString(required(record, 'name'), 256),
    pluginInstanceId: boundedString(required(record, 'pluginInstanceId'), 256),
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

function freezeDefinition<Request, Result>(
  definition: PluginHostCapabilityDefinition<Request, Result>
): PluginHostCapabilityDefinition<Request, Result> {
  return Object.freeze({
    ...definition,
    callbackLifetime: definition.callbackLifetime ?? 'transient',
    callbackFields: Object.freeze([...(definition.callbackFields ?? [])])
  })
}

/**
 * Host end of `recommend.provider.register` / `recommend.provider.unregister`.
 *
 * Tenancy is resolved from the authoritative context and re-checked against the activation the
 * host currently holds, so the provider is always filed under this activation's plugin name and a
 * stale child cannot register or revoke after a reload. Registration returns the resource handle
 * the underlying engine disposer is bound to: the capability dispatcher commits that handle only
 * when the call completed, and disposing it (identical to plugin unload) runs the engine's
 * unregister. The engine stays the sole author of ownership, source, and snapshot bookkeeping.
 */
export function createPluginRecommendationCapabilities(
  rawOptions: PluginRecommendationCapabilityOptions
): PluginRecommendationCapabilities {
  const options = exactRecord(
    rawOptions,
    ['resolveCurrentActivation', 'resolveHostGeneration', 'api'],
    ['resolveCurrentActivation', 'resolveHostGeneration', 'api']
  )
  if (
    typeof options.resolveCurrentActivation !== 'function' ||
    typeof options.resolveHostGeneration !== 'function'
  ) {
    invalid()
  }
  const apiRecord = exactRecord(
    options.api,
    ['registerPluginProvider', 'unregisterPluginProvider'],
    ['registerPluginProvider', 'unregisterPluginProvider']
  )
  if (
    typeof apiRecord.registerPluginProvider !== 'function' ||
    typeof apiRecord.unregisterPluginProvider !== 'function'
  ) {
    invalid()
  }
  const resolveCurrentActivation =
    options.resolveCurrentActivation as PluginRecommendationCapabilityOptions['resolveCurrentActivation']
  const resolveHostGeneration =
    options.resolveHostGeneration as PluginRecommendationCapabilityOptions['resolveHostGeneration']
  const api = options.api as PluginRecommendationHostApi

  const assertAuthority = (context: PluginSecurityContext): PluginActivationIdentity => {
    if (!isAuthoritativePluginContext(context)) invalid()
    const identity = context.identity
    if (
      identity.authority !== 'plugin-host' ||
      context.name !== identity.pluginName ||
      !Number.isSafeInteger(identity.hostGeneration) ||
      Number(identity.hostGeneration) < 1
    ) {
      invalid()
    }
    const current = snapshotActivation(resolveCurrentActivation(identity.pluginName))
    const expected: PluginActivationIdentity = {
      name: identity.pluginName,
      pluginInstanceId: identity.pluginInstanceId,
      activationGeneration: identity.activationGeneration,
      key: context.uniqueKey
    }
    if (
      !sameActivation(current, expected) ||
      resolveHostGeneration(current) !== identity.hostGeneration
    ) {
      invalid()
    }
    return current
  }

  const definitions: PluginHostCapabilityDefinition[] = [
    freezeDefinition({
      id: 'recommend.provider.register',
      timeoutMs: 10_000,
      maxConcurrency: 1,
      callbackLifetime: 'resource',
      callbackFields: Object.freeze(['canProvide', 'getCandidates', 'onExecute']),
      validateRequest: validateProvider,
      validateResult: (value) => value,
      async invoke(context, request, signal, resources: PluginHostCapabilityResourceContext) {
        const activation = assertAuthority(context)
        if (signal.aborted) invalid()
        const dispose = api.registerPluginProvider(activation.name, request as RecommendProvider)
        if (typeof dispose !== 'function') invalid()
        // The engine accepted the provider before the resource exists. If the call was cancelled in
        // that window, dispose immediately rather than leaving a provider the host no longer owns.
        if (signal.aborted) {
          try {
            dispose()
          } catch {
            // Revocation below is best effort; the resource path handles the committed case.
          }
          invalid()
        }
        try {
          return resources.register('disposer', dispose)
        } catch (error) {
          dispose()
          throw error
        }
      }
    }),
    freezeDefinition({
      id: 'recommend.provider.unregister',
      timeoutMs: 10_000,
      maxConcurrency: 1,
      callbackLifetime: 'transient',
      callbackFields: Object.freeze([]),
      validateRequest: validateUnregisterRequest,
      validateResult: validateBooleanResult,
      async invoke(context, request) {
        const activation = assertAuthority(context)
        return api.unregisterPluginProvider(activation.name, request.providerId)
      }
    })
  ]

  return Object.freeze({ definitions: Object.freeze(definitions) })
}
