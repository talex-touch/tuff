import {
  PRIVACY_DATA_CATEGORIES,
  type PrivacyDataCategory,
  type PrivacyRetentionCategoryPolicy,
  type PrivacyRetentionPolicyV1
} from '@talex-touch/utils/transport/events/types'
import { isProxy } from 'node:util/types'

export type PrivacyOwnerCode =
  | 'PRIVACY_OWNER_COMPLETED'
  | 'PRIVACY_OWNER_DISABLED'
  | 'PRIVACY_OWNER_CANCELLED'
  | 'PRIVACY_OWNER_LIMIT_REACHED'
  | 'PRIVACY_OWNER_DEADLINE_EXCEEDED'
  | 'PRIVACY_OWNER_DATABASE_FAILED'
  | 'PRIVACY_OWNER_RESOURCE_DELETE_FAILED'
  | 'PRIVACY_OWNER_INVALID_REQUEST'

interface PrivacyOwnerOutcome {
  readonly ok: boolean
  readonly code: PrivacyOwnerCode
  readonly retryable: boolean
}

export interface PrivacyOwnerInspectRequest {
  readonly category: PrivacyDataCategory
  readonly policy: PrivacyRetentionCategoryPolicy
  readonly nowMs: number
}

export interface PrivacyOwnerDeleteRequest extends PrivacyOwnerInspectRequest {
  readonly mode: 'retention' | 'manual-delete'
  readonly confirmation?: 'delete-selected-data'
}

export interface PrivacyOwnerExportRequest {
  readonly category: PrivacyDataCategory
  readonly nowMs: number
}

export interface PrivacyOwnerExportWriteResult {
  readonly byteCount: number
}

export interface PrivacyOwnerExportWriter {
  write: (record: Readonly<Record<string, unknown>>) => Promise<PrivacyOwnerExportWriteResult>
}

export interface PrivacyOwnerInspectionResult extends PrivacyOwnerOutcome {
  readonly category: PrivacyDataCategory
  readonly itemCount: number
  readonly byteCount: number
  readonly retentionMs: number | null
}

export interface PrivacyOwnerPreviewResult extends PrivacyOwnerOutcome {
  readonly category: PrivacyDataCategory
  readonly eligibleItemCount: number
  readonly eligibleByteCount: number
  readonly protectedItemCount: number
  readonly bounded: boolean
}

export interface PrivacyOwnerDeleteResult extends PrivacyOwnerOutcome {
  readonly category: PrivacyDataCategory
  readonly deletedItemCount: number
  readonly deletedByteCount: number
  readonly failedItemCount: number
  readonly protectedItemCount: number
  readonly batches: number
  readonly partial: boolean
  readonly cancelled: boolean
}

export interface PrivacyOwnerExportResult extends PrivacyOwnerOutcome {
  readonly category: PrivacyDataCategory
  readonly exportedItemCount: number
  readonly exportedByteCount: number
  readonly partial: boolean
  readonly cancelled: boolean
}

export interface PrivacyDataOwner {
  readonly categories: readonly PrivacyDataCategory[]
  inspect: (
    request: PrivacyOwnerInspectRequest,
    signal: AbortSignal
  ) => Promise<PrivacyOwnerInspectionResult>
  previewDelete: (
    request: PrivacyOwnerDeleteRequest,
    signal: AbortSignal
  ) => Promise<PrivacyOwnerPreviewResult>
  delete: (
    request: PrivacyOwnerDeleteRequest,
    signal: AbortSignal
  ) => Promise<PrivacyOwnerDeleteResult>
  export: (
    request: PrivacyOwnerExportRequest,
    writer: PrivacyOwnerExportWriter,
    signal: AbortSignal
  ) => Promise<PrivacyOwnerExportResult>
  applyRetention: (
    policy: PrivacyRetentionPolicyV1,
    nowMs: number,
    signal: AbortSignal
  ) => Promise<readonly PrivacyOwnerDeleteResult[]>
}

export type PrivacyDataOwnerCandidate = PrivacyDataOwner

function ownerCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value))
    : 0
}

export function privacyOwnerCompletedDelete(
  category: PrivacyDataCategory,
  values: Partial<
    Pick<
      PrivacyOwnerDeleteResult,
      | 'deletedItemCount'
      | 'deletedByteCount'
      | 'failedItemCount'
      | 'protectedItemCount'
      | 'batches'
      | 'partial'
      | 'cancelled'
    >
  > = {}
): PrivacyOwnerDeleteResult {
  return Object.freeze({
    ok: true,
    code: 'PRIVACY_OWNER_COMPLETED',
    retryable: false,
    category,
    deletedItemCount: ownerCount(values.deletedItemCount),
    deletedByteCount: ownerCount(values.deletedByteCount),
    failedItemCount: ownerCount(values.failedItemCount),
    protectedItemCount: ownerCount(values.protectedItemCount),
    batches: ownerCount(values.batches),
    partial: values.partial ?? false,
    cancelled: values.cancelled ?? false
  })
}

export function privacyOwnerExportResult(
  category: PrivacyDataCategory,
  code: PrivacyOwnerCode,
  values: Partial<
    Pick<
      PrivacyOwnerExportResult,
      'exportedItemCount' | 'exportedByteCount' | 'partial' | 'cancelled'
    >
  > = {},
  options: { ok?: boolean; retryable?: boolean } = {}
): PrivacyOwnerExportResult {
  return Object.freeze({
    ok: options.ok ?? code === 'PRIVACY_OWNER_COMPLETED',
    code,
    retryable: options.retryable ?? false,
    category,
    exportedItemCount: ownerCount(values.exportedItemCount),
    exportedByteCount: ownerCount(values.exportedByteCount),
    partial: values.partial ?? false,
    cancelled: values.cancelled ?? false
  })
}

export function privacyOwnerCompletedExport(
  category: PrivacyDataCategory,
  values: Partial<
    Pick<
      PrivacyOwnerExportResult,
      'exportedItemCount' | 'exportedByteCount' | 'partial' | 'cancelled'
    >
  > = {}
): PrivacyOwnerExportResult {
  return Object.freeze({
    ok: true,
    code: 'PRIVACY_OWNER_COMPLETED',
    retryable: false,
    category,
    exportedItemCount: ownerCount(values.exportedItemCount),
    exportedByteCount: ownerCount(values.exportedByteCount),
    partial: values.partial ?? false,
    cancelled: values.cancelled ?? false
  })
}

const REQUIRED_KEYS = [
  'categories',
  'inspect',
  'previewDelete',
  'delete',
  'export',
  'applyRetention'
] as const
const categorySet = new Set<PrivacyDataCategory>(PRIVACY_DATA_CATEGORIES)
const ownerCodeSet = new Set<PrivacyOwnerCode>([
  'PRIVACY_OWNER_COMPLETED',
  'PRIVACY_OWNER_DISABLED',
  'PRIVACY_OWNER_CANCELLED',
  'PRIVACY_OWNER_LIMIT_REACHED',
  'PRIVACY_OWNER_DEADLINE_EXCEEDED',
  'PRIVACY_OWNER_DATABASE_FAILED',
  'PRIVACY_OWNER_RESOURCE_DELETE_FAILED',
  'PRIVACY_OWNER_INVALID_REQUEST'
])
const successfulOwnerCodes = new Set<PrivacyOwnerCode>([
  'PRIVACY_OWNER_COMPLETED',
  'PRIVACY_OWNER_DISABLED'
])

function invalidOwner(): never {
  throw new Error('PRIVACY_OWNER_INVALID')
}

function exactOwnerArray(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || isProxy(value) || value.length > maximum) invalidOwner()
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const allowedKeys = new Set<PropertyKey>(['length'])
    const result: unknown[] = []
    for (let index = 0; index < value.length; index += 1) {
      const key = String(index)
      allowedKeys.add(key)
      const descriptor = descriptors[key]
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalidOwner()
      result.push(descriptor.value)
    }
    if (Reflect.ownKeys(descriptors).some((key) => !allowedKeys.has(key))) invalidOwner()
    return Object.freeze(result)
  } catch {
    return invalidOwner()
  }
}

function exactOwnerResult(
  value: unknown,
  keys: readonly string[]
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || isProxy(value))
    invalidOwner()
  try {
    const prototype = Object.getPrototypeOf(value)
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (prototype !== Object.prototype && prototype !== null) invalidOwner()
    if (
      Reflect.ownKeys(descriptors).length !== keys.length ||
      keys.some((key) => {
        const descriptor = descriptors[key]
        return !descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
      }) ||
      Reflect.ownKeys(descriptors).some((key) => typeof key !== 'string' || !keys.includes(key))
    ) {
      invalidOwner()
    }
    return Object.freeze(Object.fromEntries(keys.map((key) => [key, descriptors[key]!.value])))
  } catch {
    return invalidOwner()
  }
}

function validateOwnerOutcome(
  values: Readonly<Record<string, unknown>>,
  expectedCategory: PrivacyDataCategory
): void {
  if (
    values.category !== expectedCategory ||
    typeof values.ok !== 'boolean' ||
    typeof values.code !== 'string' ||
    !ownerCodeSet.has(values.code as PrivacyOwnerCode) ||
    values.ok !== successfulOwnerCodes.has(values.code as PrivacyOwnerCode) ||
    typeof values.retryable !== 'boolean'
  ) {
    invalidOwner()
  }
}

function validateCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) invalidOwner()
  return Number(value)
}

export function normalizePrivacyOwnerInspectionResult(
  value: unknown,
  expectedCategory: PrivacyDataCategory
): PrivacyOwnerInspectionResult {
  const values = exactOwnerResult(value, [
    'ok',
    'code',
    'retryable',
    'category',
    'itemCount',
    'byteCount',
    'retentionMs'
  ])
  validateOwnerOutcome(values, expectedCategory)
  if (
    values.retentionMs !== null &&
    (!Number.isSafeInteger(values.retentionMs) || Number(values.retentionMs) < 0)
  ) {
    invalidOwner()
  }
  return Object.freeze({
    ok: values.ok as boolean,
    code: values.code as PrivacyOwnerCode,
    retryable: values.retryable as boolean,
    category: expectedCategory,
    itemCount: validateCount(values.itemCount),
    byteCount: validateCount(values.byteCount),
    retentionMs: values.retentionMs as number | null
  })
}

export function normalizePrivacyOwnerPreviewResult(
  value: unknown,
  expectedCategory: PrivacyDataCategory
): PrivacyOwnerPreviewResult {
  const values = exactOwnerResult(value, [
    'ok',
    'code',
    'retryable',
    'category',
    'eligibleItemCount',
    'eligibleByteCount',
    'protectedItemCount',
    'bounded'
  ])
  validateOwnerOutcome(values, expectedCategory)
  if (typeof values.bounded !== 'boolean') invalidOwner()
  return Object.freeze({
    ok: values.ok as boolean,
    code: values.code as PrivacyOwnerCode,
    retryable: values.retryable as boolean,
    category: expectedCategory,
    eligibleItemCount: validateCount(values.eligibleItemCount),
    eligibleByteCount: validateCount(values.eligibleByteCount),
    protectedItemCount: validateCount(values.protectedItemCount),
    bounded: values.bounded
  })
}

export function normalizePrivacyOwnerDeleteResult(
  value: unknown,
  expectedCategory: PrivacyDataCategory
): PrivacyOwnerDeleteResult {
  const values = exactOwnerResult(value, [
    'ok',
    'code',
    'retryable',
    'category',
    'deletedItemCount',
    'deletedByteCount',
    'failedItemCount',
    'protectedItemCount',
    'batches',
    'partial',
    'cancelled'
  ])
  validateOwnerOutcome(values, expectedCategory)
  if (
    typeof values.partial !== 'boolean' ||
    typeof values.cancelled !== 'boolean' ||
    values.cancelled !== (values.code === 'PRIVACY_OWNER_CANCELLED')
  ) {
    invalidOwner()
  }
  return Object.freeze({
    ok: values.ok as boolean,
    code: values.code as PrivacyOwnerCode,
    retryable: values.retryable as boolean,
    category: expectedCategory,
    deletedItemCount: validateCount(values.deletedItemCount),
    deletedByteCount: validateCount(values.deletedByteCount),
    failedItemCount: validateCount(values.failedItemCount),
    protectedItemCount: validateCount(values.protectedItemCount),
    batches: validateCount(values.batches),
    partial: values.partial,
    cancelled: values.cancelled
  })
}

export function normalizePrivacyOwnerExportResult(
  value: unknown,
  expectedCategory: PrivacyDataCategory
): PrivacyOwnerExportResult {
  const values = exactOwnerResult(value, [
    'ok',
    'code',
    'retryable',
    'category',
    'exportedItemCount',
    'exportedByteCount',
    'partial',
    'cancelled'
  ])
  validateOwnerOutcome(values, expectedCategory)
  if (
    typeof values.partial !== 'boolean' ||
    typeof values.cancelled !== 'boolean' ||
    values.cancelled !== (values.code === 'PRIVACY_OWNER_CANCELLED')
  ) {
    invalidOwner()
  }
  return Object.freeze({
    ok: values.ok as boolean,
    code: values.code as PrivacyOwnerCode,
    retryable: values.retryable as boolean,
    category: expectedCategory,
    exportedItemCount: validateCount(values.exportedItemCount),
    exportedByteCount: validateCount(values.exportedByteCount),
    partial: values.partial,
    cancelled: values.cancelled
  })
}

export function definePrivacyDataOwner(candidate: PrivacyDataOwnerCandidate): PrivacyDataOwner {
  try {
    if (typeof candidate !== 'object' || candidate === null || isProxy(candidate)) invalidOwner()
    const prototype = Object.getPrototypeOf(candidate)
    if (prototype !== Object.prototype && prototype !== null) invalidOwner()
    const ownKeys = Reflect.ownKeys(candidate)
    if (
      ownKeys.length !== REQUIRED_KEYS.length ||
      REQUIRED_KEYS.some((key) => !ownKeys.includes(key))
    ) {
      invalidOwner()
    }

    const values = Object.fromEntries(
      REQUIRED_KEYS.map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key)
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalidOwner()
        return [key, descriptor.value]
      })
    ) as unknown as PrivacyDataOwnerCandidate

    const categories = exactOwnerArray(
      values.categories,
      PRIVACY_DATA_CATEGORIES.length
    ) as readonly PrivacyDataCategory[]
    if (
      categories.length === 0 ||
      categories.some((category) => !categorySet.has(category)) ||
      new Set(categories).size !== categories.length ||
      typeof values.inspect !== 'function' ||
      isProxy(values.inspect) ||
      typeof values.previewDelete !== 'function' ||
      isProxy(values.previewDelete) ||
      typeof values.delete !== 'function' ||
      isProxy(values.delete) ||
      typeof values.export !== 'function' ||
      isProxy(values.export) ||
      typeof values.applyRetention !== 'function' ||
      isProxy(values.applyRetention)
    ) {
      invalidOwner()
    }

    const receiver = Object.freeze({ ...values, categories })
    const inspect = values.inspect.bind(receiver)
    const previewDelete = values.previewDelete.bind(receiver)
    const deleteData = values.delete.bind(receiver)
    const exportData = values.export.bind(receiver)
    const applyRetention = values.applyRetention.bind(receiver)
    let tail = Promise.resolve()
    const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
      const result = tail.then(operation, operation)
      tail = result.then(
        () => undefined,
        () => undefined
      )
      return result
    }

    return Object.freeze({
      categories,
      inspect: (request, signal) => serialize(() => inspect(request, signal)),
      previewDelete: (request, signal) => serialize(() => previewDelete(request, signal)),
      delete: (request, signal) => serialize(() => deleteData(request, signal)),
      export: (request, writer, signal) => serialize(() => exportData(request, writer, signal)),
      applyRetention: (policy, nowMs, signal) =>
        serialize(() => applyRetention(policy, nowMs, signal))
    })
  } catch {
    return invalidOwner()
  }
}

export interface PrivacyDataOwnerRegistry {
  get: (category: PrivacyDataCategory) => PrivacyDataOwner
  list: () => readonly PrivacyDataOwner[]
}

export function createPrivacyDataOwnerRegistry(
  owners: readonly PrivacyDataOwner[]
): PrivacyDataOwnerRegistry {
  const byCategory = new Map<PrivacyDataCategory, PrivacyDataOwner>()
  const ownerCandidates = exactOwnerArray(owners, PRIVACY_DATA_CATEGORIES.length)
  const snapshot = Object.freeze(
    ownerCandidates.map((owner) => definePrivacyDataOwner(owner as PrivacyDataOwner))
  )
  for (const owner of snapshot) {
    for (const category of owner.categories) {
      if (byCategory.has(category)) throw new Error('PRIVACY_OWNER_CATEGORY_DUPLICATE')
      byCategory.set(category, owner)
    }
  }

  return Object.freeze({
    get(category: PrivacyDataCategory) {
      const owner = byCategory.get(category)
      if (!owner) throw new Error('PRIVACY_OWNER_CATEGORY_UNAVAILABLE')
      return owner
    },
    list() {
      return snapshot
    }
  })
}
