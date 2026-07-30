import { isProxy } from 'node:util/types'
import type {
  PrivacyRetentionCategory,
  PrivacyRetentionCategoryPolicy,
  PrivacyRetentionPolicyV1,
  PrivacyRetentionPreset,
  PrivacyRetentionSelectionV1
} from '@talex-touch/utils/transport/events/types'

export const PRIVACY_RETENTION_DAY_MS = 86_400_000
export const PRIVACY_OCR_TEMP_NAMESPACE = 'ocr/intermediate'
export const PRIVACY_SCREENSHOT_TEMP_NAMESPACE = 'native/screenshots'

export const PRIVACY_RETENTION_CATEGORIES = [
  'clipboard-history',
  'ocr-screenshot-temp',
  'search-history',
  'intelligence-audit',
  'intelligence-context',
  'diagnostics'
] as const satisfies readonly PrivacyRetentionCategory[]

const PERIOD_MS: Readonly<Record<PrivacyRetentionPreset, number | null>> = Object.freeze({
  '1-day': PRIVACY_RETENTION_DAY_MS,
  '7-days': 7 * PRIVACY_RETENTION_DAY_MS,
  '30-days': 30 * PRIVACY_RETENTION_DAY_MS,
  '90-days': 90 * PRIVACY_RETENTION_DAY_MS,
  '180-days': 180 * PRIVACY_RETENTION_DAY_MS,
  '365-days': 365 * PRIVACY_RETENTION_DAY_MS,
  permanent: null
})

const APPROVED_RETENTION_VALUES = new Set<number | null>(Object.values(PERIOD_MS))

export function isSupportedPrivacyRetentionMs(value: unknown): value is number | null {
  return APPROVED_RETENTION_VALUES.has(value as number | null)
}

function freezePolicy(policy: PrivacyRetentionPolicyV1): PrivacyRetentionPolicyV1 {
  for (const category of PRIVACY_RETENTION_CATEGORIES) {
    Object.freeze(policy.categories[category])
  }
  Object.freeze(policy.categories)
  return Object.freeze(policy)
}

export const DEFAULT_PRIVACY_RETENTION_POLICY: PrivacyRetentionPolicyV1 = freezePolicy({
  version: 1,
  categories: {
    'clipboard-history': { enabled: true, retentionMs: 90 * PRIVACY_RETENTION_DAY_MS },
    'ocr-screenshot-temp': { enabled: true, retentionMs: PRIVACY_RETENTION_DAY_MS },
    'search-history': { enabled: true, retentionMs: 30 * PRIVACY_RETENTION_DAY_MS },
    'intelligence-audit': { enabled: true, retentionMs: 30 * PRIVACY_RETENTION_DAY_MS },
    'intelligence-context': { enabled: true, retentionMs: 30 * PRIVACY_RETENTION_DAY_MS },
    diagnostics: { enabled: true, retentionMs: 30 * PRIVACY_RETENTION_DAY_MS }
  }
})

function ownDataValue(record: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key)
  return descriptor && 'value' in descriptor ? descriptor.value : undefined
}

function asPlainRecord(value: unknown): Record<PropertyKey, unknown> | null {
  if (typeof value !== 'object' || value === null || isProxy(value)) return null
  try {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return null
    Object.getOwnPropertyNames(value)
    return value as Record<PropertyKey, unknown>
  } catch {
    return null
  }
}

function normalizeCategoryPolicy(
  value: unknown,
  fallback: PrivacyRetentionCategoryPolicy
): PrivacyRetentionCategoryPolicy {
  const record = asPlainRecord(value)
  if (!record) return { ...fallback }

  let enabled: unknown
  let retentionMs: unknown
  try {
    enabled = ownDataValue(record, 'enabled')
    retentionMs = ownDataValue(record, 'retentionMs')
  } catch {
    return { ...fallback }
  }

  return {
    enabled: typeof enabled === 'boolean' ? enabled : fallback.enabled,
    retentionMs: isSupportedPrivacyRetentionMs(retentionMs)
      ? (retentionMs as number | null)
      : fallback.retentionMs
  }
}

export function normalizePrivacyRetentionPolicy(value: unknown): PrivacyRetentionPolicyV1 {
  const record = asPlainRecord(value)
  try {
    if (!record || ownDataValue(record, 'version') !== 1) {
      return DEFAULT_PRIVACY_RETENTION_POLICY
    }
    const categories = asPlainRecord(ownDataValue(record, 'categories'))
    if (!categories) return DEFAULT_PRIVACY_RETENTION_POLICY

    const normalized = {} as Record<PrivacyRetentionCategory, PrivacyRetentionCategoryPolicy>
    for (const category of PRIVACY_RETENTION_CATEGORIES) {
      normalized[category] = normalizeCategoryPolicy(
        ownDataValue(categories, category),
        DEFAULT_PRIVACY_RETENTION_POLICY.categories[category]
      )
    }
    return freezePolicy({ version: 1, categories: normalized })
  } catch {
    return DEFAULT_PRIVACY_RETENTION_POLICY
  }
}

function normalizePeriod(value: unknown, category: PrivacyRetentionCategory): number | null {
  if (typeof value === 'string' && Object.hasOwn(PERIOD_MS, value)) {
    return PERIOD_MS[value as PrivacyRetentionPreset]
  }
  return DEFAULT_PRIVACY_RETENTION_POLICY.categories[category].retentionMs
}

export function privacyRetentionSelectionToPolicy(value: unknown): PrivacyRetentionPolicyV1 {
  const record = asPlainRecord(value)
  try {
    if (!record || ownDataValue(record, 'version') !== 1) {
      return DEFAULT_PRIVACY_RETENTION_POLICY
    }
    const selections = asPlainRecord(ownDataValue(record, 'selections'))
    if (!selections) return DEFAULT_PRIVACY_RETENTION_POLICY

    const categories = {} as Record<PrivacyRetentionCategory, PrivacyRetentionCategoryPolicy>
    for (const category of PRIVACY_RETENTION_CATEGORIES) {
      categories[category] = {
        enabled: true,
        retentionMs: normalizePeriod(ownDataValue(selections, category), category)
      }
    }
    return freezePolicy({ version: 1, categories })
  } catch {
    return DEFAULT_PRIVACY_RETENTION_POLICY
  }
}

export function policyToPrivacyRetentionSelection(
  policy: PrivacyRetentionPolicyV1
): PrivacyRetentionSelectionV1 {
  const normalizedPolicy = normalizePrivacyRetentionPolicy(policy)
  const selections = {} as Record<PrivacyRetentionCategory, PrivacyRetentionPreset>
  for (const category of PRIVACY_RETENTION_CATEGORIES) {
    const retentionMs = normalizedPolicy.categories[category].retentionMs
    const entry = Object.entries(PERIOD_MS).find(([, duration]) => duration === retentionMs)
    selections[category] = entry![0] as PrivacyRetentionPreset
  }
  return { version: 1, selections }
}
