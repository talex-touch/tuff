export const PRIVACY_RETENTION_CATEGORIES = [
  'clipboard-history',
  'ocr-screenshot-temp',
  'search-history',
  'intelligence-audit',
  'intelligence-context',
  'diagnostics',
] as const

export type PrivacyRetentionCategory = (typeof PRIVACY_RETENTION_CATEGORIES)[number]

export const PRIVACY_DATA_CATEGORIES = [...PRIVACY_RETENTION_CATEGORIES, 'intelligence-memory', 'plugin-data'] as const

// Memory and plugin data have independent, authority-bound deletion lifecycles.
export const PRIVACY_SETTINGS_DATA_CATEGORIES = [...PRIVACY_RETENTION_CATEGORIES] as const

export type PrivacyDataCategory = (typeof PRIVACY_DATA_CATEGORIES)[number]

export const PRIVACY_RETENTION_PRESETS = [
  '1-day',
  '7-days',
  '30-days',
  '90-days',
  '180-days',
  '365-days',
  'permanent',
] as const

export type PrivacyRetentionPreset = (typeof PRIVACY_RETENTION_PRESETS)[number]

export interface PrivacyRetentionCategoryPolicy {
  readonly enabled: boolean
  readonly retentionMs: number | null
}

export interface PrivacyRetentionPolicyV1 {
  readonly version: 1
  readonly categories: Readonly<Record<PrivacyRetentionCategory, PrivacyRetentionCategoryPolicy>>
}

export interface PrivacyRetentionSelectionV1 {
  readonly version: 1
  readonly selections: Readonly<Record<PrivacyRetentionCategory, PrivacyRetentionPreset>>
}

export const PRIVACY_ERROR_CODES = [
  'PRIVACY_REQUEST_INVALID',
  'PRIVACY_OPERATION_BUSY',
  'PRIVACY_OPERATION_CANCELLED',
  'PRIVACY_OPERATION_FAILED',
  'PRIVACY_POLICY_INVALID',
  'PRIVACY_CATEGORY_UNAVAILABLE',
  'PRIVACY_EXPORT_FAILED',
  'PRIVACY_DELETE_FAILED',
  'PRIVACY_SECRET_BACKUP_PASSWORD_INVALID',
  'PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED',
  'PRIVACY_SECRET_BACKUP_ENVELOPE_INVALID',
  'PRIVACY_SECRET_BACKUP_VERSION_UNSUPPORTED',
  'PRIVACY_SECRET_BACKUP_KDF_INVALID',
  'PRIVACY_SECRET_BACKUP_AUTH_FAILED',
  'PRIVACY_SECRET_BACKUP_PAYLOAD_INVALID',
  'PRIVACY_SECRET_BACKUP_ENTRY_FORBIDDEN',
  'PRIVACY_SECRET_BACKUP_DUPLICATE_ENTRY',
  'PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID',
  'PRIVACY_SECRET_BACKUP_STORE_UNAVAILABLE',
  'PRIVACY_SECRET_BACKUP_STORE_WRITE_FAILED',
] as const

export type PrivacyErrorCode = (typeof PRIVACY_ERROR_CODES)[number]

export type PrivacyResult<T> =
  | {
      readonly ok: true
      readonly data: T
    }
  | {
      readonly ok: false
      readonly code: PrivacyErrorCode
      readonly retryable: boolean
      readonly cancelled?: boolean
      readonly reportId?: string
    }

export interface PrivacyPolicyGetRequest {
  readonly operation: 'policy.get'
}

export interface PrivacyPolicyUpdateRequest {
  readonly operation: 'policy.update'
  readonly policy: PrivacyRetentionSelectionV1
}

export interface PrivacySummaryRequest {
  readonly operation: 'summary.get'
  readonly categories?: readonly PrivacyDataCategory[]
}

export interface PrivacyCleanupPreviewRequest {
  readonly operation: 'cleanup.preview'
  readonly categories: readonly PrivacyRetentionCategory[]
}

export interface PrivacyCleanupRunRequest {
  readonly operation: 'cleanup.run'
  readonly categories: readonly PrivacyRetentionCategory[]
}

export interface PrivacyCategoryExportRequest {
  readonly operation: 'category.export'
  readonly categories: readonly PrivacyDataCategory[]
}

export interface PrivacyCategoryDeletePreviewRequest {
  readonly operation: 'category.delete-preview'
  readonly categories: readonly PrivacyDataCategory[]
}

export interface PrivacyCategoryDeleteRequest {
  readonly operation: 'category.delete'
  readonly categories: readonly PrivacyDataCategory[]
  readonly confirmation: 'delete-selected-data'
  readonly previewId: string
}

export interface PrivacyProviderDisclosureRequest {
  readonly operation: 'provider-disclosure.get'
}

export interface PrivacySecretBackupPreviewRequest {
  readonly operation: 'secret-backup.preview'
}

export interface PrivacySecretBackupWriteRequest {
  readonly operation: 'secret-backup.write'
  readonly password: string
}

export interface PrivacySecretRestorePreviewRequest {
  readonly operation: 'secret-restore.preview'
  readonly password: string
}

export type PrivacySecretRestoreConflictPolicy = 'skip' | 'overwrite'

export interface PrivacySecretRestoreApplyRequest {
  readonly operation: 'secret-restore.apply'
  readonly restoreId: string
  readonly password: string
  readonly conflictPolicy: PrivacySecretRestoreConflictPolicy
}

export type PrivacyRequest =
  | PrivacyPolicyGetRequest
  | PrivacyPolicyUpdateRequest
  | PrivacySummaryRequest
  | PrivacyCleanupPreviewRequest
  | PrivacyCleanupRunRequest
  | PrivacyCategoryExportRequest
  | PrivacyCategoryDeletePreviewRequest
  | PrivacyCategoryDeleteRequest
  | PrivacyProviderDisclosureRequest
  | PrivacySecretBackupPreviewRequest
  | PrivacySecretBackupWriteRequest
  | PrivacySecretRestorePreviewRequest
  | PrivacySecretRestoreApplyRequest

export interface PrivacyCategorySummary {
  readonly category: PrivacyDataCategory
  readonly itemCount: number
  readonly byteCount: number
  readonly retentionMs: number | null
  readonly lastCleanupAt?: string
}

export interface PrivacyDeleteCategoryImpact {
  readonly category: PrivacyDataCategory
  readonly eligibleItemCount: number
  readonly eligibleByteCount: number
  readonly protectedItemCount: number
}

export interface PrivacyCleanupSummary {
  readonly categories: readonly PrivacyDeleteCategoryImpact[]
  readonly bounded: boolean
}

export interface PrivacyCategoryDeletePreview extends PrivacyCleanupSummary {
  readonly previewId: string
}

export interface PrivacyCleanupRunSummary {
  readonly categories: readonly {
    readonly category: PrivacyRetentionCategory
    readonly deletedItemCount: number
    readonly deletedByteCount: number
  }[]
  readonly partial: boolean
  readonly reportId?: string
}

export interface PrivacyCategoryExportSummary {
  readonly format: 'talex.touch.privacy-export/v1'
  readonly categories: readonly PrivacyDataCategory[]
  readonly cancelled: boolean
  readonly itemCount: number
  readonly byteCount: number
  readonly reportId: string
}

export interface PrivacyCategoryDeleteSummary {
  readonly categories: readonly {
    readonly category: PrivacyDataCategory
    readonly deletedItemCount: number
  }[]
  readonly partial: boolean
}

export type PrivacyProviderDestinationClass = 'local' | 'remote' | 'nexus-managed'
export type PrivacyProviderDataCategory =
  | 'text'
  | 'clipboard'
  | 'image-ocr'
  | 'audio'
  | 'file-context'
  | 'usage-metadata'

export type PrivacyProviderPurpose =
  | 'text-processing'
  | 'translation'
  | 'vision-and-ocr'
  | 'speech-processing'
  | 'retrieval-and-context'
  | 'clipboard-processing'
  | 'other-configured-capability'

export interface PrivacyProviderDisclosure {
  readonly providerId: string
  readonly displayName: string
  readonly destinationClass: PrivacyProviderDestinationClass
  readonly dataCategories: readonly PrivacyProviderDataCategory[]
  readonly purposes: readonly PrivacyProviderPurpose[]
  readonly capabilities: readonly string[]
  readonly localRetentionCategories: readonly PrivacyRetentionCategory[]
}

export interface PrivacySecretBackupPreview {
  readonly portableEntryCount: number
  readonly available: boolean
}

export interface PrivacySecretBackupWriteSummary {
  readonly format: 'talex.touch.secret-backup'
  readonly version: 1
  readonly cancelled: boolean
}

export interface PrivacySecretRestorePreview {
  readonly restoreId: string
  readonly totalEntryCount: number
  readonly conflictCount: number
  readonly newEntryCount: number
}

export interface PrivacySecretRestoreApplySummary {
  readonly importedCount: number
  readonly overwrittenCount: number
  readonly skippedCount: number
}

export type PrivacyPolicyGetResult = PrivacyResult<{
  readonly policy: PrivacyRetentionPolicyV1
  readonly supportedPresets: readonly PrivacyRetentionPreset[]
}>
export type PrivacyPolicyUpdateResult = PrivacyResult<{ readonly policy: PrivacyRetentionPolicyV1 }>
export type PrivacySummaryResult = PrivacyResult<{
  readonly categories: readonly PrivacyCategorySummary[]
}>
export type PrivacyCleanupPreviewResult = PrivacyResult<PrivacyCleanupSummary>
export type PrivacyCleanupRunResult = PrivacyResult<PrivacyCleanupRunSummary>
export type PrivacyCategoryExportResult = PrivacyResult<PrivacyCategoryExportSummary>
export type PrivacyCategoryDeletePreviewResult = PrivacyResult<PrivacyCategoryDeletePreview>
export type PrivacyCategoryDeleteResult = PrivacyResult<PrivacyCategoryDeleteSummary>
export type PrivacyProviderDisclosureResult = PrivacyResult<{
  readonly providers: readonly PrivacyProviderDisclosure[]
}>
export type PrivacySecretBackupPreviewResult = PrivacyResult<PrivacySecretBackupPreview>
export type PrivacySecretBackupWriteResult = PrivacyResult<PrivacySecretBackupWriteSummary>
export type PrivacySecretRestorePreviewResult = PrivacyResult<PrivacySecretRestorePreview>
export type PrivacySecretRestoreApplyResult = PrivacyResult<PrivacySecretRestoreApplySummary>

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const RETENTION_CATEGORY_SET = new Set<string>(PRIVACY_RETENTION_CATEGORIES)
const DATA_CATEGORY_SET = new Set<string>(PRIVACY_DATA_CATEGORIES)
const SETTINGS_DATA_CATEGORY_SET = new Set<string>(PRIVACY_SETTINGS_DATA_CATEGORIES)
const RETENTION_PRESET_SET = new Set<string>(PRIVACY_RETENTION_PRESETS)
const PRIVACY_ERROR_CODE_SET = new Set<string>(PRIVACY_ERROR_CODES)
const PROVIDER_DESTINATION_CLASS_SET = new Set<string>(['local', 'remote', 'nexus-managed'])
const PROVIDER_DATA_CATEGORY_SET = new Set<string>([
  'text',
  'clipboard',
  'image-ocr',
  'audio',
  'file-context',
  'usage-metadata',
])
const PROVIDER_PURPOSE_SET = new Set<string>([
  'text-processing',
  'translation',
  'vision-and-ocr',
  'speech-processing',
  'retrieval-and-context',
  'clipboard-processing',
  'other-configured-capability',
])
const ALLOWED_RETENTION_MS = new Set<number>([1, 7, 30, 90, 180, 365].map(days => days * 24 * 60 * 60 * 1000))
const MAX_CATEGORY_SELECTIONS = PRIVACY_DATA_CATEGORIES.length
export const PRIVACY_SECRET_PASSWORD_MAX_BYTES = 1024
export const PRIVACY_SECRET_PASSWORD_MIN_CODE_POINTS = 12
const MAX_RESTORE_ID_BYTES = 96
const MAX_PREVIEW_ID_BYTES = 96

function invalidPrivacyRequest(): never {
  throw new Error('PRIVACY_REQUEST_INVALID')
}

function assertCloneableSnapshot(value: object): void {
  if (typeof structuredClone !== 'function') return
  try {
    structuredClone(value)
  } catch {
    invalidPrivacyRequest()
  }
}

function exactRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[] = [],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidPrivacyRequest()

  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = Object.getPrototypeOf(value)
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    invalidPrivacyRequest()
  }
  if (prototype !== Object.prototype && prototype !== null) invalidPrivacyRequest()

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
      invalidPrivacyRequest()
    }
    output[key] = descriptor.value
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(descriptors, key)) invalidPrivacyRequest()
  }
  return output
}

function exactArray(value: unknown, maxLength: number): readonly unknown[] {
  if (!Array.isArray(value)) invalidPrivacyRequest()
  let prototype: object | null
  try {
    prototype = Object.getPrototypeOf(value)
  } catch {
    invalidPrivacyRequest()
  }
  if (prototype !== Array.prototype) invalidPrivacyRequest()

  let descriptors: Record<string, PropertyDescriptor>
  try {
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    invalidPrivacyRequest()
  }
  const lengthDescriptor = descriptors.length
  const length = lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : -1
  if (!Number.isSafeInteger(length) || Number(length) < 0 || Number(length) > maxLength) {
    invalidPrivacyRequest()
  }

  const output: unknown[] = []
  const allowed = new Set<PropertyKey>(['length'])
  for (let index = 0; index < Number(length); index += 1) {
    const key = String(index)
    allowed.add(key)
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) invalidPrivacyRequest()
    output.push(descriptor.value)
  }
  if (Reflect.ownKeys(descriptors).some(key => !allowed.has(key))) invalidPrivacyRequest()
  return output
}

function utf8Bytes(value: string, stopAfter = Number.POSITIVE_INFINITY): number {
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index) ?? 0
    if (codePoint > 0xffff) index += 1
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4
    if (bytes > stopAfter) return bytes
  }
  return bytes
}

function hasMinimumCodePoints(value: string, minimum: number): boolean {
  let count = 0
  for (const _codePoint of value) {
    count += 1
    if (count >= minimum) return true
  }
  return false
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) return false
      index += 1
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false
    }
  }
  return true
}

export function isPrivacySecretPasswordValid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    isWellFormedUnicode(value) &&
    utf8Bytes(value, PRIVACY_SECRET_PASSWORD_MAX_BYTES) <= PRIVACY_SECRET_PASSWORD_MAX_BYTES &&
    hasMinimumCodePoints(value, PRIVACY_SECRET_PASSWORD_MIN_CODE_POINTS)
  )
}

function normalizePassword(value: unknown): string {
  if (!isPrivacySecretPasswordValid(value)) {
    invalidPrivacyRequest()
  }
  return value
}

function normalizeRestoreId(value: unknown): string {
  if (typeof value !== 'string' || utf8Bytes(value) > MAX_RESTORE_ID_BYTES || !/^restore_[\w-]{12,80}$/.test(value)) {
    invalidPrivacyRequest()
  }
  return value
}

function normalizePreviewId(value: unknown): string {
  if (typeof value !== 'string' || utf8Bytes(value) > MAX_PREVIEW_ID_BYTES || !/^preview_[\w-]{12,80}$/.test(value)) {
    invalidPrivacyRequest()
  }
  return value
}

function normalizeCategoryList<T extends string>(value: unknown, allowed: ReadonlySet<string>): readonly T[] {
  const input = exactArray(value, MAX_CATEGORY_SELECTIONS)
  if (input.length === 0) invalidPrivacyRequest()
  const seen = new Set<string>()
  const output: T[] = []
  for (const category of input) {
    if (typeof category !== 'string' || !allowed.has(category) || seen.has(category)) {
      invalidPrivacyRequest()
    }
    seen.add(category)
    output.push(category as T)
  }
  return Object.freeze(output)
}

function normalizeRetentionSelection(value: unknown): PrivacyRetentionSelectionV1 {
  const policy = exactRecord(value, ['version', 'selections'], ['version', 'selections'])
  if (policy.version !== 1) invalidPrivacyRequest()
  const selections = exactRecord(policy.selections, PRIVACY_RETENTION_CATEGORIES, PRIVACY_RETENTION_CATEGORIES)
  const output = {} as Record<PrivacyRetentionCategory, PrivacyRetentionPreset>
  for (const category of PRIVACY_RETENTION_CATEGORIES) {
    const preset = selections[category]
    if (typeof preset !== 'string' || !RETENTION_PRESET_SET.has(preset)) {
      invalidPrivacyRequest()
    }
    output[category] = preset as PrivacyRetentionPreset
  }
  return Object.freeze({ version: 1, selections: Object.freeze(output) })
}

export function normalizePrivacyRequest<T extends PrivacyRequest>(value: T): T
export function normalizePrivacyRequest(value: unknown): PrivacyRequest
export function normalizePrivacyRequest(value: unknown): PrivacyRequest {
  const request = exactRecord(
    value,
    ['operation', 'policy', 'categories', 'confirmation', 'previewId', 'password', 'restoreId', 'conflictPolicy'],
    ['operation'],
  )
  const finalize = <T extends PrivacyRequest>(normalized: T): T => {
    assertCloneableSnapshot(value as object)
    return normalized
  }

  switch (request.operation) {
    case 'policy.get': {
      exactRecord(value, ['operation'], ['operation'])
      return finalize(Object.freeze({ operation: 'policy.get' }))
    }
    case 'policy.update': {
      const exact = exactRecord(value, ['operation', 'policy'], ['operation', 'policy'])
      return finalize(
        Object.freeze({
          operation: 'policy.update',
          policy: normalizeRetentionSelection(exact.policy),
        }),
      )
    }
    case 'summary.get': {
      const exact = exactRecord(value, ['operation', 'categories'], ['operation'])
      return finalize(
        Object.freeze({
          operation: 'summary.get',
          ...(Object.hasOwn(exact, 'categories')
            ? {
                categories: normalizeCategoryList<PrivacyDataCategory>(exact.categories, SETTINGS_DATA_CATEGORY_SET),
              }
            : {}),
        }),
      )
    }
    case 'cleanup.preview':
    case 'cleanup.run': {
      const exact = exactRecord(value, ['operation', 'categories'], ['operation', 'categories'])
      const categories = normalizeCategoryList<PrivacyRetentionCategory>(exact.categories, RETENTION_CATEGORY_SET)
      return finalize(Object.freeze({ operation: request.operation, categories }))
    }
    case 'category.export': {
      const exact = exactRecord(value, ['operation', 'categories'], ['operation', 'categories'])
      return finalize(
        Object.freeze({
          operation: 'category.export',
          categories: normalizeCategoryList<PrivacyDataCategory>(exact.categories, SETTINGS_DATA_CATEGORY_SET),
        }),
      )
    }
    case 'category.delete-preview': {
      const exact = exactRecord(value, ['operation', 'categories'], ['operation', 'categories'])
      return finalize(
        Object.freeze({
          operation: 'category.delete-preview',
          categories: normalizeCategoryList<PrivacyDataCategory>(exact.categories, SETTINGS_DATA_CATEGORY_SET),
        }),
      )
    }
    case 'category.delete': {
      const exact = exactRecord(
        value,
        ['operation', 'categories', 'confirmation', 'previewId'],
        ['operation', 'categories', 'confirmation', 'previewId'],
      )
      if (exact.confirmation !== 'delete-selected-data') invalidPrivacyRequest()
      return finalize(
        Object.freeze({
          operation: 'category.delete',
          categories: normalizeCategoryList<PrivacyDataCategory>(exact.categories, SETTINGS_DATA_CATEGORY_SET),
          confirmation: 'delete-selected-data',
          previewId: normalizePreviewId(exact.previewId),
        }),
      )
    }
    case 'provider-disclosure.get': {
      exactRecord(value, ['operation'], ['operation'])
      return finalize(Object.freeze({ operation: 'provider-disclosure.get' }))
    }
    case 'secret-backup.preview': {
      exactRecord(value, ['operation'], ['operation'])
      return finalize(Object.freeze({ operation: 'secret-backup.preview' }))
    }
    case 'secret-backup.write':
    case 'secret-restore.preview': {
      const exact = exactRecord(value, ['operation', 'password'], ['operation', 'password'])
      return finalize(Object.freeze({ operation: request.operation, password: normalizePassword(exact.password) }))
    }
    case 'secret-restore.apply': {
      const exact = exactRecord(
        value,
        ['operation', 'restoreId', 'password', 'conflictPolicy'],
        ['operation', 'restoreId', 'password', 'conflictPolicy'],
      )
      if (exact.conflictPolicy !== 'skip' && exact.conflictPolicy !== 'overwrite') {
        invalidPrivacyRequest()
      }
      return finalize(
        Object.freeze({
          operation: 'secret-restore.apply',
          restoreId: normalizeRestoreId(exact.restoreId),
          password: normalizePassword(exact.password),
          conflictPolicy: exact.conflictPolicy,
        }),
      )
    }
    default:
      invalidPrivacyRequest()
  }
}

export interface PrivacyResultByOperation {
  readonly 'policy.get': PrivacyPolicyGetResult
  readonly 'policy.update': PrivacyPolicyUpdateResult
  readonly 'summary.get': PrivacySummaryResult
  readonly 'cleanup.preview': PrivacyCleanupPreviewResult
  readonly 'cleanup.run': PrivacyCleanupRunResult
  readonly 'category.export': PrivacyCategoryExportResult
  readonly 'category.delete-preview': PrivacyCategoryDeletePreviewResult
  readonly 'category.delete': PrivacyCategoryDeleteResult
  readonly 'provider-disclosure.get': PrivacyProviderDisclosureResult
  readonly 'secret-backup.preview': PrivacySecretBackupPreviewResult
  readonly 'secret-backup.write': PrivacySecretBackupWriteResult
  readonly 'secret-restore.preview': PrivacySecretRestorePreviewResult
  readonly 'secret-restore.apply': PrivacySecretRestoreApplyResult
}

const MAX_RESULT_ITEMS = 256
const MAX_PROVIDER_DISCLOSURES = 128
const MAX_PROVIDER_CAPABILITIES = 64
const MAX_PUBLIC_STRING_BYTES = 256
const PUBLIC_ID_PATTERN = /^[A-Z0-9][\w.:-]{0,127}$/i
const REPORT_ID_PATTERN = /^[\w-]{8,96}$/

function normalizeSafeCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) invalidPrivacyRequest()
  return Number(value)
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') invalidPrivacyRequest()
  return value
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return true
  }
  return false
}

function normalizePublicString(value: unknown, pattern?: RegExp): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    utf8Bytes(value) > MAX_PUBLIC_STRING_BYTES ||
    containsControlCharacter(value) ||
    (pattern !== undefined && !pattern.test(value))
  ) {
    invalidPrivacyRequest()
  }
  return value
}

function normalizeProviderDisplayName(value: unknown): string {
  const normalized = normalizePublicString(value)
  if (
    /[\\/]/.test(normalized) ||
    /[a-z][a-z0-9+.-]*:\/\//i.test(normalized) ||
    /^[a-z]:[\\/]/i.test(normalized) ||
    /^(?:[/\\]{1,2}|(?:select|insert|update|delete|drop|alter|create)\s+)/i.test(normalized) ||
    /[?&][^=\s]{1,64}=/.test(normalized)
  ) {
    invalidPrivacyRequest()
  }
  return normalized
}

function normalizeCanonicalIso(value: unknown): string {
  if (typeof value !== 'string') invalidPrivacyRequest()
  try {
    if (new Date(value).toISOString() !== value) invalidPrivacyRequest()
  } catch {
    invalidPrivacyRequest()
  }
  return value
}

function normalizeResultStringList<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string> | undefined,
  maxLength: number,
  allowEmpty = true,
): readonly T[] {
  const input = exactArray(value, maxLength)
  if (!allowEmpty && input.length === 0) invalidPrivacyRequest()
  const seen = new Set<string>()
  const output: T[] = []
  for (const item of input) {
    if (
      typeof item !== 'string' ||
      (allowed !== undefined && !allowed.has(item)) ||
      (allowed === undefined && normalizePublicString(item) !== item) ||
      seen.has(item)
    ) {
      invalidPrivacyRequest()
    }
    seen.add(item)
    output.push(item as T)
  }
  return Object.freeze(output)
}

function normalizeRetentionMs(value: unknown): number | null {
  if (value === null) return null
  if (!Number.isSafeInteger(value) || !ALLOWED_RETENTION_MS.has(Number(value))) {
    invalidPrivacyRequest()
  }
  return Number(value)
}

function normalizeRetentionPolicyResult(value: unknown): PrivacyRetentionPolicyV1 {
  const policy = exactRecord(value, ['version', 'categories'], ['version', 'categories'])
  if (policy.version !== 1) invalidPrivacyRequest()
  const categories = exactRecord(policy.categories, PRIVACY_RETENTION_CATEGORIES, PRIVACY_RETENTION_CATEGORIES)
  const output = {} as Record<
    PrivacyRetentionCategory,
    { readonly enabled: boolean; readonly retentionMs: number | null }
  >
  for (const category of PRIVACY_RETENTION_CATEGORIES) {
    const entry = exactRecord(categories[category], ['enabled', 'retentionMs'], ['enabled', 'retentionMs'])
    output[category] = Object.freeze({
      enabled: normalizeBoolean(entry.enabled),
      retentionMs: normalizeRetentionMs(entry.retentionMs),
    })
  }
  return Object.freeze({ version: 1, categories: Object.freeze(output) })
}

function normalizeCategorySummary(value: unknown): PrivacyCategorySummary {
  const summary = exactRecord(
    value,
    ['category', 'itemCount', 'byteCount', 'retentionMs', 'lastCleanupAt'],
    ['category', 'itemCount', 'byteCount', 'retentionMs'],
  )
  if (typeof summary.category !== 'string' || !DATA_CATEGORY_SET.has(summary.category)) {
    invalidPrivacyRequest()
  }
  return Object.freeze({
    category: summary.category as PrivacyDataCategory,
    itemCount: normalizeSafeCount(summary.itemCount),
    byteCount: normalizeSafeCount(summary.byteCount),
    retentionMs: normalizeRetentionMs(summary.retentionMs),
    ...(Object.hasOwn(summary, 'lastCleanupAt') ? { lastCleanupAt: normalizeCanonicalIso(summary.lastCleanupAt) } : {}),
  })
}

function normalizeDeleteImpact(value: unknown): PrivacyDeleteCategoryImpact {
  const impact = exactRecord(
    value,
    ['category', 'eligibleItemCount', 'eligibleByteCount', 'protectedItemCount'],
    ['category', 'eligibleItemCount', 'eligibleByteCount', 'protectedItemCount'],
  )
  if (typeof impact.category !== 'string' || !DATA_CATEGORY_SET.has(impact.category)) {
    invalidPrivacyRequest()
  }
  return Object.freeze({
    category: impact.category as PrivacyDataCategory,
    eligibleItemCount: normalizeSafeCount(impact.eligibleItemCount),
    eligibleByteCount: normalizeSafeCount(impact.eligibleByteCount),
    protectedItemCount: normalizeSafeCount(impact.protectedItemCount),
  })
}

function normalizeProviderDisclosure(value: unknown): PrivacyProviderDisclosure {
  const disclosure = exactRecord(
    value,
    [
      'providerId',
      'displayName',
      'destinationClass',
      'dataCategories',
      'purposes',
      'capabilities',
      'localRetentionCategories',
    ],
    [
      'providerId',
      'displayName',
      'destinationClass',
      'dataCategories',
      'purposes',
      'capabilities',
      'localRetentionCategories',
    ],
  )
  if (
    typeof disclosure.destinationClass !== 'string' ||
    !PROVIDER_DESTINATION_CLASS_SET.has(disclosure.destinationClass)
  ) {
    invalidPrivacyRequest()
  }
  const capabilities = exactArray(disclosure.capabilities, MAX_PROVIDER_CAPABILITIES).map(capability =>
    normalizePublicString(capability, PUBLIC_ID_PATTERN),
  )
  if (new Set(capabilities).size !== capabilities.length) invalidPrivacyRequest()
  return Object.freeze({
    providerId: normalizePublicString(disclosure.providerId, PUBLIC_ID_PATTERN),
    displayName: normalizeProviderDisplayName(disclosure.displayName),
    destinationClass: disclosure.destinationClass as PrivacyProviderDestinationClass,
    dataCategories: normalizeResultStringList<PrivacyProviderDataCategory>(
      disclosure.dataCategories,
      PROVIDER_DATA_CATEGORY_SET,
      PROVIDER_DATA_CATEGORY_SET.size,
    ),
    purposes: normalizeResultStringList<PrivacyProviderPurpose>(
      disclosure.purposes,
      PROVIDER_PURPOSE_SET,
      PROVIDER_PURPOSE_SET.size,
      false,
    ),
    capabilities: Object.freeze(capabilities),
    localRetentionCategories: normalizeResultStringList<PrivacyRetentionCategory>(
      disclosure.localRetentionCategories,
      RETENTION_CATEGORY_SET,
      PRIVACY_RETENTION_CATEGORIES.length,
    ),
  })
}

function normalizePrivacySuccessData(operation: keyof PrivacyResultByOperation, value: unknown): object {
  switch (operation) {
    case 'policy.get': {
      const data = exactRecord(value, ['policy', 'supportedPresets'], ['policy', 'supportedPresets'])
      return Object.freeze({
        policy: normalizeRetentionPolicyResult(data.policy),
        supportedPresets: normalizeResultStringList<PrivacyRetentionPreset>(
          data.supportedPresets,
          RETENTION_PRESET_SET,
          PRIVACY_RETENTION_PRESETS.length,
          false,
        ),
      })
    }
    case 'policy.update': {
      const data = exactRecord(value, ['policy'], ['policy'])
      return Object.freeze({ policy: normalizeRetentionPolicyResult(data.policy) })
    }
    case 'summary.get': {
      const data = exactRecord(value, ['categories'], ['categories'])
      const categories = exactArray(data.categories, MAX_RESULT_ITEMS).map(normalizeCategorySummary)
      const seen = new Set(categories.map(category => category.category))
      if (seen.size !== categories.length) invalidPrivacyRequest()
      return Object.freeze({ categories: Object.freeze(categories) })
    }
    case 'cleanup.preview': {
      const data = exactRecord(value, ['categories', 'bounded'], ['categories', 'bounded'])
      const categories = exactArray(data.categories, MAX_RESULT_ITEMS).map(normalizeDeleteImpact)
      const seen = new Set(categories.map(category => category.category))
      if (seen.size !== categories.length) invalidPrivacyRequest()
      return Object.freeze({
        categories: Object.freeze(categories),
        bounded: normalizeBoolean(data.bounded),
      })
    }
    case 'category.delete-preview': {
      const data = exactRecord(value, ['categories', 'bounded', 'previewId'], ['categories', 'bounded', 'previewId'])
      const categories = exactArray(data.categories, MAX_RESULT_ITEMS).map(normalizeDeleteImpact)
      const seen = new Set(categories.map(category => category.category))
      if (seen.size !== categories.length) invalidPrivacyRequest()
      return Object.freeze({
        categories: Object.freeze(categories),
        bounded: normalizeBoolean(data.bounded),
        previewId: normalizePreviewId(data.previewId),
      })
    }
    case 'cleanup.run': {
      const data = exactRecord(value, ['categories', 'partial', 'reportId'], ['categories', 'partial'])
      const categories = exactArray(data.categories, PRIVACY_RETENTION_CATEGORIES.length).map(value => {
        const category = exactRecord(
          value,
          ['category', 'deletedItemCount', 'deletedByteCount'],
          ['category', 'deletedItemCount', 'deletedByteCount'],
        )
        if (typeof category.category !== 'string' || !RETENTION_CATEGORY_SET.has(category.category)) {
          invalidPrivacyRequest()
        }
        return Object.freeze({
          category: category.category as PrivacyRetentionCategory,
          deletedItemCount: normalizeSafeCount(category.deletedItemCount),
          deletedByteCount: normalizeSafeCount(category.deletedByteCount),
        })
      })
      if (new Set(categories.map(category => category.category)).size !== categories.length) {
        invalidPrivacyRequest()
      }
      return Object.freeze({
        categories: Object.freeze(categories),
        partial: normalizeBoolean(data.partial),
        ...(Object.hasOwn(data, 'reportId')
          ? { reportId: normalizePublicString(data.reportId, REPORT_ID_PATTERN) }
          : {}),
      })
    }
    case 'category.export': {
      const data = exactRecord(
        value,
        ['format', 'categories', 'cancelled', 'itemCount', 'byteCount', 'reportId'],
        ['format', 'categories', 'cancelled', 'itemCount', 'byteCount', 'reportId'],
      )
      if (data.format !== 'talex.touch.privacy-export/v1') invalidPrivacyRequest()
      return Object.freeze({
        format: 'talex.touch.privacy-export/v1' as const,
        categories: normalizeResultStringList<PrivacyDataCategory>(
          data.categories,
          DATA_CATEGORY_SET,
          PRIVACY_DATA_CATEGORIES.length,
          false,
        ),
        cancelled: normalizeBoolean(data.cancelled),
        itemCount: normalizeSafeCount(data.itemCount),
        byteCount: normalizeSafeCount(data.byteCount),
        reportId: normalizePublicString(data.reportId, REPORT_ID_PATTERN),
      })
    }
    case 'category.delete': {
      const data = exactRecord(value, ['categories', 'partial'], ['categories', 'partial'])
      const categories = exactArray(data.categories, PRIVACY_DATA_CATEGORIES.length).map(value => {
        const category = exactRecord(value, ['category', 'deletedItemCount'], ['category', 'deletedItemCount'])
        if (typeof category.category !== 'string' || !DATA_CATEGORY_SET.has(category.category)) {
          invalidPrivacyRequest()
        }
        return Object.freeze({
          category: category.category as PrivacyDataCategory,
          deletedItemCount: normalizeSafeCount(category.deletedItemCount),
        })
      })
      if (new Set(categories.map(category => category.category)).size !== categories.length) {
        invalidPrivacyRequest()
      }
      return Object.freeze({ categories: Object.freeze(categories), partial: normalizeBoolean(data.partial) })
    }
    case 'provider-disclosure.get': {
      const data = exactRecord(value, ['providers'], ['providers'])
      const providers = exactArray(data.providers, MAX_PROVIDER_DISCLOSURES).map(normalizeProviderDisclosure)
      if (new Set(providers.map(provider => provider.providerId)).size !== providers.length) {
        invalidPrivacyRequest()
      }
      return Object.freeze({ providers: Object.freeze(providers) })
    }
    case 'secret-backup.preview': {
      const data = exactRecord(value, ['portableEntryCount', 'available'], ['portableEntryCount', 'available'])
      return Object.freeze({
        portableEntryCount: normalizeSafeCount(data.portableEntryCount),
        available: normalizeBoolean(data.available),
      })
    }
    case 'secret-backup.write': {
      const data = exactRecord(value, ['format', 'version', 'cancelled'], ['format', 'version', 'cancelled'])
      if (data.format !== 'talex.touch.secret-backup' || data.version !== 1) invalidPrivacyRequest()
      return Object.freeze({
        format: 'talex.touch.secret-backup' as const,
        version: 1 as const,
        cancelled: normalizeBoolean(data.cancelled),
      })
    }
    case 'secret-restore.preview': {
      const data = exactRecord(
        value,
        ['restoreId', 'totalEntryCount', 'conflictCount', 'newEntryCount'],
        ['restoreId', 'totalEntryCount', 'conflictCount', 'newEntryCount'],
      )
      const totalEntryCount = normalizeSafeCount(data.totalEntryCount)
      const conflictCount = normalizeSafeCount(data.conflictCount)
      const newEntryCount = normalizeSafeCount(data.newEntryCount)
      if (conflictCount + newEntryCount !== totalEntryCount) invalidPrivacyRequest()
      return Object.freeze({
        restoreId: normalizeRestoreId(data.restoreId),
        totalEntryCount,
        conflictCount,
        newEntryCount,
      })
    }
    case 'secret-restore.apply': {
      const data = exactRecord(
        value,
        ['importedCount', 'overwrittenCount', 'skippedCount'],
        ['importedCount', 'overwrittenCount', 'skippedCount'],
      )
      const importedCount = normalizeSafeCount(data.importedCount)
      const overwrittenCount = normalizeSafeCount(data.overwrittenCount)
      if (overwrittenCount > importedCount) invalidPrivacyRequest()
      return Object.freeze({
        importedCount,
        overwrittenCount,
        skippedCount: normalizeSafeCount(data.skippedCount),
      })
    }
  }
}

export function normalizePrivacyResult<T extends keyof PrivacyResultByOperation>(
  operation: T,
  value: unknown,
): PrivacyResultByOperation[T] {
  const result = exactRecord(value, ['ok', 'data', 'code', 'retryable', 'cancelled', 'reportId'], ['ok'])
  let normalized: object
  if (result.ok === true) {
    const exact = exactRecord(value, ['ok', 'data'], ['ok', 'data'])
    normalized = Object.freeze({ ok: true as const, data: normalizePrivacySuccessData(operation, exact.data) })
  } else if (result.ok === false) {
    const exact = exactRecord(value, ['ok', 'code', 'retryable', 'cancelled', 'reportId'], ['ok', 'code', 'retryable'])
    if (typeof exact.code !== 'string' || !PRIVACY_ERROR_CODE_SET.has(exact.code)) {
      invalidPrivacyRequest()
    }
    if (
      Object.hasOwn(exact, 'cancelled') &&
      (typeof exact.cancelled !== 'boolean' || (exact.cancelled && exact.code !== 'PRIVACY_OPERATION_CANCELLED'))
    ) {
      invalidPrivacyRequest()
    }
    normalized = Object.freeze({
      ok: false as const,
      code: exact.code as PrivacyErrorCode,
      retryable: normalizeBoolean(exact.retryable),
      ...(Object.hasOwn(exact, 'cancelled') ? { cancelled: exact.cancelled as boolean } : {}),
      ...(Object.hasOwn(exact, 'reportId')
        ? { reportId: normalizePublicString(exact.reportId, REPORT_ID_PATTERN) }
        : {}),
    })
  } else {
    invalidPrivacyRequest()
  }
  assertCloneableSnapshot(value as object)
  return normalized as PrivacyResultByOperation[T]
}
