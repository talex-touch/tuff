import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import { describe, expect, it } from 'vitest'
import { FileProviderIndexPersistEntryMapperService } from './file-provider-index-persist-entry-mapper-service'

function createResult(overrides: Partial<IndexWorkerFileResult> = {}): IndexWorkerFileResult {
  return {
    type: 'file',
    taskId: 'task-1',
    fileId: 1,
    progress: {
      status: 'completed',
      progress: 100,
      processedBytes: undefined as never,
      totalBytes: 200,
      lastError: undefined as never,
      startedAt: '2026-05-30T00:00:00.000Z',
      updatedAt: undefined
    },
    fileUpdate: {
      content: 'hello',
      embeddingStatus: 'completed',
      embeddings: [
        {
          model: 'test-model',
          provider: 'test-provider',
          vector: [0.1, 0.2]
        }
      ],
      contentHash: undefined
    },
    indexItem: {
      itemId: '1',
      providerId: 'file-provider',
      type: 'file',
      name: 'a.txt',
      content: 'hello'
    },
    ...overrides
  }
}

describe('file-provider-index-persist-entry-mapper-service', () => {
  it('maps worker result file updates and progress into persist entries', () => {
    const mapper = new FileProviderIndexPersistEntryMapperService()

    const entries = mapper.map([createResult()])

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

  it('preserves null file updates for skipped or failed parser results', () => {
    const mapper = new FileProviderIndexPersistEntryMapperService()

    const entries = mapper.map([
      createResult({
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
        }
      })
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
