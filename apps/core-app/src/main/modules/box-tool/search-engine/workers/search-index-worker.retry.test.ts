import { describe, expect, it } from 'vitest'
import { WORKER_RETRY_LABELS, withWorkerWriteRetry } from './search-index-worker'

describe('search-index-worker retry wrapper', () => {
  it('SQLITE_BUSY 时会重试并最终成功', async () => {
    let attempts = 0
    const result = await withWorkerWriteRetry(async () => {
      attempts += 1
      if (attempts === 1) {
        throw new Error('SQLITE_BUSY: database is locked')
      }
      return 'ok'
    }, WORKER_RETRY_LABELS.persistChunk)

    expect(result).toBe('ok')
    expect(attempts).toBe(2)
  })

  it('reports a single completed persist chunk after a busy retry succeeds', async () => {
    const completedChunks: string[] = []
    let attempts = 0
    const result = await withWorkerWriteRetry(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('SQLITE_BUSY: database is locked')
      completedChunks.push('persisted')
      return { persistedRows: 3 }
    }, WORKER_RETRY_LABELS.persistChunk)

    expect(result).toEqual({ persistedRows: 3 })
    expect(attempts).toBe(2)
    expect(completedChunks).toEqual(['persisted'])
  })

  it('非 SQLITE_BUSY 错误不会重试', async () => {
    let attempts = 0
    await expect(
      withWorkerWriteRetry(async () => {
        attempts += 1
        throw new Error('permission denied')
      }, WORKER_RETRY_LABELS.upsertFiles)
    ).rejects.toThrow('permission denied')

    expect(attempts).toBe(1)
  })

  it('重试标签保持稳定', () => {
    expect(WORKER_RETRY_LABELS).toEqual({
      persistChunk: 'search-index.worker.persistChunk',
      upsertFiles: 'search-index.worker.upsertFiles',
      upsertScanProgress: 'search-index.worker.upsertScanProgress',
      removeFile: 'search-index.worker.removeFile',
      removeFileExtensions: 'search-index.worker.removeFileExtensions'
    })
  })
})
