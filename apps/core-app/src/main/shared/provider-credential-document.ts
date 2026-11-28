import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { Buffer } from 'node:buffer'
import { types as utilTypes } from 'node:util'
import { normalizeIntelligenceProviderStoredConfig } from '@talex-touch/utils/transport/sdk/domains/intelligence'

export const PROVIDER_AUTH_REF_PREFIX = 'provider-credential:'
export const PROVIDER_MAX_COUNT = 256
export const PROVIDER_CREDENTIAL_MAX_BYTES = 16 * 1024

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(value)
}

function invalidConfig(): never {
  throw new Error('PROVIDER_CREDENTIAL_CONFIG_INVALID')
}

export function assertPlainRecord(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    invalidConfig()
  }
  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = Object.getPrototypeOf(value)
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    invalidConfig()
  }
  if (prototype !== Object.prototype && prototype !== null) invalidConfig()
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') invalidConfig()
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) {
      invalidConfig()
    }
  }
}

function validateLegacyProvider(value: unknown): IntelligenceProviderConfig {
  assertPlainRecord(value)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const rawCredential = descriptors.apiKey?.value
  if (
    descriptors.apiKey !== undefined &&
    (typeof rawCredential !== 'string' ||
      Buffer.byteLength(rawCredential, 'utf8') > PROVIDER_CREDENTIAL_MAX_BYTES)
  ) {
    invalidConfig()
  }
  const safeProvider: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') invalidConfig()
    if (key === 'apiKey') continue
    const descriptor = descriptors[key]
    if (!descriptor || !('value' in descriptor)) invalidConfig()
    safeProvider[key] = descriptor.value
  }
  try {
    const normalized = normalizeIntelligenceProviderStoredConfig(safeProvider)
    return {
      ...normalized,
      ...(descriptors.apiKey === undefined ? {} : { apiKey: rawCredential as string })
    } as IntelligenceProviderConfig
  } catch {
    invalidConfig()
  }
}

export function providerList(document: Record<string, unknown>): IntelligenceProviderConfig[] {
  if (document.providers === undefined) return []
  if (
    !Array.isArray(document.providers) ||
    utilTypes.isProxy(document.providers) ||
    Object.getPrototypeOf(document.providers) !== Array.prototype ||
    document.providers.length > PROVIDER_MAX_COUNT
  ) {
    invalidConfig()
  }
  const descriptors = Object.getOwnPropertyDescriptors(document.providers)
  if (Reflect.ownKeys(descriptors).length !== document.providers.length + 1) invalidConfig()
  const ids = new Set<string>()
  const providers: IntelligenceProviderConfig[] = []
  for (let index = 0; index < document.providers.length; index += 1) {
    const descriptor = descriptors[String(index)]
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalidConfig()
    const provider = validateLegacyProvider(descriptor.value)
    if (ids.has(provider.id)) invalidConfig()
    ids.add(provider.id)
    providers.push(provider)
  }
  return providers
}

export function credentialFromProvider(provider: IntelligenceProviderConfig): string | undefined {
  if (typeof provider.apiKey !== 'string' || !provider.apiKey.trim()) return undefined
  return provider.apiKey
}

export function providerWithCredentialState(
  provider: IntelligenceProviderConfig,
  hasCredential: boolean
): IntelligenceProviderConfig {
  const { apiKey: _apiKey, authRef: _authRef, hasCredential: _hasCredential, ...safe } = provider
  if (hasCredential) {
    return {
      ...safe,
      authRef: `${PROVIDER_AUTH_REF_PREFIX}${provider.id}`,
      hasCredential: true
    }
  }
  return {
    ...safe,
    ...(Object.hasOwn(provider, 'apiKey') ||
    Object.hasOwn(provider, 'authRef') ||
    Object.hasOwn(provider, 'hasCredential')
      ? { hasCredential: false }
      : {})
  }
}

function redactProvider(
  value: IntelligenceProviderConfig,
  knownCredential?: boolean
): IntelligenceProviderConfig {
  const hasCredential =
    knownCredential ?? Boolean(credentialFromProvider(value) || value.hasCredential)
  return providerWithCredentialState(value, hasCredential)
}

export function providerConfigDocumentContainsCredential(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (utilTypes.isProxy(value)) return true
  try {
    assertPlainRecord(value)
    return providerList(value).some((provider) => Object.hasOwn(provider, 'apiKey'))
  } catch {
    return true
  }
}

export function redactProviderConfigDocument(value: unknown): Record<string, unknown> {
  try {
    assertPlainRecord(value)
    const document = cloneRecord(value)
    if (!Array.isArray(document.providers)) return document
    const providers = providerList(document)
    document.providers = providers.map((item) => redactProvider(item))
    return document
  } catch {
    return {}
  }
}
