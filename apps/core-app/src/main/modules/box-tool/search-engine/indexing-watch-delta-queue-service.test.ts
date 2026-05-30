import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IndexingWatchDeltaQueueService as SdkIndexingWatchDeltaQueueService } from '@talex-touch/utils/search'
import { IndexingWatchDeltaQueueService } from './indexing-watch-delta-queue-service'

interface TestDeltaPayload {
  action: 'add' | 'change' | 'delete'
  rawPath: string
  manual?: boolean
  source?: string
}

function createService(
  options: {
    shouldAccept?: (rawPath: string) => boolean
    prepareFlush?: () => Promise<boolean>
  } = {}
) {
  const processEntries = vi.fn(async () => undefined)
  const service = new IndexingWatchDeltaQueueService<TestDeltaPayload>({
    normalizeKey: (rawPath) => rawPath.toLowerCase(),
    shouldAccept: options.shouldAccept ?? (() => true),
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

async function settleTaskChain(): Promise<void> {
  await settleQueue()
  await settleQueue()
}

describe('indexing-watch-delta-queue-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('re-exports the public SDK watch delta queue for legacy CoreApp imports', () => {
    expect(IndexingWatchDeltaQueueService).toBe(SdkIndexingWatchDeltaQueueService)
  })

  it('ignores rejected paths', async () => {
    const { processEntries, service } = createService({
      shouldAccept: () => false
    })

    service.enqueue('/tmp/a.txt', 'add')
    await settleQueue()

    expect(service.getPendingSize()).toBe(0)
    expect(processEntries).not.toHaveBeenCalled()
  })

  it('coalesces add and change for the same normalized key', async () => {
    const { processEntries, service } = createService()

    service.enqueue('/Tmp/A.txt', 'add', { manual: false })
    service.enqueue('/tmp/a.txt', 'change', { manual: false })
    await settleQueue()

    expect(processEntries).toHaveBeenCalledWith([
      ['/tmp/a.txt', { action: 'add', rawPath: '/Tmp/A.txt', manual: false }]
    ])
  })

  it('keeps delete as the final action for a pending key', async () => {
    const { processEntries, service } = createService()

    service.enqueue('/tmp/a.txt', 'add')
    service.enqueue('/tmp/a.txt', 'delete')
    service.enqueue('/tmp/a.txt', 'change')
    await settleQueue()

    expect(processEntries).toHaveBeenCalledWith([
      ['/tmp/a.txt', { action: 'delete', rawPath: '/tmp/a.txt' }]
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

  it('serializes flush processing', async () => {
    let releaseFirstFlush!: () => void
    const firstFlush = new Promise<void>((resolve) => {
      releaseFirstFlush = resolve
    })
    const processEntries = vi
      .fn()
      .mockImplementationOnce(async () => firstFlush)
      .mockImplementationOnce(async () => undefined)
    const service = new IndexingWatchDeltaQueueService<TestDeltaPayload>({
      normalizeKey: (rawPath) => rawPath.toLowerCase(),
      shouldAccept: () => true,
      prepareFlush: async () => true,
      processEntries,
      logError: vi.fn()
    })

    service.enqueue('/tmp/a.txt', 'add')
    await settleQueue()
    service.enqueue('/tmp/b.txt', 'change')
    await settleQueue()

    expect(processEntries).toHaveBeenCalledTimes(1)

    releaseFirstFlush()
    await settleTaskChain()

    expect(processEntries).toHaveBeenCalledTimes(2)
    expect(processEntries).toHaveBeenLastCalledWith([
      ['/tmp/b.txt', { action: 'change', rawPath: '/tmp/b.txt' }]
    ])
  })

  it('supports source-specific metadata coalescing', async () => {
    const processEntries = vi.fn(async () => undefined)
    const service = new IndexingWatchDeltaQueueService<TestDeltaPayload>({
      normalizeKey: (rawPath) => rawPath.toLowerCase(),
      shouldAccept: () => true,
      prepareFlush: async () => true,
      processEntries,
      logError: vi.fn(),
      coalesce: ({ previous, next }) => ({
        ...next,
        manual: previous?.manual === true || next.manual === true,
        source: previous?.source ?? next.source
      })
    })

    service.enqueue('/tmp/a.txt', 'change', { manual: true, source: 'watcher' })
    service.enqueue('/tmp/a.txt', 'change', { manual: false, source: 'manual' })
    await settleQueue()

    expect(processEntries).toHaveBeenCalledWith([
      [
        '/tmp/a.txt',
        {
          action: 'change',
          rawPath: '/tmp/a.txt',
          manual: true,
          source: 'watcher'
        }
      ]
    ])
  })
})
