import type { PrivacyDataCategory } from '@talex-touch/utils/transport/events/types'
import type {
  PrivacyOwnerCode,
  PrivacyOwnerDeleteRequest,
  PrivacyOwnerDeleteResult,
  PrivacyOwnerExportRequest,
  PrivacyOwnerInspectionResult,
  PrivacyOwnerInspectRequest,
  PrivacyOwnerPreviewResult
} from './data-owner'
import { isProxy } from 'node:util/types'
import { scheduleDbWrite } from '../../db/db-write'
import { isSupportedPrivacyRetentionMs } from './retention-policy'

export interface PrivacyOwnerLimits {
  readonly batchSize: number
  readonly maxRows: number
  readonly maxDurationMs: number
}

export type PrivacyOwnerWriteScheduler = <T>(
  label: string,
  operation: () => Promise<T>
) => Promise<T>

// SQLITE_BUSY retry is scheduler-owned (delayed re-enqueue); do not re-wrap the
// operation in withSqliteRetry here.
export const schedulePrivacyOwnerWrite: PrivacyOwnerWriteScheduler = (label, operation) =>
  scheduleDbWrite(label, operation, {
    priority: 'background',
    dropPolicy: 'none',
    maxQueueWaitMs: 15_000
  })

export function normalizePrivacyOwnerLimits(
  limits: Partial<PrivacyOwnerLimits> | undefined
): PrivacyOwnerLimits {
  const readLimit = (key: keyof PrivacyOwnerLimits, fallback: number): number => {
    try {
      if (typeof limits !== 'object' || limits === null || isProxy(limits)) return fallback
      const prototype = Object.getPrototypeOf(limits)
      if (prototype !== Object.prototype && prototype !== null) return fallback
      const descriptor = Object.getOwnPropertyDescriptor(limits, key)
      const value = descriptor && 'value' in descriptor ? descriptor.value : undefined
      return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback
    } catch {
      return fallback
    }
  }

  return Object.freeze({
    batchSize: Math.min(200, Math.max(1, readLimit('batchSize', 100))),
    maxRows: Math.min(10_000, Math.max(1, readLimit('maxRows', 2_000))),
    maxDurationMs: Math.min(30_000, Math.max(100, readLimit('maxDurationMs', 10_000)))
  })
}

export interface PrivacyDeleteScope {
  readonly kind: 'eligible' | 'disabled' | 'invalid'
  readonly cutoffMs: number
  readonly includeProtected: boolean
}

interface PrivacyOwnerRequestSnapshot {
  readonly category: PrivacyDataCategory
  readonly nowMs: number
  readonly policy: {
    readonly enabled: boolean
    readonly retentionMs: number | null
  }
  readonly mode?: 'retention' | 'manual-delete'
  readonly confirmation?: 'delete-selected-data'
}

function ownDataValue(record: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key)
  return descriptor && 'value' in descriptor ? descriptor.value : undefined
}

function isPlainRecord(value: unknown): value is Record<PropertyKey, unknown> {
  if (typeof value !== 'object' || value === null || isProxy(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function readPrivacyOwnerRequest(
  request: PrivacyOwnerInspectRequest | PrivacyOwnerDeleteRequest
): PrivacyOwnerRequestSnapshot | null {
  try {
    if (!isPlainRecord(request)) return null
    const descriptors = Object.getOwnPropertyDescriptors(request)
    const modeDescriptor = descriptors.mode
    const confirmationDescriptor = descriptors.confirmation
    const allowedKeys = new Set(
      modeDescriptor === undefined
        ? ['category', 'nowMs', 'policy']
        : ['category', 'nowMs', 'policy', 'mode', 'confirmation']
    )
    if (
      Reflect.ownKeys(descriptors).some(
        (key) =>
          typeof key !== 'string' ||
          !allowedKeys.has(key) ||
          !descriptors[key]?.enumerable ||
          !Object.hasOwn(descriptors[key]!, 'value')
      ) ||
      !['category', 'nowMs', 'policy'].every((key) => Object.hasOwn(descriptors, key)) ||
      (modeDescriptor === undefined && confirmationDescriptor !== undefined)
    ) {
      return null
    }
    const category = ownDataValue(request, 'category')
    const nowMs = ownDataValue(request, 'nowMs')
    const policy = ownDataValue(request, 'policy')
    const mode = ownDataValue(request, 'mode')
    const confirmation = ownDataValue(request, 'confirmation')
    if (
      typeof category !== 'string' ||
      !Number.isSafeInteger(nowMs) ||
      (nowMs as number) < 0 ||
      !isPlainRecord(policy)
    ) {
      return null
    }
    const policyDescriptors = Object.getOwnPropertyDescriptors(policy)
    if (
      Reflect.ownKeys(policyDescriptors).length !== 2 ||
      !['enabled', 'retentionMs'].every((key) => {
        const descriptor = policyDescriptors[key]
        return descriptor?.enumerable && Object.hasOwn(descriptor, 'value')
      }) ||
      Reflect.ownKeys(policyDescriptors).some(
        (key) => typeof key !== 'string' || (key !== 'enabled' && key !== 'retentionMs')
      )
    ) {
      return null
    }
    const enabled = ownDataValue(policy, 'enabled')
    const retentionMs = ownDataValue(policy, 'retentionMs')
    if (typeof enabled !== 'boolean' || !isSupportedPrivacyRetentionMs(retentionMs)) return null
    if (mode !== undefined && mode !== 'retention' && mode !== 'manual-delete') return null
    if (confirmation !== undefined && confirmation !== 'delete-selected-data') return null
    return {
      category: category as PrivacyDataCategory,
      nowMs: nowMs as number,
      policy: { enabled, retentionMs },
      mode: mode as PrivacyOwnerRequestSnapshot['mode'],
      confirmation: confirmation as PrivacyOwnerRequestSnapshot['confirmation']
    }
  } catch {
    return null
  }
}

export function isValidPrivacyOwnerExportRequest(request: PrivacyOwnerExportRequest): boolean {
  try {
    if (!isPlainRecord(request)) return false
    const keys = Reflect.ownKeys(Object.getOwnPropertyDescriptors(request))
    if (keys.length !== 2 || !keys.includes('category') || !keys.includes('nowMs')) return false
    const category = ownDataValue(request, 'category')
    const nowMs = ownDataValue(request, 'nowMs')
    return typeof category === 'string' && Number.isSafeInteger(nowMs) && (nowMs as number) >= 0
  } catch {
    return false
  }
}

export function isValidPrivacyOwnerRequest(
  request: PrivacyOwnerInspectRequest | PrivacyOwnerDeleteRequest
): boolean {
  return readPrivacyOwnerRequest(request) !== null
}

export function resolvePrivacyDeleteScope(
  request: PrivacyOwnerDeleteRequest,
  destructive: boolean
): PrivacyDeleteScope {
  const snapshot = readPrivacyOwnerRequest(request)
  if (!snapshot || !snapshot.mode) {
    return { kind: 'invalid', cutoffMs: 0, includeProtected: false }
  }
  if (snapshot.mode === 'manual-delete') {
    if (destructive && snapshot.confirmation !== 'delete-selected-data') {
      return { kind: 'invalid', cutoffMs: Number.MAX_SAFE_INTEGER, includeProtected: false }
    }
    return {
      kind: 'eligible',
      cutoffMs: Number.MAX_SAFE_INTEGER,
      includeProtected: snapshot.confirmation === 'delete-selected-data' || !destructive
    }
  }
  if (!snapshot.policy.enabled || snapshot.policy.retentionMs === null) {
    return { kind: 'disabled', cutoffMs: snapshot.nowMs, includeProtected: false }
  }
  return {
    kind: 'eligible',
    cutoffMs: snapshot.nowMs - snapshot.policy.retentionMs,
    includeProtected: false
  }
}

export function toUnixSeconds(timestampMs: number): number {
  return Math.floor(timestampMs / 1000)
}

export interface MutableDeleteProgress {
  deletedItemCount: number
  deletedByteCount: number
  failedItemCount: number
  protectedItemCount: number
  batches: number
}

export function emptyDeleteProgress(): MutableDeleteProgress {
  return {
    deletedItemCount: 0,
    deletedByteCount: 0,
    failedItemCount: 0,
    protectedItemCount: 0,
    batches: 0
  }
}

function nonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value))
}

function addBounded(left: number, right: unknown): number {
  return Math.min(Number.MAX_SAFE_INTEGER, nonNegativeInteger(left) + nonNegativeInteger(right))
}

export function privacyDeleteResult(
  category: PrivacyDataCategory,
  code: PrivacyOwnerCode,
  progress: MutableDeleteProgress,
  options: {
    ok?: boolean
    retryable?: boolean
    partial?: boolean
    cancelled?: boolean
  } = {}
): PrivacyOwnerDeleteResult {
  const normalizedProgress = {
    deletedItemCount: nonNegativeInteger(progress.deletedItemCount),
    deletedByteCount: nonNegativeInteger(progress.deletedByteCount),
    failedItemCount: nonNegativeInteger(progress.failedItemCount),
    protectedItemCount: nonNegativeInteger(progress.protectedItemCount),
    batches: nonNegativeInteger(progress.batches)
  }
  return Object.freeze({
    ok: options.ok ?? code === 'PRIVACY_OWNER_COMPLETED',
    code,
    retryable: options.retryable ?? false,
    category,
    ...normalizedProgress,
    partial: options.partial ?? normalizedProgress.deletedItemCount > 0,
    cancelled: options.cancelled ?? false
  })
}

export function privacyInspectionResult(
  category: PrivacyDataCategory,
  retentionMs: number | null,
  itemCount: number,
  byteCount: number,
  code: PrivacyOwnerCode = 'PRIVACY_OWNER_COMPLETED'
): PrivacyOwnerInspectionResult {
  return Object.freeze({
    ok: code === 'PRIVACY_OWNER_COMPLETED',
    code,
    retryable:
      code === 'PRIVACY_OWNER_DATABASE_FAILED' || code === 'PRIVACY_OWNER_RESOURCE_DELETE_FAILED',
    category,
    itemCount: nonNegativeInteger(itemCount),
    byteCount: nonNegativeInteger(byteCount),
    retentionMs
  })
}

export function privacyPreviewResult(
  category: PrivacyDataCategory,
  values: {
    eligibleItemCount?: number
    eligibleByteCount?: number
    protectedItemCount?: number
    bounded?: boolean
  } = {},
  code: PrivacyOwnerCode = 'PRIVACY_OWNER_COMPLETED'
): PrivacyOwnerPreviewResult {
  return Object.freeze({
    ok: code === 'PRIVACY_OWNER_COMPLETED',
    code,
    retryable:
      code === 'PRIVACY_OWNER_DATABASE_FAILED' || code === 'PRIVACY_OWNER_RESOURCE_DELETE_FAILED',
    category,
    eligibleItemCount: nonNegativeInteger(values.eligibleItemCount),
    eligibleByteCount: nonNegativeInteger(values.eligibleByteCount),
    protectedItemCount: nonNegativeInteger(values.protectedItemCount),
    bounded: values.bounded ?? false
  })
}

export function isOwnerDeadlineExceeded(startedAt: number, limits: PrivacyOwnerLimits): boolean {
  return Date.now() - startedAt >= limits.maxDurationMs
}

export function addProgress(
  target: MutableDeleteProgress,
  source: Partial<MutableDeleteProgress>
): void {
  target.deletedItemCount = addBounded(target.deletedItemCount, source.deletedItemCount)
  target.deletedByteCount = addBounded(target.deletedByteCount, source.deletedByteCount)
  target.failedItemCount = addBounded(target.failedItemCount, source.failedItemCount)
  target.protectedItemCount = addBounded(target.protectedItemCount, source.protectedItemCount)
  target.batches = addBounded(target.batches, source.batches)
}
