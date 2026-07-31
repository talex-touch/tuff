import type {
  PrivacyCategoryDeletePreviewResult,
  PrivacyCategoryDeleteResult,
  PrivacyCategoryExportResult,
  PrivacyCategorySummary,
  PrivacyCleanupPreviewResult,
  PrivacyCleanupRunResult,
  PrivacyDataCategory,
  PrivacyPolicyGetResult,
  PrivacyPolicyUpdateResult,
  PrivacyProviderDisclosureResult,
  PrivacyRetentionCategory,
  PrivacyRetentionCategoryPolicy,
  PrivacyRetentionPolicyV1,
  PrivacyRetentionSelectionV1,
  PrivacySecretBackupPreviewResult,
  PrivacySecretBackupWriteResult,
  PrivacySecretRestoreApplyResult,
  PrivacySecretRestoreConflictPolicy,
  PrivacySecretRestorePreviewResult,
  PrivacySummaryResult
} from '@talex-touch/utils/transport/events/types'
import type {
  PrivacyDataOwnerRegistry,
  PrivacyOwnerDeleteResult,
  PrivacyOwnerPreviewResult
} from './data-owner'
import type { PrivacyCategoryExporter } from './privacy-export'
import type { PrivacySecretService } from './privacy-secret-service'
import type { PrivacyProviderDisclosureService } from './provider-disclosure'
import type { PrivacyRetentionPolicyStore } from './retention-policy-store'
import { randomUUID } from 'node:crypto'
import { isProxy } from 'node:util/types'
import {
  PRIVACY_DATA_CATEGORIES,
  PRIVACY_SETTINGS_DATA_CATEGORIES,
  normalizePrivacyRequest,
  normalizePrivacyResult
} from '@talex-touch/utils/transport/events/types'
import {
  normalizePrivacyOwnerDeleteResult,
  normalizePrivacyOwnerInspectionResult,
  normalizePrivacyOwnerPreviewResult
} from './data-owner'
import { PRIVACY_RETENTION_CATEGORIES, privacyRetentionSelectionToPolicy } from './retention-policy'

export interface PrivacyLifecycleErrorReport {
  readonly code: string
  readonly operation: string
  readonly categories?: readonly string[]
  readonly ownerCodes?: readonly string[]
}

export interface PrivacyLifecycleServiceOptions {
  readonly ownerRegistry: PrivacyDataOwnerRegistry
  readonly policyStore: Pick<PrivacyRetentionPolicyStore, 'load' | 'save'>
  readonly exporter: PrivacyCategoryExporter
  readonly disclosure: PrivacyProviderDisclosureService
  readonly secrets: PrivacySecretService
  readonly reportError: (report: PrivacyLifecycleErrorReport) => unknown
  readonly now?: () => number
  readonly operationTimeoutMs?: number
}

export interface PrivacyLifecycleService {
  getPolicy: () => Promise<PrivacyPolicyGetResult>
  updatePolicy: (selection: PrivacyRetentionSelectionV1) => Promise<PrivacyPolicyUpdateResult>
  getSummary: (categories?: readonly PrivacyDataCategory[]) => Promise<PrivacySummaryResult>
  previewCleanup: (
    categories?: readonly PrivacyRetentionCategory[]
  ) => Promise<PrivacyCleanupPreviewResult>
  runCleanup: (
    categories?: readonly PrivacyRetentionCategory[],
    signal?: AbortSignal
  ) => Promise<PrivacyCleanupRunResult>
  runScheduledCleanup: (signal?: AbortSignal) => Promise<PrivacyCleanupRunResult>
  previewCategoryDelete: (
    categories: readonly PrivacyDataCategory[]
  ) => Promise<PrivacyCategoryDeletePreviewResult>
  deleteCategories: (
    categories: readonly PrivacyDataCategory[],
    confirmation: 'delete-selected-data',
    previewId: string
  ) => Promise<PrivacyCategoryDeleteResult>
  exportCategories: (
    categories: readonly PrivacyDataCategory[]
  ) => Promise<PrivacyCategoryExportResult>
  getProviders: () => Promise<PrivacyProviderDisclosureResult>
  getProviderDisclosure: () => Promise<PrivacyProviderDisclosureResult>
  backupSecretsPreview: () => Promise<PrivacySecretBackupPreviewResult>
  backupSecretsWrite: (password: string) => Promise<PrivacySecretBackupWriteResult>
  restoreSecretsPreview: (password: string) => Promise<PrivacySecretRestorePreviewResult>
  restoreSecretsApply: (
    restoreId: string,
    password: string,
    conflictPolicy: PrivacySecretRestoreConflictPolicy
  ) => Promise<PrivacySecretRestoreApplyResult>
  destroy: () => Promise<void>
}

const OPTION_KEYS = new Set([
  'ownerRegistry',
  'policyStore',
  'exporter',
  'disclosure',
  'secrets',
  'reportError',
  'now',
  'operationTimeoutMs'
])
const DATA_CATEGORY_SET = new Set<string>(PRIVACY_SETTINGS_DATA_CATEGORIES)
const RETENTION_SET = new Set<string>(PRIVACY_RETENTION_CATEGORIES)
const NON_RETENTION_POLICY: PrivacyRetentionCategoryPolicy = Object.freeze({
  enabled: false,
  retentionMs: null
})
const REPORT_ID = /^[A-Z0-9][\w.:-]{7,127}$/i
const DELETE_PREVIEW_ID = /^preview_[\w-]{12,80}$/
const DELETE_PREVIEW_TTL_MS = 5 * 60 * 1_000
const MAX_DELETE_PREVIEWS = 16

function snapshotExact(
  value: unknown,
  keys: ReadonlySet<string>,
  code: string
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || isProxy(value)) {
    throw new Error(code)
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(code)
  }
  const result: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(Object.getOwnPropertyDescriptors(value))) {
    if (typeof key !== 'string' || !keys.has(key)) throw new Error(code)
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error(code)
    result[key] = descriptor.value
  }
  return result
}

function snapshotMethods(
  value: unknown,
  required: readonly string[],
  code: string
): Record<string, (...args: never[]) => unknown> {
  const values = snapshotExact(value, new Set(required), code)
  const result: Record<string, (...args: never[]) => unknown> = Object.create(null)
  for (const name of required) {
    const method = values[name]
    if (typeof method !== 'function' || isProxy(method)) throw new Error(code)
    result[name] = method.bind(value) as (...args: never[]) => unknown
  }
  return result
}

function ownDataValue(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || isProxy(value)) return undefined
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined
  } catch {
    return undefined
  }
}

function reportIdFrom(value: unknown): string | undefined {
  const id = ownDataValue(value, 'id') ?? ownDataValue(value, 'reportId')
  return typeof id === 'string' && REPORT_ID.test(id) ? id : undefined
}

function safeCount(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : 0
}

function categoryList<T extends PrivacyDataCategory>(
  value: readonly T[] | undefined,
  allowed: ReadonlySet<string>,
  fallback: readonly T[]
): readonly T[] | null {
  if (value === undefined) return Object.freeze([...fallback])
  if (
    !Array.isArray(value) ||
    isProxy(value) ||
    value.length < 1 ||
    value.length > PRIVACY_DATA_CATEGORIES.length
  )
    return null
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) return null
  const result: T[] = []
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)]
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null
    const category = descriptor.value
    if (typeof category !== 'string' || !allowed.has(category) || result.includes(category as T)) {
      return null
    }
    result.push(category as T)
  }
  return Object.freeze(result)
}

function policyForCategory(
  policy: PrivacyRetentionPolicyV1,
  category: PrivacyDataCategory
): PrivacyRetentionCategoryPolicy {
  if (RETENTION_SET.has(category)) {
    return policy.categories[category as PrivacyRetentionCategory]
  }
  return NON_RETENTION_POLICY
}

function normalizeStoredPolicy(value: unknown): PrivacyRetentionPolicyV1 {
  const result = normalizePrivacyResult('policy.update', {
    ok: true,
    data: { policy: value }
  })
  if (!result.ok) throw new Error('PRIVACY_POLICY_INVALID')
  return result.data.policy
}

function unavailable() {
  return Object.freeze({
    ok: false as const,
    code: 'PRIVACY_CATEGORY_UNAVAILABLE' as const,
    retryable: false
  })
}

function invalidRequest() {
  return Object.freeze({
    ok: false as const,
    code: 'PRIVACY_REQUEST_INVALID' as const,
    retryable: false
  })
}

function cancelled() {
  return Object.freeze({
    ok: false as const,
    code: 'PRIVACY_OPERATION_CANCELLED' as const,
    retryable: false,
    cancelled: true
  })
}

export function createPrivacyLifecycleService(
  options: PrivacyLifecycleServiceOptions
): PrivacyLifecycleService {
  const values = snapshotExact(options, OPTION_KEYS, 'PRIVACY_LIFECYCLE_OPTIONS_INVALID')
  const registryMethods = snapshotMethods(
    values.ownerRegistry,
    ['get', 'list'],
    'PRIVACY_LIFECYCLE_OPTIONS_INVALID'
  )
  const policyMethods = snapshotMethods(
    values.policyStore,
    ['load', 'save'],
    'PRIVACY_LIFECYCLE_OPTIONS_INVALID'
  )
  const exporterMethods = snapshotMethods(
    values.exporter,
    ['exportCategories'],
    'PRIVACY_LIFECYCLE_OPTIONS_INVALID'
  )
  const disclosureMethods = snapshotMethods(
    values.disclosure,
    ['getProviders'],
    'PRIVACY_LIFECYCLE_OPTIONS_INVALID'
  )
  const secretMethods = snapshotMethods(
    values.secrets,
    ['backupPreview', 'backupWrite', 'restorePreview', 'restoreApply', 'destroy'],
    'PRIVACY_LIFECYCLE_OPTIONS_INVALID'
  )
  if (typeof values.reportError !== 'function' || isProxy(values.reportError)) {
    throw new Error('PRIVACY_LIFECYCLE_OPTIONS_INVALID')
  }
  if (values.now !== undefined && (typeof values.now !== 'function' || isProxy(values.now))) {
    throw new Error('PRIVACY_LIFECYCLE_OPTIONS_INVALID')
  }
  const operationTimeoutMs = values.operationTimeoutMs ?? 30_000
  if (!Number.isSafeInteger(operationTimeoutMs) || (operationTimeoutMs as number) < 1) {
    throw new Error('PRIVACY_LIFECYCLE_OPTIONS_INVALID')
  }

  const ownerRegistry = values.ownerRegistry as PrivacyDataOwnerRegistry
  const loadPolicy =
    policyMethods.load as unknown as PrivacyLifecycleServiceOptions['policyStore']['load']
  const savePolicy =
    policyMethods.save as unknown as PrivacyLifecycleServiceOptions['policyStore']['save']
  const exportData =
    exporterMethods.exportCategories as unknown as PrivacyCategoryExporter['exportCategories']
  const discloseProviders =
    disclosureMethods.getProviders as unknown as PrivacyProviderDisclosureService['getProviders']
  const backupSecretsPreview =
    secretMethods.backupPreview as unknown as PrivacySecretService['backupPreview']
  const backupSecretsWrite =
    secretMethods.backupWrite as unknown as PrivacySecretService['backupWrite']
  const restoreSecretsPreview =
    secretMethods.restorePreview as unknown as PrivacySecretService['restorePreview']
  const restoreSecretsApply =
    secretMethods.restoreApply as unknown as PrivacySecretService['restoreApply']
  const destroySecrets = secretMethods.destroy as unknown as PrivacySecretService['destroy']
  const reportError = (values.reportError as PrivacyLifecycleServiceOptions['reportError']).bind(
    options
  )
  const now = values.now
    ? (values.now as NonNullable<PrivacyLifecycleServiceOptions['now']>).bind(options)
    : Date.now
  const availableCategories = () =>
    Object.freeze(
      (registryMethods.list as unknown as PrivacyDataOwnerRegistry['list'])().flatMap((owner) => [
        ...owner.categories
      ])
    )
  const getOwner = registryMethods.get as unknown as PrivacyDataOwnerRegistry['get']
  const ownerFor = (category: PrivacyDataCategory) => {
    try {
      return getOwner(category)
    } catch {
      return undefined
    }
  }

  let closing = false
  let admissionTail: Promise<unknown> = Promise.resolve()
  let admissionCount = 0
  const controllers = new Set<AbortController>()
  const operations = new Set<Promise<unknown>>()
  const deletePreviews = new Map<
    string,
    { readonly categories: readonly PrivacyDataCategory[]; readonly expiresAt: number }
  >()

  function pruneDeletePreviews(operationNowMs: number): void {
    for (const [previewId, preview] of deletePreviews) {
      if (preview.expiresAt <= operationNowMs) deletePreviews.delete(previewId)
    }
    while (deletePreviews.size >= MAX_DELETE_PREVIEWS) {
      const oldest = deletePreviews.keys().next().value
      if (typeof oldest !== 'string') break
      deletePreviews.delete(oldest)
    }
  }

  function issueDeletePreview(
    categories: readonly PrivacyDataCategory[],
    operationNowMs: number
  ): string {
    pruneDeletePreviews(operationNowMs)
    const previewId = `preview_${randomUUID().replaceAll('-', '')}`
    deletePreviews.set(
      previewId,
      Object.freeze({
        categories: Object.freeze([...categories]),
        expiresAt: operationNowMs + DELETE_PREVIEW_TTL_MS
      })
    )
    return previewId
  }

  function consumeDeletePreview(
    previewId: string,
    categories: readonly PrivacyDataCategory[],
    operationNowMs: number
  ): boolean {
    pruneDeletePreviews(operationNowMs)
    const preview = deletePreviews.get(previewId)
    if (!preview) return false
    deletePreviews.delete(previewId)
    return (
      preview.categories.length === categories.length &&
      preview.categories.every((category, index) => category === categories[index])
    )
  }

  function report(
    code: string,
    operation: string,
    categories: readonly string[],
    results: readonly unknown[] = [],
    _cause?: unknown
  ): string | undefined {
    const ownerCodes = results
      .map((result) => ownDataValue(result, 'code'))
      .filter((value): value is string => typeof value === 'string')
    try {
      return reportIdFrom(
        reportError({
          code,
          operation,
          categories: Object.freeze([...categories]),
          ownerCodes: Object.freeze(ownerCodes)
        })
      )
    } catch {
      return undefined
    }
  }

  function allOwned(categories: readonly PrivacyDataCategory[]): boolean {
    return categories.every((category) => ownerFor(category) !== undefined)
  }

  function withAdmission<T>(
    work: (signal: AbortSignal, operationNowMs: number) => Promise<T>,
    externalSignal?: AbortSignal
  ): Promise<T> {
    if (closing) return Promise.resolve(cancelled() as T)
    const controller = new AbortController()
    controllers.add(controller)
    const onExternalAbort = () => controller.abort(externalSignal?.reason)
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true })
    if (externalSignal?.aborted) controller.abort(externalSignal.reason)

    const run = async () => {
      if (controller.signal.aborted) return cancelled() as T
      const startedAt = now()
      if (!Number.isSafeInteger(startedAt) || startedAt < 0) {
        throw new Error('PRIVACY_LIFECYCLE_CLOCK_INVALID')
      }
      const timeout = setTimeout(
        () => controller.abort(new Error('PRIVACY_OPERATION_TIMEOUT')),
        operationTimeoutMs as number
      )
      try {
        return await work(controller.signal, startedAt)
      } finally {
        clearTimeout(timeout)
      }
    }
    const runImmediately = admissionCount === 0
    admissionCount += 1
    const operation = runImmediately ? run() : admissionTail.then(run)
    admissionTail = operation.catch(() => undefined)
    operations.add(operation)
    const releaseOperation = () => {
      controllers.delete(controller)
      operations.delete(operation)
      admissionCount -= 1
      externalSignal?.removeEventListener('abort', onExternalAbort)
    }
    void operation.then(releaseOperation, releaseOperation)
    return operation
  }

  function failedOwnerDelete(category: PrivacyDataCategory): PrivacyOwnerDeleteResult {
    return Object.freeze({
      ok: false,
      code: 'PRIVACY_OWNER_DATABASE_FAILED',
      retryable: true,
      category,
      deletedItemCount: 0,
      deletedByteCount: 0,
      failedItemCount: 1,
      protectedItemCount: 0,
      batches: 0,
      partial: false,
      cancelled: false
    })
  }

  function cancelledOwnerDelete(category: PrivacyDataCategory): PrivacyOwnerDeleteResult {
    return Object.freeze({
      ok: false,
      code: 'PRIVACY_OWNER_CANCELLED',
      retryable: true,
      category,
      deletedItemCount: 0,
      deletedByteCount: 0,
      failedItemCount: 0,
      protectedItemCount: 0,
      batches: 0,
      partial: true,
      cancelled: true
    })
  }

  function hasCompletedDeleteEvidence(results: readonly PrivacyOwnerDeleteResult[]): boolean {
    return results.some(
      (result) =>
        result.ok ||
        safeCount(result.deletedItemCount) > 0 ||
        safeCount(result.deletedByteCount) > 0 ||
        safeCount(result.batches) > 0
    )
  }

  function normalizeOwnerDeleteResults(
    value: unknown,
    expectedCategories: readonly PrivacyRetentionCategory[]
  ): readonly PrivacyOwnerDeleteResult[] | null {
    if (!Array.isArray(value) || isProxy(value) || value.length > expectedCategories.length)
      return null
    try {
      const descriptors = Object.getOwnPropertyDescriptors(value)
      const allowedKeys = new Set<PropertyKey>(['length'])
      const results: PrivacyOwnerDeleteResult[] = []
      const seen = new Set<PrivacyRetentionCategory>()
      for (let index = 0; index < value.length; index += 1) {
        const key = String(index)
        allowedKeys.add(key)
        const descriptor = descriptors[key]
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
          return null
        const category = ownDataValue(descriptor.value, 'category')
        if (
          typeof category !== 'string' ||
          !expectedCategories.includes(category as PrivacyRetentionCategory) ||
          seen.has(category as PrivacyRetentionCategory)
        ) {
          return null
        }
        seen.add(category as PrivacyRetentionCategory)
        results.push(
          normalizePrivacyOwnerDeleteResult(descriptor.value, category as PrivacyRetentionCategory)
        )
      }
      if (Reflect.ownKeys(descriptors).some((key) => !allowedKeys.has(key))) return null
      return results
    } catch {
      return null
    }
  }

  async function performDelete(
    categories: readonly PrivacyDataCategory[],
    policy: PrivacyRetentionPolicyV1,
    mode: 'retention' | 'manual-delete',
    signal: AbortSignal,
    nowMs: number
  ): Promise<readonly PrivacyOwnerDeleteResult[]> {
    const results: PrivacyOwnerDeleteResult[] = []
    for (const category of categories) {
      if (signal.aborted) {
        if (hasCompletedDeleteEvidence(results)) results.push(cancelledOwnerDelete(category))
        break
      }
      const owner = ownerFor(category)
      if (!owner) break
      try {
        const result = await owner.delete(
          Object.freeze({
            category,
            policy: policyForCategory(policy, category),
            nowMs,
            mode,
            ...(mode === 'manual-delete' ? { confirmation: 'delete-selected-data' as const } : {})
          }),
          signal
        )
        results.push(normalizePrivacyOwnerDeleteResult(result, category))
      } catch {
        results.push(signal.aborted ? cancelledOwnerDelete(category) : failedOwnerDelete(category))
      }
      if (signal.aborted) break
    }
    return Object.freeze(results)
  }

  const getProviderDisclosure = () =>
    withAdmission(async (signal) => {
      try {
        const providers = await discloseProviders()
        if (signal.aborted) return cancelled()
        return normalizePrivacyResult('provider-disclosure.get', {
          ok: true,
          data: { providers }
        })
      } catch (error) {
        const reportId = report(
          'PRIVACY_PROVIDER_DISCLOSURE_FAILED',
          'provider-disclosure.get',
          [],
          [],
          error
        )
        return Object.freeze({
          ok: false as const,
          code: 'PRIVACY_OPERATION_FAILED' as const,
          retryable: true,
          ...(reportId ? { reportId } : {})
        })
      }
    })

  const service: PrivacyLifecycleService = {
    getPolicy: () =>
      withAdmission(async (signal) => {
        if (signal.aborted) return cancelled()
        try {
          const policy = normalizeStoredPolicy(await loadPolicy())
          if (signal.aborted) return cancelled()
          return Object.freeze({
            ok: true as const,
            data: Object.freeze({
              policy,
              supportedPresets: Object.freeze([
                '1-day',
                '7-days',
                '30-days',
                '90-days',
                '180-days',
                '365-days',
                'permanent'
              ] as const)
            })
          })
        } catch (error) {
          const reportId = report('PRIVACY_POLICY_LOAD_FAILED', 'policy.get', [], [], error)
          return Object.freeze({
            ok: false as const,
            code: 'PRIVACY_OPERATION_FAILED' as const,
            retryable: true,
            ...(reportId ? { reportId } : {})
          })
        }
      }),

    updatePolicy: (selection) =>
      withAdmission(async (signal, operationNowMs) => {
        let normalizedSelection: PrivacyRetentionSelectionV1
        try {
          const request = normalizePrivacyRequest({ operation: 'policy.update', policy: selection })
          if (request.operation !== 'policy.update') throw new Error('PRIVACY_POLICY_INVALID')
          normalizedSelection = request.policy
          privacyRetentionSelectionToPolicy(normalizedSelection)
        } catch {
          return Object.freeze({
            ok: false as const,
            code: 'PRIVACY_POLICY_INVALID' as const,
            retryable: false
          })
        }

        let previous: PrivacyRetentionPolicyV1
        let persisted: PrivacyRetentionPolicyV1
        try {
          previous = normalizeStoredPolicy(await loadPolicy())
          if (signal.aborted) return cancelled()
          persisted = normalizeStoredPolicy(await savePolicy(normalizedSelection))
        } catch (error) {
          const reportId = report('PRIVACY_POLICY_UPDATE_FAILED', 'policy.update', [], [], error)
          return Object.freeze({
            ok: false as const,
            code: 'PRIVACY_OPERATION_FAILED' as const,
            retryable: true,
            ...(reportId ? { reportId } : {})
          })
        }
        const shortened = PRIVACY_RETENTION_CATEGORIES.filter((category) => {
          const before = previous.categories[category]
          const after = persisted.categories[category]
          return (
            after.enabled &&
            after.retentionMs !== null &&
            (!before.enabled ||
              before.retentionMs === null ||
              after.retentionMs < before.retentionMs)
          )
        })
        if (signal.aborted) {
          if (shortened.length > 0) {
            report('PRIVACY_CLEANUP_PARTIAL', 'policy.update.cleanup', shortened)
          }
          return Object.freeze({ ok: true as const, data: Object.freeze({ policy: persisted }) })
        }

        if (shortened.length > 0) {
          try {
            const cleanupResults = await performDelete(
              shortened,
              persisted,
              'retention',
              signal,
              operationNowMs
            )
            if (
              cleanupResults.length !== shortened.length ||
              cleanupResults.some((result) => !result.ok || result.partial || result.cancelled)
            ) {
              report('PRIVACY_CLEANUP_PARTIAL', 'policy.update.cleanup', shortened, cleanupResults)
            }
          } catch (error) {
            report('PRIVACY_CLEANUP_PARTIAL', 'policy.update.cleanup', shortened, [], error)
          }
        }
        return Object.freeze({ ok: true as const, data: Object.freeze({ policy: persisted }) })
      }),

    getSummary: (selected) => {
      const categories = categoryList(
        selected,
        DATA_CATEGORY_SET,
        availableCategories() as readonly PrivacyDataCategory[]
      )
      if (!categories || !allOwned(categories)) return Promise.resolve(unavailable())
      return withAdmission(async (signal, operationNowMs) => {
        try {
          const policy = normalizeStoredPolicy(await loadPolicy())
          const summaries: PrivacyCategorySummary[] = []
          for (const category of categories) {
            if (signal.aborted) return cancelled()
            const owner = ownerFor(category)
            if (!owner) return unavailable()
            const ownerResult = await owner.inspect(
              Object.freeze({
                category,
                policy: policyForCategory(policy, category),
                nowMs: operationNowMs
              }),
              signal
            )
            const result = normalizePrivacyOwnerInspectionResult(ownerResult, category)
            if (!result.ok) throw Object.assign(new Error(result.code), { result })
            summaries.push(
              Object.freeze({
                category,
                itemCount: safeCount(result.itemCount),
                byteCount: safeCount(result.byteCount),
                retentionMs: result.retentionMs
              })
            )
          }
          return Object.freeze({
            ok: true as const,
            data: Object.freeze({ categories: Object.freeze(summaries) })
          })
        } catch (error) {
          const reportId = report('PRIVACY_SUMMARY_FAILED', 'summary.get', categories, [], error)
          return Object.freeze({
            ok: false as const,
            code: 'PRIVACY_OPERATION_FAILED' as const,
            retryable: true,
            ...(reportId ? { reportId } : {})
          })
        }
      })
    },

    previewCleanup: (selected) => {
      const fallback = availableCategories().filter(
        (category): category is PrivacyRetentionCategory => RETENTION_SET.has(category)
      )
      const categories = categoryList(selected, RETENTION_SET, fallback)
      if (!categories || !allOwned(categories)) return Promise.resolve(unavailable())
      return withAdmission(async (signal, operationNowMs) => {
        try {
          const policy = normalizeStoredPolicy(await loadPolicy())
          const impacts: PrivacyOwnerPreviewResult[] = []
          for (const category of categories) {
            if (signal.aborted) return cancelled()
            const owner = ownerFor(category)
            if (!owner) return unavailable()
            const ownerImpact = await owner.previewDelete(
              Object.freeze({
                category,
                policy: policy.categories[category],
                nowMs: operationNowMs,
                mode: 'retention' as const
              }),
              signal
            )
            impacts.push(normalizePrivacyOwnerPreviewResult(ownerImpact, category))
          }
          if (signal.aborted) return cancelled()
          const failed = impacts.filter((impact) => !impact.ok)
          if (failed.length > 0) {
            const reportId = report('PRIVACY_PREVIEW_FAILED', 'cleanup.preview', categories, failed)
            return Object.freeze({
              ok: false as const,
              code: 'PRIVACY_OPERATION_FAILED' as const,
              retryable: failed.some((impact) => impact.retryable),
              ...(reportId ? { reportId } : {})
            })
          }
          return Object.freeze({
            ok: true as const,
            data: Object.freeze({
              categories: Object.freeze(
                impacts.map((impact) =>
                  Object.freeze({
                    category: impact.category,
                    eligibleItemCount: safeCount(impact.eligibleItemCount),
                    eligibleByteCount: safeCount(impact.eligibleByteCount),
                    protectedItemCount: safeCount(impact.protectedItemCount)
                  })
                )
              ),
              bounded: impacts.some((impact) => impact.bounded)
            })
          })
        } catch (error) {
          const reportId = report(
            'PRIVACY_PREVIEW_FAILED',
            'cleanup.preview',
            categories,
            [],
            error
          )
          return Object.freeze({
            ok: false as const,
            code: 'PRIVACY_OPERATION_FAILED' as const,
            retryable: true,
            ...(reportId ? { reportId } : {})
          })
        }
      })
    },

    runCleanup: (selected, externalSignal) => {
      const fallback = availableCategories().filter(
        (category): category is PrivacyRetentionCategory => RETENTION_SET.has(category)
      )
      const categories = categoryList(selected, RETENTION_SET, fallback)
      if (!categories || !allOwned(categories)) return Promise.resolve(unavailable())
      return withAdmission(async (signal, operationNowMs) => {
        try {
          const policy = normalizeStoredPolicy(await loadPolicy())
          const results = await performDelete(
            categories,
            policy,
            'retention',
            signal,
            operationNowMs
          )
          const interrupted = signal.aborted
          if (interrupted && !hasCompletedDeleteEvidence(results)) return cancelled()
          const partial =
            interrupted ||
            results.length !== categories.length ||
            results.some((result) => !result.ok || result.partial || result.cancelled)
          const reportId = partial
            ? report('PRIVACY_CLEANUP_PARTIAL', 'cleanup.run', categories, results)
            : undefined
          return Object.freeze({
            ok: true as const,
            data: Object.freeze({
              categories: Object.freeze(
                results.map((result) =>
                  Object.freeze({
                    category: result.category as PrivacyRetentionCategory,
                    deletedItemCount: safeCount(result.deletedItemCount),
                    deletedByteCount: safeCount(result.deletedByteCount)
                  })
                )
              ),
              partial,
              ...(reportId ? { reportId } : {})
            })
          })
        } catch (error) {
          if (signal.aborted) return cancelled()
          const reportId = report('PRIVACY_CLEANUP_FAILED', 'cleanup.run', categories, [], error)
          return Object.freeze({
            ok: false as const,
            code: 'PRIVACY_OPERATION_FAILED' as const,
            retryable: true,
            ...(reportId ? { reportId } : {})
          })
        }
      }, externalSignal)
    },

    runScheduledCleanup: (externalSignal) =>
      withAdmission(async (signal, operationNowMs) => {
        const categories = availableCategories().filter(
          (category): category is PrivacyRetentionCategory => RETENTION_SET.has(category)
        )
        try {
          const policy = normalizeStoredPolicy(await loadPolicy())
          const owners = new Set(
            categories.map((category) => ownerFor(category)).filter((owner) => owner !== undefined)
          )
          const results: PrivacyOwnerDeleteResult[] = []
          for (const owner of owners) {
            if (signal.aborted) break
            const expectedCategories = owner.categories.filter(
              (category): category is PrivacyRetentionCategory =>
                RETENTION_SET.has(category) &&
                policy.categories[category as PrivacyRetentionCategory].enabled
            )
            if (expectedCategories.length === 0) continue
            let ownerResults: readonly PrivacyOwnerDeleteResult[] | null = null
            try {
              ownerResults = normalizeOwnerDeleteResults(
                await owner.applyRetention(policy, operationNowMs, signal),
                expectedCategories
              )
            } catch {
              ownerResults = null
            }
            if (signal.aborted && ownerResults === null) {
              for (const category of expectedCategories) {
                results.push(cancelledOwnerDelete(category))
              }
              break
            }
            const byCategory = new Map(ownerResults?.map((result) => [result.category, result]))
            for (const category of expectedCategories) {
              results.push(byCategory?.get(category) ?? failedOwnerDelete(category))
            }
          }
          const interrupted = signal.aborted
          if (interrupted && !hasCompletedDeleteEvidence(results)) return cancelled()
          const partial =
            interrupted ||
            results.some((result) => !result.ok || result.partial || result.cancelled)
          const reportId = partial
            ? report('PRIVACY_CLEANUP_PARTIAL', 'cleanup.scheduled', categories, results)
            : undefined
          return Object.freeze({
            ok: true as const,
            data: Object.freeze({
              categories: Object.freeze(
                results.map((result) =>
                  Object.freeze({
                    category: result.category as PrivacyRetentionCategory,
                    deletedItemCount: safeCount(result.deletedItemCount),
                    deletedByteCount: safeCount(result.deletedByteCount)
                  })
                )
              ),
              partial,
              ...(reportId ? { reportId } : {})
            })
          })
        } catch (error) {
          if (signal.aborted) return cancelled()
          const reportId = report(
            'PRIVACY_CLEANUP_FAILED',
            'cleanup.scheduled',
            categories,
            [],
            error
          )
          return Object.freeze({
            ok: false as const,
            code: 'PRIVACY_OPERATION_FAILED' as const,
            retryable: true,
            ...(reportId ? { reportId } : {})
          })
        }
      }, externalSignal),

    previewCategoryDelete: (selected) => {
      const categories = categoryList(selected, DATA_CATEGORY_SET, [])
      if (!categories || !allOwned(categories)) return Promise.resolve(unavailable())
      return withAdmission(async (signal, operationNowMs) => {
        try {
          const policy = normalizeStoredPolicy(await loadPolicy())
          const impacts: PrivacyOwnerPreviewResult[] = []
          for (const category of categories) {
            if (signal.aborted) return cancelled()
            const owner = ownerFor(category)
            if (!owner) return unavailable()
            const ownerImpact = await owner.previewDelete(
              Object.freeze({
                category,
                policy: policyForCategory(policy, category),
                nowMs: operationNowMs,
                mode: 'manual-delete' as const
              }),
              signal
            )
            impacts.push(normalizePrivacyOwnerPreviewResult(ownerImpact, category))
          }
          if (signal.aborted) return cancelled()
          const failed = impacts.filter((impact) => !impact.ok)
          if (failed.length > 0) {
            const reportId = report(
              'PRIVACY_PREVIEW_FAILED',
              'category.delete-preview',
              categories,
              failed
            )
            return Object.freeze({
              ok: false as const,
              code: 'PRIVACY_OPERATION_FAILED' as const,
              retryable: failed.some((impact) => impact.retryable),
              ...(reportId ? { reportId } : {})
            })
          }
          return Object.freeze({
            ok: true as const,
            data: Object.freeze({
              categories: Object.freeze(
                impacts.map((impact) =>
                  Object.freeze({
                    category: impact.category,
                    eligibleItemCount: safeCount(impact.eligibleItemCount),
                    eligibleByteCount: safeCount(impact.eligibleByteCount),
                    protectedItemCount: safeCount(impact.protectedItemCount)
                  })
                )
              ),
              bounded: impacts.some((impact) => impact.bounded),
              previewId: issueDeletePreview(categories, operationNowMs)
            })
          })
        } catch (error) {
          const reportId = report(
            'PRIVACY_PREVIEW_FAILED',
            'category.delete-preview',
            categories,
            [],
            error
          )
          return Object.freeze({
            ok: false as const,
            code: 'PRIVACY_OPERATION_FAILED' as const,
            retryable: true,
            ...(reportId ? { reportId } : {})
          })
        }
      })
    },

    deleteCategories: (selected, confirmation, previewId) => {
      const categories = categoryList(selected, DATA_CATEGORY_SET, [])
      if (
        confirmation !== 'delete-selected-data' ||
        typeof previewId !== 'string' ||
        !DELETE_PREVIEW_ID.test(previewId) ||
        !categories ||
        !allOwned(categories)
      ) {
        return Promise.resolve(invalidRequest())
      }
      return withAdmission(async (signal, operationNowMs) => {
        if (!consumeDeletePreview(previewId, categories, operationNowMs)) {
          return invalidRequest()
        }
        try {
          const policy = normalizeStoredPolicy(await loadPolicy())
          const results = await performDelete(
            categories,
            policy,
            'manual-delete',
            signal,
            operationNowMs
          )
          const interrupted = signal.aborted
          if (interrupted && !hasCompletedDeleteEvidence(results)) return cancelled()
          const partial =
            interrupted ||
            results.length !== categories.length ||
            results.some((result) => !result.ok || result.partial || result.cancelled)
          if (partial) report('PRIVACY_DELETE_PARTIAL', 'category.delete', categories, results)
          return Object.freeze({
            ok: true as const,
            data: Object.freeze({
              categories: Object.freeze(
                results.map((result) =>
                  Object.freeze({
                    category: result.category,
                    deletedItemCount: safeCount(result.deletedItemCount)
                  })
                )
              ),
              partial
            })
          })
        } catch (error) {
          if (signal.aborted) return cancelled()
          const reportId = report('PRIVACY_DELETE_FAILED', 'category.delete', categories, [], error)
          return Object.freeze({
            ok: false as const,
            code: 'PRIVACY_DELETE_FAILED' as const,
            retryable: true,
            ...(reportId ? { reportId } : {})
          })
        }
      })
    },

    exportCategories: (selected) => {
      const categories = categoryList(selected, DATA_CATEGORY_SET, [])
      if (!categories || !allOwned(categories)) return Promise.resolve(unavailable())
      return withAdmission(async (signal) => {
        try {
          const policy = normalizeStoredPolicy(await loadPolicy())
          if (signal.aborted) return cancelled()
          const exported = await exportData(
            Object.freeze({ categories, policy, ownerRegistry, signal }),
            signal
          )
          return normalizePrivacyResult('category.export', { ok: true, data: exported })
        } catch (error) {
          if (signal.aborted) return cancelled()
          const reportId = report('PRIVACY_EXPORT_FAILED', 'category.export', categories, [], error)
          return Object.freeze({
            ok: false as const,
            code: 'PRIVACY_EXPORT_FAILED' as const,
            retryable: false,
            ...(reportId ? { reportId } : {})
          })
        }
      })
    },

    getProviders: getProviderDisclosure,
    getProviderDisclosure,

    backupSecretsPreview: () =>
      withAdmission(async (signal) => {
        try {
          return normalizePrivacyResult('secret-backup.preview', await backupSecretsPreview(signal))
        } catch {
          return unavailable()
        }
      }),

    backupSecretsWrite: (password) => {
      let normalizedPassword: string
      try {
        const request = normalizePrivacyRequest({ operation: 'secret-backup.write', password })
        if (request.operation !== 'secret-backup.write') throw new Error('PRIVACY_REQUEST_INVALID')
        normalizedPassword = request.password
      } catch {
        return Promise.resolve(
          Object.freeze({
            ok: false as const,
            code: 'PRIVACY_REQUEST_INVALID' as const,
            retryable: false
          })
        )
      }
      return withAdmission(async (signal) => {
        try {
          return normalizePrivacyResult(
            'secret-backup.write',
            await backupSecretsWrite(normalizedPassword, signal)
          )
        } catch {
          return unavailable()
        }
      })
    },

    restoreSecretsPreview: (password) => {
      let normalizedPassword: string
      try {
        const request = normalizePrivacyRequest({ operation: 'secret-restore.preview', password })
        if (request.operation !== 'secret-restore.preview')
          throw new Error('PRIVACY_REQUEST_INVALID')
        normalizedPassword = request.password
      } catch {
        return Promise.resolve(
          Object.freeze({
            ok: false as const,
            code: 'PRIVACY_REQUEST_INVALID' as const,
            retryable: false
          })
        )
      }
      return withAdmission(async (signal) => {
        try {
          return normalizePrivacyResult(
            'secret-restore.preview',
            await restoreSecretsPreview(normalizedPassword, signal)
          )
        } catch {
          return unavailable()
        }
      })
    },

    restoreSecretsApply: (restoreId, password, conflictPolicy) => {
      let normalized: Extract<
        ReturnType<typeof normalizePrivacyRequest>,
        { operation: 'secret-restore.apply' }
      >
      try {
        const request = normalizePrivacyRequest({
          operation: 'secret-restore.apply',
          restoreId,
          password,
          conflictPolicy
        })
        if (request.operation !== 'secret-restore.apply') throw new Error('PRIVACY_REQUEST_INVALID')
        normalized = request
      } catch {
        return Promise.resolve(
          Object.freeze({
            ok: false as const,
            code: 'PRIVACY_REQUEST_INVALID' as const,
            retryable: false
          })
        )
      }
      return withAdmission(async (signal) => {
        try {
          return normalizePrivacyResult(
            'secret-restore.apply',
            await restoreSecretsApply(
              normalized.restoreId,
              normalized.password,
              normalized.conflictPolicy,
              signal
            )
          )
        } catch {
          return unavailable()
        }
      })
    },

    destroy: async () => {
      if (closing) {
        await Promise.allSettled([...operations])
        return
      }
      closing = true
      deletePreviews.clear()
      await new Promise<void>((resolve) => setImmediate(resolve))
      for (const controller of controllers) controller.abort(new Error('PRIVACY_SERVICE_DESTROYED'))
      await Promise.allSettled([...operations])
      await destroySecrets()
    }
  }

  return Object.freeze(service)
}
