import { describe, expect, it, vi } from 'vitest'
import { FileProviderWriteSideEffectService } from './file-provider-write-side-effect-service'

async function settleMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve()
  }
}

describe('file-provider-write-side-effect-service', () => {
  it('skips empty file batches', async () => {
    const processFileExtensions = vi.fn(async () => undefined)
    const scheduleIndexing = vi.fn()
    const logWarn = vi.fn()
    const service = new FileProviderWriteSideEffectService({
      processFileExtensions,
      scheduleIndexing,
      logWarn
    })

    await service.dispatch([], {
      extensionContext: 'incremental',
      indexReason: 'incremental-insert'
    })

    expect(processFileExtensions).not.toHaveBeenCalled()
    expect(scheduleIndexing).not.toHaveBeenCalled()
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('awaits indexing scheduling before running extension processing', async () => {
    const files = [{ id: 1, path: '/tmp/a.txt' }]
    const order: string[] = []
    const scheduleGate = Promise.withResolvers<void>()
    const processFileExtensions = vi.fn(async () => {
      order.push('process-extensions')
    })
    const scheduleIndexing = vi.fn(async () => {
      order.push('schedule-indexing')
      await scheduleGate.promise
    })
    const logWarn = vi.fn()
    const service = new FileProviderWriteSideEffectService({
      processFileExtensions,
      scheduleIndexing,
      logWarn
    })

    let settled = false
    const dispatch = service
      .dispatch(files, {
        extensionContext: 'file-update',
        indexReason: 'file-update',
        mutationLeaseId: 'lease-1'
      })
      .then(() => {
        settled = true
      })
    await settleMicrotasks()

    // The diff side effect must be waited on, not fired-and-forgotten.
    expect(order).toEqual(['schedule-indexing'])
    expect(settled).toBe(false)

    scheduleGate.resolve(undefined)
    await dispatch

    expect(order).toEqual(['schedule-indexing', 'process-extensions'])
  })

  it('logs extension processing failures without rejecting the dispatch', async () => {
    const files = [{ id: 1, path: '/tmp/a.txt' }]
    const error = new Error('extension failed')
    const processFileExtensions = vi.fn(async () => {
      throw error
    })
    const scheduleIndexing = vi.fn()
    const logWarn = vi.fn()
    const service = new FileProviderWriteSideEffectService({
      processFileExtensions,
      scheduleIndexing,
      logWarn
    })

    await expect(
      service.dispatch(files, {
        extensionContext: 'reconciliation',
        indexReason: 'reconciliation-insert'
      })
    ).resolves.toBeUndefined()

    expect(logWarn).toHaveBeenCalledWith('processFileExtensions failed (reconciliation)', error)
  })
})
