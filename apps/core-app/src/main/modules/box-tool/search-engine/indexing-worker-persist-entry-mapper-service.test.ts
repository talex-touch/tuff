import { describe, expect, it } from 'vitest'
import { IndexedWorkerPersistEntryMapperService } from './indexing-worker-persist-entry-mapper-service'

describe('indexing-worker-persist-entry-mapper-service', () => {
  it('normalizes worker file updates and progress into persist entries', () => {
    const mapper = new IndexedWorkerPersistEntryMapperService()
    const embeddingWithProvider = {
      model: 'test-model',
      provider: 'dropped-provider',
      vector: [0.1, 0.2]
    }

    const entries = mapper.map([
      {
        fileId: 1,
        fileUpdate: {
          content: 'hello',
          embeddingStatus: 'completed',
          embeddings: [embeddingWithProvider],
          contentHash: undefined
        },
        progress: {
          status: 'completed',
          progress: 100,
          processedBytes: undefined,
          totalBytes: 200,
          lastError: undefined,
          startedAt: '2026-05-30T00:00:00.000Z',
          updatedAt: undefined
        },
        indexItem: {
          itemId: '1',
          providerId: 'file-provider',
          type: 'file',
          name: 'a.txt',
          content: 'hello'
        }
      }
    ])

    expect(entries).toEqual([
      {
        fileId: 1,
        fileUpdate: {
          content: 'hello',
          embeddingStatus: 'completed',
          embeddings: [
            {
              model: 'test-model',
              vector: [0.1, 0.2]
            }
          ],
          contentHash: null
        },
        progress: {
          status: 'completed',
          progress: 100,
          processedBytes: null,
          totalBytes: 200,
          lastError: null,
          startedAt: '2026-05-30T00:00:00.000Z',
          updatedAt: null
        },
        indexItem: {
          itemId: '1',
          providerId: 'file-provider',
          type: 'file',
          name: 'a.txt',
          content: 'hello'
        }
      }
    ])
  })

  it('preserves null file updates for skipped or failed worker results', () => {
    const mapper = new IndexedWorkerPersistEntryMapperService()

    const entries = mapper.map([
      {
        fileId: 2,
        fileUpdate: null,
        progress: {
          status: 'skipped',
          progress: 0,
          processedBytes: null,
          totalBytes: null,
          lastError: 'unsupported',
          startedAt: undefined,
          updatedAt: undefined
        },
        indexItem: {
          itemId: '2',
          providerId: 'file-provider',
          type: 'file',
          name: 'b.txt'
        }
      }
    ])

    expect(entries[0]).toMatchObject({
      fileId: 2,
      fileUpdate: null,
      progress: {
        status: 'skipped',
        processedBytes: null,
        totalBytes: null,
        lastError: 'unsupported',
        startedAt: null,
        updatedAt: null
      }
    })
  })
})
