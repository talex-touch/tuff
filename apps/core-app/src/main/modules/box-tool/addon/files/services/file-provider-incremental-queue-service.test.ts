import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FileProviderIncrementalQueueService } from './file-provider-incremental-queue-service'

function createService(
  options: {
    isWithinWatchRoots?: (rawPath: string) => boolean
    prepareFlush?: () => Promise<boolean>
  } = {}
) {
  const processEntries = vi.fn(async () => undefined)
  const service = new FileProviderIncrementalQueueService({
    normalizePath: (rawPath) => rawPath.toLowerCase(),
    isWithinWatchRoots: options.isWithinWatchRoots ?? (() => true),
    prepareFlush: options.prepareFlush ?? (async () => true),
    processEntries,
    logError: vi.fn()
  })

  return {
    processEntries,
    service
  }
}

async function settleQueue(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('file-provider-incremental-queue-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ignores paths outside watch roots', async () => {
    const { processEntries, service } = createService({
      isWithinWatchRoots: () => false
    })

    service.enqueue('/tmp/a.txt', 'add')
    await settleQueue()

    expect(service.getPendingSize()).toBe(0)
    expect(processEntries).not.toHaveBeenCalled()
  })

  it('coalesces add and change for the same normalized path', async () => {
    const { processEntries, service } = createService()

    service.enqueue('/Tmp/A.txt', 'add')
    service.enqueue('/tmp/a.txt', 'change')
    await settleQueue()

    expect(processEntries).toHaveBeenCalledWith([
      ['/tmp/a.txt', { action: 'add', rawPath: '/Tmp/A.txt', manual: false }]
    ])
  })

  it('keeps delete as the final action for a pending path', async () => {
    const { processEntries, service } = createService()

    service.enqueue('/tmp/a.txt', 'add')
    service.enqueue('/tmp/a.txt', 'delete')
    service.enqueue('/tmp/a.txt', 'change')
    await settleQueue()

    expect(processEntries).toHaveBeenCalledWith([
      ['/tmp/a.txt', { action: 'delete', rawPath: '/tmp/a.txt' }]
    ])
  })

  it('preserves manual state across coalesced changes', async () => {
    const { processEntries, service } = createService()

    service.enqueue('/tmp/a.txt', 'change', { manual: true })
    service.enqueue('/tmp/a.txt', 'change')
    await settleQueue()

    expect(processEntries).toHaveBeenCalledWith([
      ['/tmp/a.txt', { action: 'change', rawPath: '/tmp/a.txt', manual: true }]
    ])
  })

  it('keeps pending entries when flush preparation is not ready', async () => {
    const { processEntries, service } = createService({
      prepareFlush: async () => false
    })

    service.enqueue('/tmp/a.txt', 'add')
    await settleQueue()

    expect(service.getPendingSize()).toBe(1)
    expect(processEntries).not.toHaveBeenCalled()
  })
})
