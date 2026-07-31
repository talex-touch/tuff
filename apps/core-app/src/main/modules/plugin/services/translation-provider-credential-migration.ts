import { Buffer } from 'node:buffer'
import { types as utilTypes } from 'node:util'

export const TRANSLATION_PROVIDER_SECRET_FIELDS = Object.freeze({
  deepl: Object.freeze(['apiKey']),
  bing: Object.freeze(['apiKey']),
  custom: Object.freeze(['apiKey']),
  baidu: Object.freeze(['secretKey']),
  tencent: Object.freeze(['secretId', 'secretKey']),
  caiyun: Object.freeze(['token'])
} as const)

export const TRANSLATION_PROVIDER_PLUGIN_NAME = 'touch-translation'
const TRANSLATION_CONFIG_MAX_DEPTH = 8
const TRANSLATION_CONFIG_MAX_ENTRIES = 4_096
const TRANSLATION_CONFIG_MAX_BYTES = 512 * 1024
const TRANSLATION_CREDENTIAL_MAX_BYTES = 64 * 1024

export interface TranslationCredentialVaultEntry {
  key: string
  value: string | null
}

export interface TranslationCredentialMigrationDependencies {
  pluginName: string
  config: unknown
  getSecret: (key: string) => Promise<string | null>
  applySecrets: (entries: readonly TranslationCredentialVaultEntry[]) => Promise<boolean>
  persistConfig: (config: Record<string, unknown>) => Promise<boolean>
  assertCurrent?: () => void
}

function invalidConfig(): never {
  throw new Error('TRANSLATION_CREDENTIAL_CONFIG_INVALID')
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    return false
  }
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

function snapshotConfig(
  value: unknown,
  state: { entries: number; bytes: number; seen: WeakSet<object> },
  depth = 0
): unknown {
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalidConfig()
    return value
  }
  if (typeof value === 'string') {
    state.bytes += Buffer.byteLength(value, 'utf8')
    if (state.bytes > TRANSLATION_CONFIG_MAX_BYTES) invalidConfig()
    return value
  }
  if (
    !value ||
    typeof value !== 'object' ||
    utilTypes.isProxy(value) ||
    depth >= TRANSLATION_CONFIG_MAX_DEPTH
  ) {
    invalidConfig()
  }
  if (state.seen.has(value)) invalidConfig()
  state.seen.add(value)
  const prototype = Object.getPrototypeOf(value)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const keys = Reflect.ownKeys(descriptors)
  state.entries += keys.length
  if (state.entries > TRANSLATION_CONFIG_MAX_ENTRIES) invalidConfig()

  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) invalidConfig()
    const length = descriptors.length?.value
    if (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1) invalidConfig()
    const result: unknown[] = []
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)]
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalidConfig()
      result.push(snapshotConfig(descriptor.value, state, depth + 1))
    }
    return result
  }

  if (prototype !== Object.prototype && prototype !== null) invalidConfig()
  const result: Record<string, unknown> = Object.create(null)
  for (const key of keys) {
    const descriptor = typeof key === 'string' ? descriptors[key] : undefined
    if (
      typeof key !== 'string' ||
      key === '__proto__' ||
      key === 'prototype' ||
      key === 'constructor' ||
      !descriptor?.enumerable ||
      !Object.hasOwn(descriptor, 'value')
    ) {
      invalidConfig()
    }
    result[key] = snapshotConfig(descriptor.value, state, depth + 1)
  }
  return result
}

function normalizeConfig(value: unknown): Record<string, unknown> {
  const snapshot = snapshotConfig(value, {
    entries: 0,
    bytes: 0,
    seen: new WeakSet<object>()
  })
  if (!isPlainRecord(snapshot)) invalidConfig()
  return snapshot
}

function pluginSecretKey(providerId: string, field: string): string {
  return `plugin.${TRANSLATION_PROVIDER_PLUGIN_NAME}.providers.${providerId}.${field}`
}

export function isTranslationProviderSecretKey(value: string): boolean {
  for (const [providerId, fields] of Object.entries(TRANSLATION_PROVIDER_SECRET_FIELDS)) {
    for (const field of fields) {
      if (`providers.${providerId}.${field}` === value) return true
    }
  }
  return false
}

export function stripTranslationProviderCredentials(value: unknown): Record<string, unknown> {
  let sanitized: Record<string, unknown>
  try {
    sanitized = normalizeConfig(value)
  } catch {
    return {}
  }
  for (const [providerId, fields] of Object.entries(TRANSLATION_PROVIDER_SECRET_FIELDS)) {
    const providerRecord = sanitized[providerId]
    if (!isPlainRecord(providerRecord) || !isPlainRecord(providerRecord.config)) continue
    for (const field of fields) delete providerRecord.config[field]
  }
  return sanitized
}

export function isTranslationProviderConfigSafe(value: unknown): boolean {
  try {
    const config = normalizeConfig(value)
    return JSON.stringify(config) === JSON.stringify(stripTranslationProviderCredentials(config))
  } catch {
    return false
  }
}

export function resolveLegacyTranslationCredential(
  value: unknown,
  requestedKey: string
): string | null {
  let config: Record<string, unknown>
  try {
    config = normalizeConfig(value)
  } catch {
    return null
  }
  if (!isTranslationProviderSecretKey(requestedKey)) return null
  for (const [providerId, fields] of Object.entries(TRANSLATION_PROVIDER_SECRET_FIELDS)) {
    for (const field of fields) {
      if (`providers.${providerId}.${field}` !== requestedKey) continue
      const providerRecord = config[providerId]
      if (!isPlainRecord(providerRecord) || !isPlainRecord(providerRecord.config)) return null
      const credential = providerRecord.config[field]
      return typeof credential === 'string' && credential.trim() ? credential : null
    }
  }
  return null
}

async function readSecret(
  dependencies: TranslationCredentialMigrationDependencies,
  key: string
): Promise<string | null> {
  try {
    return await dependencies.getSecret(key)
  } catch {
    throw new Error('TRANSLATION_CREDENTIAL_SECURE_READ_FAILED')
  }
}

async function applySecretBatch(
  dependencies: TranslationCredentialMigrationDependencies,
  entries: readonly TranslationCredentialVaultEntry[]
): Promise<boolean> {
  try {
    return await dependencies.applySecrets(entries)
  } catch {
    return false
  }
}

export async function migrateTranslationProviderCredentials(
  dependencies: TranslationCredentialMigrationDependencies
): Promise<{ config: Record<string, unknown>; migrated: number }> {
  if (dependencies.pluginName !== TRANSLATION_PROVIDER_PLUGIN_NAME) {
    throw new Error('TRANSLATION_CREDENTIAL_OWNER_INVALID')
  }
  const config = normalizeConfig(dependencies.config)
  const sanitized = stripTranslationProviderCredentials(config)
  const writes: TranslationCredentialVaultEntry[] = []
  const rollback: TranslationCredentialVaultEntry[] = []

  for (const [providerId, fields] of Object.entries(TRANSLATION_PROVIDER_SECRET_FIELDS)) {
    const providerRecord = config[providerId]
    if (!isPlainRecord(providerRecord) || !isPlainRecord(providerRecord.config)) continue
    for (const field of fields) {
      if (!Object.hasOwn(providerRecord.config, field)) continue
      const raw = providerRecord.config[field]
      if (typeof raw !== 'string') throw new Error('TRANSLATION_CREDENTIAL_CONFIG_INVALID')
      if (!raw.trim()) continue
      if (Buffer.byteLength(raw, 'utf8') > TRANSLATION_CREDENTIAL_MAX_BYTES) {
        throw new Error('TRANSLATION_CREDENTIAL_LIMIT_EXCEEDED')
      }
      const key = pluginSecretKey(providerId, field)
      const previous = await readSecret(dependencies, key)
      if (previous && previous.trim()) continue
      writes.push({ key, value: raw })
      rollback.push({ key, value: previous })
    }
  }

  if (writes.length === 0) {
    if (JSON.stringify(config) !== JSON.stringify(sanitized)) {
      dependencies.assertCurrent?.()
      if (!(await dependencies.persistConfig(sanitized))) {
        throw new Error('TRANSLATION_CREDENTIAL_CONFIG_WRITE_FAILED')
      }
    }
    return { config: sanitized, migrated: 0 }
  }

  dependencies.assertCurrent?.()
  if (!(await applySecretBatch(dependencies, writes))) {
    throw new Error('TRANSLATION_CREDENTIAL_SECURE_WRITE_FAILED')
  }

  try {
    dependencies.assertCurrent?.()
    if (!(await dependencies.persistConfig(sanitized))) {
      throw new Error('TRANSLATION_CREDENTIAL_CONFIG_WRITE_FAILED')
    }
  } catch (error) {
    if (!(await applySecretBatch(dependencies, rollback))) {
      throw new Error('TRANSLATION_CREDENTIAL_ROLLBACK_FAILED')
    }
    if (error instanceof Error && error.message === 'TRANSLATION_CREDENTIAL_ACTIVATION_STALE') {
      throw error
    }
    throw new Error('TRANSLATION_CREDENTIAL_CONFIG_WRITE_FAILED')
  }
  return { config: sanitized, migrated: writes.length }
}
