import { describe, expect, it, vi } from 'vitest'
import { IndexedWriteSideEffectService as SdkIndexedWriteSideEffectService } from '@talex-touch/utils/search'
import { IndexedWriteSideEffectService } from './indexing-write-side-effect-service'

async function settlePromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('indexing-write-side-effect-service', () => {
  it('re-exports the public SDK write side-effect service for legacy CoreApp imports', () => {
    expect(IndexedWriteSideEffectService).toBe(SdkIndexedWriteSideEffectService)
  })

  it('skips empty record batches', async () => {
    const processExtensions = vi.fn(async () => undefined)
    const scheduleIndexing = vi.fn()
    const logWarn = vi.fn()
    const service = new IndexedWriteSideEffectService({
      processExtensions,
      scheduleIndexing,
      logWarn,
      formatExtensionFailureMessage: (context) => `processFileExtensions failed (${context})`
    })

    service.dispatch([], {
      extensionContext: 'incremental',
      indexReason: 'incremental-insert'
    })
    await settlePromises()

    expect(processExtensions).not.toHaveBeenCalled()
    expect(scheduleIndexing).not.toHaveBeenCalled()
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('runs extension processing asynchronously and schedules indexing', async () => {
    const records = [{ id: 1, path: '/tmp/a.txt' }]
    const processExtensions = vi.fn(async () => undefined)
    const scheduleIndexing = vi.fn()
    const logWarn = vi.fn()
    const service = new IndexedWriteSideEffectService({
      processExtensions,
      scheduleIndexing,
      logWarn
    })

    service.dispatch(records, {
      extensionContext: 'file-update',
      indexReason: 'file-update'
    })
    await settlePromises()

    expect(processExtensions).toHaveBeenCalledWith(records)
    expect(scheduleIndexing).toHaveBeenCalledWith(records, 'file-update', undefined)
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('forwards mutation leases to indexing scheduling', async () => {
    const records = [{ id: 1, path: '/tmp/a.txt' }]
    const processExtensions = vi.fn(async () => undefined)
    const scheduleIndexing = vi.fn()
    const logWarn = vi.fn()
    const service = new IndexedWriteSideEffectService({
      processExtensions,
      scheduleIndexing,
      logWarn
    })

    service.dispatch(records, {
      extensionContext: 'file-update',
      indexReason: 'file-update',
      mutationLeaseId: 'lease-123'
    })
    await settlePromises()

    expect(scheduleIndexing).toHaveBeenCalledWith(records, 'file-update', 'lease-123')
  })

  it('logs extension processing failures without blocking indexing scheduling', async () => {
    const records = [{ id: 1, path: '/tmp/a.txt' }]
    const error = new Error('extension failed')
    const processExtensions = vi.fn(async () => {
      throw error
    })
    const scheduleIndexing = vi.fn()
    const logWarn = vi.fn()
    const service = new IndexedWriteSideEffectService({
      processExtensions,
      scheduleIndexing,
      logWarn
    })

    service.dispatch(records, {
      extensionContext: 'reconciliation',
      indexReason: 'reconciliation-insert'
    })
    await settlePromises()

    expect(scheduleIndexing).toHaveBeenCalledWith(records, 'reconciliation-insert', undefined)
    expect(logWarn).toHaveBeenCalledWith('processExtensions failed (reconciliation)', error)
  })
})
