import type { IntelligenceProviderConfig } from '../../../types/intelligence'

export type IntelligenceProviderStoredConfig = Omit<IntelligenceProviderConfig, 'apiKey'>

export type IntelligenceProviderCredentialMutation
  = | { action: 'preserve' }
    | { action: 'set', value: string }
    | { action: 'clear' }

export interface IntelligenceProviderConfigSaveRequest {
  provider: IntelligenceProviderStoredConfig
  credential: IntelligenceProviderCredentialMutation
}

export interface IntelligenceProviderConfigDeleteRequest {
  providerId: string
}

const PROVIDER_CONFIG_KEYS = new Set([
  'id',
  'type',
  'name',
  'enabled',
  'baseUrl',
  'rateLimit',
  'models',
  'defaultModel',
  'instructions',
  'timeout',
  'priority',
  'capabilities',
  'metadata',
  'authRef',
  'hasCredential',
])
const PROVIDER_RUNTIME_CONFIG_KEYS = new Set([...PROVIDER_CONFIG_KEYS, 'apiKey'])
const PROVIDER_RATE_LIMIT_KEYS = new Set([
  'requestsPerMinute',
  'requestsPerDay',
  'tokensPerMinute',
  'tokensPerDay',
])
const PROVIDER_NESTED_CREDENTIAL_KEYS = new Set([
  'apiKey',
  'api_key',
  'credential',
  'credentials',
  'password',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
])
const PROVIDER_DTO_MAX_DEPTH = 6
const PROVIDER_DTO_MAX_ENTRIES = 1_024
const PROVIDER_DTO_MAX_BYTES = 128 * 1024
const PROVIDER_CREDENTIAL_MAX_BYTES = 16 * 1024
const PROVIDER_LIST_MAX_ENTRIES = 256
const PROVIDER_CAPABILITY_MAX_ENTRIES = 128
const nodeIsProxy = (() => {
  try {
    const processLike = Reflect.get(globalThis, 'process') as
      | {
        getBuiltinModule?: (name: string) => {
          types?: { isProxy?: (value: unknown) => boolean }
        }
      }
      | undefined
    return processLike?.getBuiltinModule?.('node:util').types?.isProxy
  }
  catch {
    return undefined
  }
})()

function invalidProviderCredentialRequest(): never {
  throw new Error('PROVIDER_CREDENTIAL_REQUEST_INVALID')
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function snapshotProviderDto(
  value: unknown,
  state: { entries: number, bytes: number, seen: WeakSet<object> },
  depth = 0,
  rejectCredentialKeys = false,
): unknown {
  if (value === null || typeof value === 'boolean')
    return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      invalidProviderCredentialRequest()
    return value
  }
  if (typeof value === 'string') {
    state.bytes += utf8Bytes(value)
    if (state.bytes > PROVIDER_DTO_MAX_BYTES)
      invalidProviderCredentialRequest()
    return value
  }
  if (
    !value
    || typeof value !== 'object'
    || nodeIsProxy?.(value)
    || depth >= PROVIDER_DTO_MAX_DEPTH
  ) {
    invalidProviderCredentialRequest()
  }
  if (state.seen.has(value))
    invalidProviderCredentialRequest()
  state.seen.add(value)

  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = Object.getPrototypeOf(value)
    descriptors = Object.getOwnPropertyDescriptors(value)
  }
  catch {
    invalidProviderCredentialRequest()
  }
  const keys = Reflect.ownKeys(descriptors)
  state.entries += keys.length
  if (state.entries > PROVIDER_DTO_MAX_ENTRIES)
    invalidProviderCredentialRequest()

  if (Array.isArray(value)) {
    if (prototype !== Array.prototype)
      invalidProviderCredentialRequest()
    const length = descriptors.length?.value
    if (
      !Number.isSafeInteger(length)
      || length < 0
      || length > PROVIDER_LIST_MAX_ENTRIES
      || keys.length !== length + 1
    ) {
      invalidProviderCredentialRequest()
    }
    const result: unknown[] = []
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)]
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
        invalidProviderCredentialRequest()
      result.push(snapshotProviderDto(descriptor.value, state, depth + 1, rejectCredentialKeys))
    }
    return result
  }

  if (prototype !== Object.prototype && prototype !== null)
    invalidProviderCredentialRequest()
  const result: Record<string, unknown> = Object.create(null)
  for (const key of keys) {
    const descriptor = typeof key === 'string' ? descriptors[key] : undefined
    if (
      typeof key !== 'string'
      || key === '__proto__'
      || key === 'prototype'
      || key === 'constructor'
      || (rejectCredentialKeys && PROVIDER_NESTED_CREDENTIAL_KEYS.has(key))
      || !descriptor?.enumerable
      || !Object.hasOwn(descriptor, 'value')
    ) {
      invalidProviderCredentialRequest()
    }
    result[key] = snapshotProviderDto(descriptor.value, state, depth + 1, rejectCredentialKeys)
  }
  return result
}

function snapshotProviderCredentialDto(value: unknown): unknown {
  const snapshot = snapshotProviderDto(value, {
    entries: 0,
    bytes: 0,
    seen: new WeakSet<object>(),
  })
  // The bounded walk caps work before this clone rejects transparent Proxy objects.
  try {
    structuredClone(value)
  }
  catch {
    invalidProviderCredentialRequest()
  }
  return snapshot
}

function requireExactRecord(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
): Record<string, unknown> {
  const record = snapshotProviderCredentialDto(value)
  if (!record || typeof record !== 'object' || Array.isArray(record))
    invalidProviderCredentialRequest()
  const keys = Object.keys(record)
  if (keys.some(key => !allowedKeys.has(key)))
    invalidProviderCredentialRequest()
  return record as Record<string, unknown>
}

function requireBoundedString(
  value: unknown,
  maxBytes: number,
  options: { allowEmpty?: boolean, exactTrimmed?: boolean } = {},
): string {
  if (typeof value !== 'string' || utf8Bytes(value) > maxBytes)
    invalidProviderCredentialRequest()
  if (!options.allowEmpty && !value.trim())
    invalidProviderCredentialRequest()
  if (options.exactTrimmed && value !== value.trim())
    invalidProviderCredentialRequest()
  return value
}

function requireStringArray(value: unknown, maxEntries: number): string[] {
  if (!Array.isArray(value) || value.length > maxEntries)
    invalidProviderCredentialRequest()
  const result = value.map(entry => requireBoundedString(entry, 512, { exactTrimmed: true }))
  if (new Set(result).size !== result.length)
    invalidProviderCredentialRequest()
  return result
}

export function normalizeIntelligenceProviderStoredConfig(
  value: unknown,
): IntelligenceProviderStoredConfig {
  const provider = requireExactRecord(value, PROVIDER_CONFIG_KEYS)
  const id = requireBoundedString(provider.id, 128, { exactTrimmed: true })
  requireBoundedString(provider.type, 64, { exactTrimmed: true })
  requireBoundedString(provider.name, 512)
  if (typeof provider.enabled !== 'boolean')
    invalidProviderCredentialRequest()
  if (provider.baseUrl !== undefined)
    requireBoundedString(provider.baseUrl, 4_096)
  if (provider.defaultModel !== undefined)
    requireBoundedString(provider.defaultModel, 512, { exactTrimmed: true })
  if (provider.instructions !== undefined) {
    requireBoundedString(provider.instructions, 64 * 1024, {
      allowEmpty: true,
    })
  }
  for (const field of ['timeout', 'priority'] as const) {
    const candidate = provider[field]
    if (
      candidate !== undefined
      && (typeof candidate !== 'number' || !Number.isFinite(candidate))
    ) {
      invalidProviderCredentialRequest()
    }
  }
  if (provider.models !== undefined)
    requireStringArray(provider.models, PROVIDER_LIST_MAX_ENTRIES)
  if (provider.capabilities !== undefined)
    requireStringArray(provider.capabilities, PROVIDER_CAPABILITY_MAX_ENTRIES)
  if (provider.rateLimit !== undefined) {
    const rateLimit = requireExactRecord(provider.rateLimit, PROVIDER_RATE_LIMIT_KEYS)
    for (const candidate of Object.values(rateLimit)) {
      if (
        typeof candidate !== 'number'
        || !Number.isFinite(candidate)
        || candidate < 0
      ) {
        invalidProviderCredentialRequest()
      }
    }
  }
  if (provider.metadata !== undefined) {
    snapshotProviderDto(
      provider.metadata,
      { entries: 0, bytes: 0, seen: new WeakSet<object>() },
      0,
      true,
    )
  }
  if (
    provider.authRef !== undefined
    && provider.authRef !== `provider-credential:${id}`
  ) {
    invalidProviderCredentialRequest()
  }
  if (
    provider.hasCredential !== undefined
    && typeof provider.hasCredential !== 'boolean'
  ) {
    invalidProviderCredentialRequest()
  }
  if (
    (provider.authRef === undefined && provider.hasCredential === true)
    || (provider.authRef !== undefined && provider.hasCredential !== true)
  ) {
    invalidProviderCredentialRequest()
  }
  return provider as unknown as IntelligenceProviderStoredConfig
}

export function normalizeIntelligenceProviderRuntimeConfig(
  value: unknown,
): IntelligenceProviderConfig {
  const runtimeProvider = requireExactRecord(value, PROVIDER_RUNTIME_CONFIG_KEYS)
  const { apiKey, ...storedProvider } = runtimeProvider
  const normalized = normalizeIntelligenceProviderStoredConfig(storedProvider)
  if (apiKey === undefined)
    return normalized as IntelligenceProviderConfig
  return {
    ...normalized,
    apiKey: requireBoundedString(apiKey, PROVIDER_CREDENTIAL_MAX_BYTES),
  } as IntelligenceProviderConfig
}

export function normalizeIntelligenceProviderConfigSaveRequest(
  value: unknown,
): IntelligenceProviderConfigSaveRequest {
  const request = requireExactRecord(value, new Set(['provider', 'credential']))
  if (!Object.hasOwn(request, 'provider') || !Object.hasOwn(request, 'credential'))
    invalidProviderCredentialRequest()
  const provider = normalizeIntelligenceProviderStoredConfig(request.provider)
  const credential = requireExactRecord(request.credential, new Set(['action', 'value']))
  if (credential.action === 'preserve' || credential.action === 'clear') {
    if (Object.keys(credential).length !== 1)
      invalidProviderCredentialRequest()
    return { provider, credential: { action: credential.action } }
  }
  if (
    credential.action !== 'set'
    || Object.keys(credential).length !== 2
    || !Object.hasOwn(credential, 'value')
  ) {
    invalidProviderCredentialRequest()
  }
  const rawCredential = requireBoundedString(credential.value, PROVIDER_CREDENTIAL_MAX_BYTES)
  return { provider, credential: { action: 'set', value: rawCredential } }
}

export function normalizeIntelligenceProviderConfigDeleteRequest(
  value: unknown,
): IntelligenceProviderConfigDeleteRequest {
  const request = requireExactRecord(value, new Set(['providerId']))
  if (Object.keys(request).length !== 1)
    invalidProviderCredentialRequest()
  return {
    providerId: requireBoundedString(request.providerId, 128, {
      exactTrimmed: true,
    }),
  }
}

export function normalizeIntelligenceProviderDeleteResult(value: unknown): { deleted: boolean } {
  const result = requireExactRecord(value, new Set(['deleted']))
  if (Object.keys(result).length !== 1 || typeof result.deleted !== 'boolean')
    invalidProviderCredentialRequest()
  return { deleted: result.deleted }
}
