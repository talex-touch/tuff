import { describe, expect, it, vi } from 'vitest'
import { FileProviderWriteSideEffectService } from './file-provider-write-side-effect-service'

async function settlePromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
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

    service.dispatch([], {
      extensionContext: 'incremental',
      indexReason: 'incremental-insert'
    })
    await settlePromises()

    expect(processFileExtensions).not.toHaveBeenCalled()
    expect(scheduleIndexing).not.toHaveBeenCalled()
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('runs extension processing asynchronously and schedules indexing', async () => {
    const files = [{ id: 1, path: '/tmp/a.txt' }]
    const processFileExtensions = vi.fn(async () => undefined)
    const scheduleIndexing = vi.fn()
    const logWarn = vi.fn()
    const service = new FileProviderWriteSideEffectService({
      processFileExtensions,
      scheduleIndexing,
      logWarn
    })

    service.dispatch(files, {
      extensionContext: 'file-update',
      indexReason: 'file-update'
    })
    await settlePromises()

    expect(processFileExtensions).toHaveBeenCalledWith(files)
    expect(scheduleIndexing).toHaveBeenCalledWith(files, 'file-update')
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('logs extension processing failures without blocking indexing scheduling', async () => {
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

    service.dispatch(files, {
      extensionContext: 'reconciliation',
      indexReason: 'reconciliation-insert'
    })
    await settlePromises()

    expect(scheduleIndexing).toHaveBeenCalledWith(files, 'reconciliation-insert')
    expect(logWarn).toHaveBeenCalledWith('processFileExtensions failed (reconciliation)', error)
  })
})
