import { types as utilTypes } from 'node:util'
import { providerCredentialSecureStoreKey } from '../ai/provider-credential-service'

export type PortableSecretOwnerKind = 'plugin' | 'provider'

export interface PortableSecretCatalogIdentity {
  readonly ownerKind: PortableSecretOwnerKind
  readonly ownerId: string
  readonly key: string
  readonly purpose: string
}

export interface PortableSecretCatalogEntry extends PortableSecretCatalogIdentity {
  readonly secureStoreKey: string
  readonly secureStorePurpose: string
}

const TRANSLATION_PROVIDER_SECRET_KEYS = [
  'providers.deepl.apiKey',
  'providers.bing.apiKey',
  'providers.custom.apiKey',
  'providers.baidu.secretKey',
  'providers.tencent.secretId',
  'providers.tencent.secretKey',
  'providers.caiyun.token'
] as const

const PORTABLE_PROVIDER_IDS = [
  'openai-default',
  'anthropic-default',
  'deepseek-default',
  'siliconflow-default'
] as const

const pluginCatalogEntries: readonly PortableSecretCatalogEntry[] =
  TRANSLATION_PROVIDER_SECRET_KEYS.map((key) => ({
    ownerKind: 'plugin',
    ownerId: 'touch-translation',
    key,
    purpose: 'translation-provider-credential',
    secureStoreKey: `plugin.touch-translation.${key}`,
    secureStorePurpose: 'plugin-secret'
  }))

const providerCatalogEntries: readonly PortableSecretCatalogEntry[] = PORTABLE_PROVIDER_IDS.map(
  (ownerId) => ({
    ownerKind: 'provider',
    ownerId,
    key: 'apiKey',
    purpose: 'intelligence-provider-credential',
    secureStoreKey: providerCredentialSecureStoreKey(ownerId),
    secureStorePurpose: 'intelligence-provider-credential'
  })
)

const catalogEntries: readonly PortableSecretCatalogEntry[] = [
  ...pluginCatalogEntries,
  ...providerCatalogEntries
]

export const PORTABLE_SECRET_CATALOG_V1 = Object.freeze(
  catalogEntries.map((entry) => Object.freeze({ ...entry }))
)

function catalogIdentityKey(identity: PortableSecretCatalogIdentity): string {
  return JSON.stringify([identity.ownerKind, identity.ownerId, identity.key, identity.purpose])
}

const portableSecretCatalogByIdentity = new Map(
  PORTABLE_SECRET_CATALOG_V1.map((entry) => [catalogIdentityKey(entry), entry] as const)
)

function invalidCatalogEntry(): never {
  throw new Error('PRIVACY_SECRET_BACKUP_ENTRY_FORBIDDEN')
}

export function resolvePortableSecretCatalogEntry(value: unknown): PortableSecretCatalogEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    invalidCatalogEntry()
  }

  let descriptors: PropertyDescriptorMap
  let prototype: object | null
  try {
    descriptors = Object.getOwnPropertyDescriptors(value)
    prototype = Object.getPrototypeOf(value)
  } catch {
    invalidCatalogEntry()
  }
  if (prototype !== Object.prototype && prototype !== null) invalidCatalogEntry()

  const requiredKeys = ['ownerKind', 'ownerId', 'key', 'purpose'] as const
  const allowedKeys = new Set<string>([...requiredKeys, 'value'])
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key]
    if (
      typeof key !== 'string' ||
      !allowedKeys.has(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    ) {
      invalidCatalogEntry()
    }
  }
  for (const key of requiredKeys) {
    const descriptor = descriptors[key]
    if (
      !descriptor?.enumerable ||
      !('value' in descriptor) ||
      typeof descriptor.value !== 'string'
    ) {
      invalidCatalogEntry()
    }
  }
  try {
    structuredClone(value)
  } catch {
    invalidCatalogEntry()
  }

  const identity: PortableSecretCatalogIdentity = {
    ownerKind: descriptors.ownerKind.value as PortableSecretOwnerKind,
    ownerId: descriptors.ownerId.value as string,
    key: descriptors.key.value as string,
    purpose: descriptors.purpose.value as string
  }
  const entry = portableSecretCatalogByIdentity.get(catalogIdentityKey(identity))
  if (!entry) invalidCatalogEntry()
  return entry
}
