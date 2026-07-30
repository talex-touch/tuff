import type {
  PrivacyDataCategory,
  PrivacyRetentionPolicyV1,
  PrivacyRetentionSelectionV1
} from '@talex-touch/utils/transport/events/types'
import type { PrivacyDataOwnerCandidate } from './data-owner'
import { describe, expect, it, vi } from 'vitest'
import {
  createPrivacyDataOwnerRegistry,
  definePrivacyDataOwner,
  privacyOwnerCompletedDelete,
  privacyOwnerCompletedExport
} from './data-owner'
import { privacyInspectionResult, privacyPreviewResult } from './owner-utils'
import {
  createPrivacyLifecycleService,
  type PrivacyLifecycleService
} from './privacy-lifecycle-service'
import { DEFAULT_PRIVACY_RETENTION_POLICY, PRIVACY_RETENTION_DAY_MS } from './retention-policy'

const DEFAULT_SELECTION: PrivacyRetentionSelectionV1 = {
  version: 1,
  selections: {
    'clipboard-history': '90-days',
    'ocr-screenshot-temp': '1-day',
    'search-history': '30-days',
    'intelligence-audit': '30-days',
    'intelligence-context': '30-days',
    diagnostics: '30-days'
  }
}

function owner(
  category: PrivacyDataCategory,
  overrides: Partial<PrivacyDataOwnerCandidate> = {}
): PrivacyDataOwnerCandidate {
  return {
    categories: [category],
    inspect: vi.fn(async (request) =>
      privacyInspectionResult(category, request.policy.retentionMs, 3, 24)
    ),
    previewDelete: vi.fn(async () =>
      privacyPreviewResult(category, {
        eligibleItemCount: 2,
        eligibleByteCount: 16,
        protectedItemCount: 1
      })
    ),
    delete: vi.fn(async () =>
      privacyOwnerCompletedDelete(category, {
        deletedItemCount: 2,
        deletedByteCount: 16,
        batches: 1
      })
    ),
    export: vi.fn(async (_request, writer) => {
      await writer.write({ kind: 'metadata', count: 1 })
      return privacyOwnerCompletedExport(category, {
        exportedItemCount: 1,
        exportedByteCount: 10
      })
    }),
    applyRetention: vi.fn(async () => [privacyOwnerCompletedDelete(category)]),
    ...overrides
  }
}

function policyWith(
  category: keyof PrivacyRetentionPolicyV1['categories'],
  retentionMs: number | null
): PrivacyRetentionPolicyV1 {
  return {
    version: 1,
    categories: {
      ...DEFAULT_PRIVACY_RETENTION_POLICY.categories,
      [category]: { enabled: true, retentionMs }
    }
  }
}

function createHarness(
  options: {
    owners?: PrivacyDataOwnerCandidate[]
    loadPolicy?: PrivacyRetentionPolicyV1
    savePolicy?: PrivacyRetentionPolicyV1
    timeoutMs?: number
    now?: () => number
  } = {}
) {
  let policy = options.loadPolicy ?? DEFAULT_PRIVACY_RETENTION_POLICY
  const owners = options.owners ?? [owner('clipboard-history'), owner('search-history')]
  const load = vi.fn(async () => policy)
  const save = vi.fn(async () => {
    policy = options.savePolicy ?? policy
    return policy
  })
  const reportError = vi.fn(() => ({ id: 'report_privacy_0001' }))
  const exporter = {
    exportCategories: vi.fn(async () => ({
      format: 'talex.touch.privacy-export/v1' as const,
      categories: ['clipboard-history'] as const,
      cancelled: false,
      itemCount: 1,
      byteCount: 100,
      reportId: 'report_export_0001'
    }))
  }
  const disclosure = {
    getProviders: vi.fn(async () => [])
  }
  const secrets = {
    backupPreview: vi.fn(async (_signal?: AbortSignal) => ({
      ok: true as const,
      data: { portableEntryCount: 0, available: false }
    })),
    backupWrite: vi.fn(async (_password?: string, _signal?: AbortSignal) => ({
      ok: true as const,
      data: { format: 'talex.touch.secret-backup' as const, version: 1 as const, cancelled: true }
    })),
    restorePreview: vi.fn(async (_password?: string, _signal?: AbortSignal) => ({
      ok: false as const,
      code: 'PRIVACY_OPERATION_CANCELLED' as const,
      retryable: false,
      cancelled: true
    })),
    restoreApply: vi.fn(
      async (
        _restoreId?: string,
        _password?: string,
        _conflictPolicy?: 'skip' | 'overwrite',
        _signal?: AbortSignal
      ) => ({
        ok: true as const,
        data: { importedCount: 0, overwrittenCount: 0, skippedCount: 0 }
      })
    ),
    destroy: vi.fn(async () => undefined)
  }
  const service = createPrivacyLifecycleService({
    ownerRegistry: createPrivacyDataOwnerRegistry(owners.map(definePrivacyDataOwner)),
    policyStore: {
      load,
      save
    },
    exporter,
    disclosure,
    secrets,
    reportError,
    now: options.now ?? (() => 10 * PRIVACY_RETENTION_DAY_MS),
    operationTimeoutMs: options.timeoutMs ?? 1_000
  })
  return { service, owners, load, save, exporter, disclosure, secrets, reportError }
}

async function categoryDeletePreviewId(
  service: PrivacyLifecycleService,
  categories: readonly PrivacyDataCategory[]
): Promise<string> {
  const preview = await service.previewCategoryDelete(categories)
  if (!preview.ok) throw new Error(preview.code)
  return preview.data.previewId
}

describe('privacyLifecycleService', () => {
  it('rejects accessors and proxies without invoking hostile dependency getters', () => {
    const getter = vi.fn(() => createPrivacyDataOwnerRegistry([]))
    const options = Object.defineProperty({}, 'ownerRegistry', {
      enumerable: true,
      get: getter
    })
    expect(() => createPrivacyLifecycleService(options as never)).toThrow(
      'PRIVACY_LIFECYCLE_OPTIONS_INVALID'
    )
    expect(getter).not.toHaveBeenCalled()
    expect(() => createPrivacyLifecycleService(new Proxy({}, {}) as never)).toThrow(
      'PRIVACY_LIFECYCLE_OPTIONS_INVALID'
    )
  })

  it('persists a shorter policy before cleanup and skips cleanup for extensions', async () => {
    const order: string[] = []
    const searchOwner = owner('search-history', {
      delete: vi.fn(async () => {
        order.push('cleanup')
        return privacyOwnerCompletedDelete('search-history')
      })
    })
    const harness = createHarness({
      owners: [searchOwner],
      loadPolicy: policyWith('search-history', 30 * PRIVACY_RETENTION_DAY_MS),
      savePolicy: policyWith('search-history', 7 * PRIVACY_RETENTION_DAY_MS)
    })
    harness.save.mockImplementationOnce(async () => {
      order.push('persist')
      return policyWith('search-history', 7 * PRIVACY_RETENTION_DAY_MS)
    })

    await expect(harness.service.updatePolicy(DEFAULT_SELECTION)).resolves.toMatchObject({
      ok: true
    })
    expect(order).toEqual(['persist', 'cleanup'])

    harness.save.mockImplementationOnce(async () =>
      policyWith('search-history', 30 * PRIVACY_RETENTION_DAY_MS)
    )
    await harness.service.updatePolicy(DEFAULT_SELECTION)
    expect(searchOwner.delete).toHaveBeenCalledTimes(1)
  })

  it('fails closed for categories without a registered owner before owner work', async () => {
    const harness = createHarness({ owners: [owner('clipboard-history')] })
    await expect(harness.service.getSummary(['intelligence-memory'])).resolves.toEqual({
      ok: false,
      code: 'PRIVACY_CATEGORY_UNAVAILABLE',
      retryable: false
    })
    expect(harness.owners[0]!.inspect).not.toHaveBeenCalled()
  })

  it('does not expose independently governed Memory or plugin data through central lifecycle calls', async () => {
    const pluginDataOwner = owner('plugin-data')
    const memoryOwner = owner('intelligence-memory')
    const harness = createHarness({ owners: [pluginDataOwner, memoryOwner] })

    await expect(
      harness.service.getSummary(['plugin-data', 'intelligence-memory'])
    ).resolves.toEqual({
      ok: false,
      code: 'PRIVACY_CATEGORY_UNAVAILABLE',
      retryable: false
    })
    await expect(
      harness.service.previewCategoryDelete(['plugin-data', 'intelligence-memory'])
    ).resolves.toEqual({
      ok: false,
      code: 'PRIVACY_CATEGORY_UNAVAILABLE',
      retryable: false
    })
    expect(pluginDataOwner.inspect).not.toHaveBeenCalled()
    expect(pluginDataOwner.previewDelete).not.toHaveBeenCalled()
    expect(memoryOwner.inspect).not.toHaveBeenCalled()
    expect(memoryOwner.previewDelete).not.toHaveBeenCalled()
  })

  it('keeps summary, retention preview, manual preview and delete counts consistent', async () => {
    const clipboardOwner = owner('clipboard-history')
    const harness = createHarness({ owners: [clipboardOwner] })
    await expect(harness.service.getSummary(['clipboard-history'])).resolves.toMatchObject({
      ok: true,
      data: { categories: [{ category: 'clipboard-history', itemCount: 3, byteCount: 24 }] }
    })
    await expect(harness.service.previewCleanup(['clipboard-history'])).resolves.toMatchObject({
      ok: true,
      data: {
        categories: [
          {
            category: 'clipboard-history',
            eligibleItemCount: 2,
            eligibleByteCount: 16,
            protectedItemCount: 1
          }
        ]
      }
    })
    const manualPreview = await harness.service.previewCategoryDelete(['clipboard-history'])
    expect(manualPreview).toMatchObject({
      ok: true,
      data: {
        categories: [
          {
            category: 'clipboard-history',
            eligibleItemCount: 2,
            eligibleByteCount: 16,
            protectedItemCount: 1
          }
        ]
      }
    })
    if (!manualPreview.ok) throw new Error(manualPreview.code)
    const manualPreviewId = manualPreview.data.previewId
    expect(clipboardOwner.previewDelete).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ mode: 'retention' }),
      expect.any(AbortSignal)
    )
    expect(clipboardOwner.previewDelete).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ mode: 'manual-delete' }),
      expect.any(AbortSignal)
    )
    await expect(
      harness.service.deleteCategories(
        ['clipboard-history'],
        'delete-selected-data',
        manualPreviewId
      )
    ).resolves.toMatchObject({
      ok: true,
      data: {
        categories: [{ category: 'clipboard-history', deletedItemCount: 2 }],
        partial: false
      }
    })
  })

  it('requires a fresh exact one-time preview before category deletion', async () => {
    let currentTime = 10 * PRIVACY_RETENTION_DAY_MS
    const clipboardOwner = owner('clipboard-history')
    const searchOwner = owner('search-history')
    const harness = createHarness({
      owners: [clipboardOwner, searchOwner],
      now: () => currentTime
    })

    await expect(
      harness.service.deleteCategories(
        ['clipboard-history'],
        'delete-selected-data',
        undefined as never
      )
    ).resolves.toEqual({ ok: false, code: 'PRIVACY_REQUEST_INVALID', retryable: false })

    const mismatched = await categoryDeletePreviewId(harness.service, ['clipboard-history'])
    await expect(
      harness.service.deleteCategories(['search-history'], 'delete-selected-data', mismatched)
    ).resolves.toEqual({ ok: false, code: 'PRIVACY_REQUEST_INVALID', retryable: false })
    await expect(
      harness.service.deleteCategories(['clipboard-history'], 'delete-selected-data', mismatched)
    ).resolves.toEqual({ ok: false, code: 'PRIVACY_REQUEST_INVALID', retryable: false })

    const admitted = await categoryDeletePreviewId(harness.service, ['clipboard-history'])
    await expect(
      harness.service.deleteCategories(['clipboard-history'], 'delete-selected-data', admitted)
    ).resolves.toMatchObject({ ok: true })
    await expect(
      harness.service.deleteCategories(['clipboard-history'], 'delete-selected-data', admitted)
    ).resolves.toEqual({ ok: false, code: 'PRIVACY_REQUEST_INVALID', retryable: false })

    const expired = await categoryDeletePreviewId(harness.service, ['clipboard-history'])
    currentTime += 5 * 60 * 1_000 + 1
    await expect(
      harness.service.deleteCategories(['clipboard-history'], 'delete-selected-data', expired)
    ).resolves.toEqual({ ok: false, code: 'PRIVACY_REQUEST_INVALID', retryable: false })

    expect(clipboardOwner.delete).toHaveBeenCalledOnce()
    expect(searchOwner.delete).not.toHaveBeenCalled()
  })

  it('serializes destructive, export and scheduled operations through one admission gate', async () => {
    let release: (() => void) | undefined
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    const calls: string[] = []
    const clipboardOwner = owner('clipboard-history', {
      delete: vi.fn(async () => {
        calls.push('delete:start')
        await barrier
        calls.push('delete:end')
        return privacyOwnerCompletedDelete('clipboard-history')
      }),
      applyRetention: vi.fn(async () => {
        calls.push('scheduled')
        return [privacyOwnerCompletedDelete('clipboard-history')]
      })
    })
    const harness = createHarness({ owners: [clipboardOwner] })
    harness.exporter.exportCategories.mockImplementationOnce(async () => {
      calls.push('export')
      return {
        format: 'talex.touch.privacy-export/v1',
        categories: ['clipboard-history'],
        cancelled: false,
        itemCount: 0,
        byteCount: 0,
        reportId: 'report_export_0002'
      }
    })

    const previewId = await categoryDeletePreviewId(harness.service, ['clipboard-history'])
    const first = harness.service.deleteCategories(
      ['clipboard-history'],
      'delete-selected-data',
      previewId
    )
    const second = harness.service.exportCategories(['clipboard-history'])
    const third = harness.service.runScheduledCleanup()
    await vi.waitFor(() => expect(calls).toEqual(['delete:start']))
    release?.()
    await Promise.all([first, second, third])
    expect(calls).toEqual(['delete:start', 'delete:end', 'export', 'scheduled'])
  })

  it('closes synchronous reentrancy before invoking the operation clock', async () => {
    let release: (() => void) | undefined
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    let nowCalls = 0
    let loadCalls = 0
    let reentrant: Promise<unknown> | undefined
    let service!: PrivacyLifecycleService
    const harness = createHarness({
      now: () => {
        if (nowCalls++ === 0) reentrant = service.getPolicy()
        return 10 * PRIVACY_RETENTION_DAY_MS
      }
    })
    service = harness.service
    harness.load.mockImplementation(async () => {
      loadCalls += 1
      await barrier
      return DEFAULT_PRIVACY_RETENTION_POLICY
    })

    const first = harness.service.getPolicy()
    await vi.waitFor(() => expect(loadCalls).toBe(1))
    release?.()
    await first
    await reentrant
    expect(loadCalls).toBe(2)
  })

  it('preserves completed batches as partial evidence and redacts aggregate failure', async () => {
    const failedOwner = owner('clipboard-history', {
      delete: vi.fn(async () => ({
        ok: false,
        code: 'PRIVACY_OWNER_DATABASE_FAILED',
        retryable: true,
        category: 'clipboard-history',
        deletedItemCount: 2,
        deletedByteCount: 16,
        failedItemCount: 1,
        protectedItemCount: 0,
        batches: 1,
        partial: true,
        cancelled: false
      })) as never
    })
    const harness = createHarness({ owners: [failedOwner] })
    const result = await harness.service.runCleanup(['clipboard-history'])
    expect(result).toMatchObject({
      ok: true,
      data: {
        categories: [{ category: 'clipboard-history', deletedItemCount: 2, deletedByteCount: 16 }],
        partial: true,
        reportId: 'report_privacy_0001'
      }
    })
    expect(harness.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PRIVACY_CLEANUP_PARTIAL' })
    )
  })

  it('fails closed on direct invalid policy input before durable storage work', async () => {
    const harness = createHarness()
    await expect(
      harness.service.updatePolicy({
        version: 1,
        selections: { ...DEFAULT_SELECTION.selections, 'search-history': '2-days' }
      } as never)
    ).resolves.toEqual({
      ok: false,
      code: 'PRIVACY_POLICY_INVALID',
      retryable: false
    })
    expect(harness.save).not.toHaveBeenCalled()
  })

  it('does not persist a policy when admission expires during policy load', async () => {
    const harness = createHarness({ timeoutMs: 10 })
    harness.load.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return DEFAULT_PRIVACY_RETENTION_POLICY
    })

    await expect(harness.service.updatePolicy(DEFAULT_SELECTION)).resolves.toEqual({
      ok: false,
      code: 'PRIVACY_OPERATION_CANCELLED',
      retryable: false,
      cancelled: true
    })
    expect(harness.save).not.toHaveBeenCalled()
  })

  it('keeps durable policy success and reports cleanup rejection as partial evidence', async () => {
    const saved = policyWith('search-history', 7 * PRIVACY_RETENTION_DAY_MS)
    const searchOwner = owner('search-history', {
      delete: vi.fn(async () => {
        throw new Error('CANARY_POST_SAVE_CLEANUP_NATIVE_DETAIL')
      })
    })
    const harness = createHarness({
      owners: [searchOwner],
      loadPolicy: policyWith('search-history', 30 * PRIVACY_RETENTION_DAY_MS),
      savePolicy: saved
    })

    await expect(harness.service.updatePolicy(DEFAULT_SELECTION)).resolves.toEqual({
      ok: true,
      data: { policy: saved }
    })
    expect(harness.reportError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PRIVACY_CLEANUP_PARTIAL',
        operation: 'policy.update.cleanup'
      })
    )
    expect(JSON.stringify(harness.reportError.mock.calls)).not.toContain(
      'CANARY_POST_SAVE_CLEANUP_NATIVE_DETAIL'
    )
  })

  it('snapshots one operation time for every owner in scheduled cleanup', async () => {
    let nowCalls = 0
    const observed: number[] = []
    const first = owner('clipboard-history', {
      applyRetention: vi.fn(async (_policy, nowMs) => {
        observed.push(nowMs)
        return [privacyOwnerCompletedDelete('clipboard-history')]
      })
    })
    const second = owner('search-history', {
      applyRetention: vi.fn(async (_policy, nowMs) => {
        observed.push(nowMs)
        return [privacyOwnerCompletedDelete('search-history')]
      })
    })
    const harness = createHarness({
      owners: [first, second],
      now: () => 10 * PRIVACY_RETENTION_DAY_MS + nowCalls++
    })

    await expect(harness.service.runScheduledCleanup()).resolves.toMatchObject({ ok: true })
    expect(nowCalls).toBe(1)
    expect(observed).toEqual([10 * PRIVACY_RETENTION_DAY_MS, 10 * PRIVACY_RETENTION_DAY_MS])
  })

  it('preserves completed owner evidence when a later owner times out', async () => {
    const completed = owner('clipboard-history')
    const interrupted = owner('search-history', {
      delete: vi.fn(async (_request, signal) => {
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true })
        })
        return {
          ...privacyOwnerCompletedDelete('search-history'),
          ok: false as const,
          code: 'PRIVACY_OWNER_CANCELLED' as const,
          cancelled: true as const
        }
      })
    })
    const harness = createHarness({ owners: [completed, interrupted], timeoutMs: 10 })

    await expect(
      harness.service.runCleanup(['clipboard-history', 'search-history'])
    ).resolves.toMatchObject({
      ok: true,
      data: {
        categories: [
          { category: 'clipboard-history', deletedItemCount: 2, deletedByteCount: 16 },
          { category: 'search-history', deletedItemCount: 0, deletedByteCount: 0 }
        ],
        partial: true,
        reportId: 'report_privacy_0001'
      }
    })
    expect(harness.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PRIVACY_CLEANUP_PARTIAL' })
    )
  })

  it('keeps a durably saved policy successful when post-save cleanup times out', async () => {
    const saved = policyWith('search-history', 7 * PRIVACY_RETENTION_DAY_MS)
    const interrupted = owner('search-history', {
      delete: vi.fn(async (_request, signal) => {
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true })
        })
        return {
          ...privacyOwnerCompletedDelete('search-history'),
          ok: false as const,
          code: 'PRIVACY_OWNER_CANCELLED' as const,
          cancelled: true as const
        }
      })
    })
    const harness = createHarness({
      owners: [interrupted],
      loadPolicy: policyWith('search-history', 30 * PRIVACY_RETENTION_DAY_MS),
      savePolicy: saved,
      timeoutMs: 10
    })

    await expect(harness.service.updatePolicy(DEFAULT_SELECTION)).resolves.toEqual({
      ok: true,
      data: { policy: saved }
    })
    expect(harness.reportError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PRIVACY_CLEANUP_PARTIAL',
        operation: 'policy.update.cleanup'
      })
    )
  })

  it('passes lifecycle timeout cancellation into Secret operations', async () => {
    const harness = createHarness({ timeoutMs: 10 })
    let observedSignal: AbortSignal | undefined
    harness.secrets.restorePreview.mockImplementation(async (_password, signal) => {
      observedSignal = signal
      await new Promise<void>((resolve) => {
        signal?.addEventListener('abort', () => resolve(), { once: true })
      })
      return {
        ok: false as const,
        code: 'PRIVACY_OPERATION_CANCELLED' as const,
        retryable: false,
        cancelled: true
      }
    })

    await expect(
      harness.service.restoreSecretsPreview('correct horse battery staple')
    ).resolves.toMatchObject({
      ok: false,
      code: 'PRIVACY_OPERATION_CANCELLED',
      cancelled: true
    })
    expect(observedSignal?.aborted).toBe(true)
  })

  it('propagates timeout cancellation and destroy waits for active owner work', async () => {
    let ownerSettled = false
    const slowOwner = owner('clipboard-history', {
      delete: vi.fn(async (_request, signal) => {
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => setTimeout(resolve, 5), { once: true })
        })
        ownerSettled = true
        return {
          ...privacyOwnerCompletedDelete('clipboard-history'),
          ok: false as const,
          code: 'PRIVACY_OWNER_CANCELLED' as const,
          cancelled: true as const
        }
      })
    })
    const harness = createHarness({ owners: [slowOwner], timeoutMs: 10 })
    const running = harness.service.runCleanup(['clipboard-history'])
    const destroying = harness.service.destroy()
    await expect(running).resolves.toMatchObject({
      ok: false,
      code: 'PRIVACY_OPERATION_CANCELLED',
      cancelled: true
    })
    await destroying
    expect(ownerSettled).toBe(true)
  })
})
