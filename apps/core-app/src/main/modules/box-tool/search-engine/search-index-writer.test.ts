import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SearchIndexItem, SearchIndexProviderReplacementSummary } from './search-index-service'
import { SearchIndexCommitHub } from './search-index-commit-hub'
import {
  SearchIndexWriter,
  SourceScopedIndexWriterRouter,
  type SearchIndexPhysicalWriter
} from './search-index-writer'
import type { SearchIndexWorkerClient } from './workers/search-index-worker-client'

const writerLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn()
}))

vi.mock('../../../utils/logger', () => ({
  createLogger: () => ({ child: () => writerLog })
}))

function createPhysicalWriter(onCommit: () => void): SearchIndexPhysicalWriter {
  return {
    mode: 'runtime',
    indexItems: vi.fn(async () => {
      onCommit()
      return 1
    }),
    beginSourceReplacement: vi.fn(async () => undefined),
    stageSourceReplacement: vi.fn(async () => 0),
    commitSourceReplacement: vi.fn(
      async (): Promise<SearchIndexProviderReplacementSummary> => ({
        removedItems: 0,
        indexedItems: 0
      })
    ),
    abortSourceReplacement: vi.fn(async () => undefined),
    removeProviderItems: vi.fn(async () => 0),
    clearSource: vi.fn(async () => 0),
    cleanupSource: vi.fn(async () => 0),
    countSource: vi.fn(async () => 0),
    drain: vi.fn(async () => undefined)
  }
}

function indexedItem(itemId: string): SearchIndexItem {
  return { itemId, providerId: 'file-provider', type: 'file', name: itemId }
}

describe('SourceScopedIndexWriterRouter visibility publication', () => {
  afterEach(() => {
    vi.useRealTimers()
    writerLog.info.mockClear()
    writerLog.warn.mockClear()
  })

  it('publishes a generation only after the physical commit becomes readable', async () => {
    const sequence: string[] = []
    const commitHub = new SearchIndexCommitHub()
    commitHub.subscribe(() => sequence.push('generation'))
    const writer = createPhysicalWriter(() => sequence.push('physical commit'))
    const visibilityBarrier = {
      waitUntilReadable: vi.fn(async () => {
        sequence.push('barrier')
      })
    }
    const router = new SourceScopedIndexWriterRouter({
      runtime: writer,
      legacy: writer,
      visibilityBarrier,
      commitHub
    })

    const commit = await router.indexItems('file-provider', [indexedItem('file:/tmp/one.txt')])

    expect(sequence).toEqual(['physical commit', 'barrier', 'generation'])
    expect(commit).toMatchObject({
      sourceId: 'file-provider',
      kind: 'index',
      writer: 'runtime',
      affectedItems: 1,
      committed: true,
      revision: 1,
      generation: 1
    })
  })

  it('publishes degraded commits and bounds one deduplicated visibility retry per source', async () => {
    vi.useFakeTimers()
    const commitHub = new SearchIndexCommitHub()
    const committedPayloads: Array<{
      revision: number
      sourceGenerations: Record<string, number>
    }> = []
    commitHub.subscribe((payload) => committedPayloads.push(payload))
    const writer = createPhysicalWriter(() => undefined)
    const visibilityBarrier = {
      waitUntilReadable: vi.fn(async () => {
        throw new Error('reader remains unavailable')
      })
    }
    const router = new SourceScopedIndexWriterRouter({
      runtime: writer,
      legacy: writer,
      visibilityBarrier,
      commitHub
    })

    const first = await router.indexItems('file-provider', [indexedItem('file:/tmp/one.txt')])
    const second = await router.indexItems('file-provider', [indexedItem('file:/tmp/two.txt')])

    expect(first).toMatchObject({ committed: true, revision: 1, generation: 1 })
    expect(second).toMatchObject({ committed: true, revision: 2, generation: 2 })
    expect(committedPayloads).toMatchObject([
      { revision: 1, sourceGenerations: { 'file-provider': 1 } },
      { revision: 2, sourceGenerations: { 'file-provider': 2 } }
    ])
    expect(writerLog.warn).toHaveBeenNthCalledWith(
      1,
      'Search index commit has degraded reader visibility',
      {
        meta: { sourceId: 'file-provider', kind: 'index' }
      }
    )
    expect(writerLog.warn).toHaveBeenNthCalledWith(
      2,
      'Search index commit has degraded reader visibility',
      {
        meta: { sourceId: 'file-provider', kind: 'index' }
      }
    )

    await vi.runAllTimersAsync()

    expect(visibilityBarrier.waitUntilReadable).toHaveBeenCalledTimes(5)
    expect(writerLog.warn).toHaveBeenCalledTimes(5)
  })
})

describe('SearchIndexWriter shutdown recovery', () => {
  it('keeps shutdown pending for drain settlement and closes the client exactly once on retry', async () => {
    let rejectDrain!: (reason?: unknown) => void
    const unresolvedDrain = new Promise<void>((_resolve, reject) => {
      rejectDrain = reject
    })
    const client: Pick<SearchIndexWorkerClient, 'drain' | 'shutdown'> = {
      drain: vi.fn().mockReturnValueOnce(unresolvedDrain).mockResolvedValueOnce(undefined),
      shutdown: vi.fn(async () => undefined)
    }
    const writer = new SearchIndexWriter({ client: client as unknown as SearchIndexWorkerClient })

    const firstShutdown = writer.shutdown(1)
    void firstShutdown.catch(() => undefined)
    await vi.waitFor(() => expect(client.drain).toHaveBeenCalledTimes(1))
    expect(client.shutdown).not.toHaveBeenCalled()

    rejectDrain(new Error('SEARCH_INDEX_WRITER_DRAIN_TIMEOUT'))
    await expect(firstShutdown).rejects.toThrow('SEARCH_INDEX_WRITER_DRAIN_TIMEOUT')
    expect(client.shutdown).not.toHaveBeenCalled()
    await expect(
      writer.indexItems('file-provider', [indexedItem('file:/tmp/closed.txt')])
    ).rejects.toThrow('SEARCH_INDEX_WRITER_CLOSED')

    await writer.shutdown(1)
    await writer.shutdown(1)

    expect(client.drain).toHaveBeenCalledTimes(2)
    expect(client.shutdown).toHaveBeenCalledTimes(1)
  })
})
