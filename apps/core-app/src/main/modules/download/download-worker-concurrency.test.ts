/**
 * Regression for the lane scheduler: every mapped chunk must await the promise currently assigned
 * to its lane, rather than all observing the initially resolved placeholder. A one-microtask
 * response delay keeps each range request active long enough to expose eager starts deterministically.
 */
import { ChunkStatus } from '@talex-touch/utils'
import type { ChunkInfo, DownloadTask } from '@talex-touch/utils'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

import '../ai/intelligence-test-harness'

const requestStream = vi.hoisted(() => vi.fn())
const downloadWorkerLog = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
}))

vi.mock('../network', () => ({
  getNetworkService: () => ({ requestStream })
}))

vi.mock('./logger', () => ({ downloadWorkerLog }))

import { DownloadWorker } from './download-worker'
import { DownloadErrorType, ErrorSeverity } from './error-types'
import { ProgressTracker } from './progress-tracker'

const tempDirs: string[] = []

afterEach(async () => {
  requestStream.mockReset()
  downloadWorkerLog.warn.mockReset()
  downloadWorkerLog.error.mockReset()
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await fs.rm(dir, { recursive: true, force: true })
          return
        } catch (error: unknown) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOTEMPTY' || attempt === 2) {
            throw error
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 10))
        }
      }
    })
  )
})

async function createWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'download-concurrency-'))
  tempDirs.push(dir)
  return dir
}

function task(destination: string): DownloadTask {
  return {
    id: 'task-1',
    destination,
    filename: 'payload.bin',
    url: 'https://example.test/payload.bin'
  } as unknown as DownloadTask
}

function chunk(dir: string, index: number): ChunkInfo {
  return {
    index,
    start: index,
    end: index,
    size: 1,
    downloaded: 0,
    status: ChunkStatus.PENDING,
    filePath: path.join(dir, `chunk-${index}`)
  } as ChunkInfo
}

/** downloadChunksConcurrently is private; its range-request scheduling is the contract under test. */
function downloadChunks(
  worker: DownloadWorker,
  downloadTask: DownloadTask,
  chunks: ChunkInfo[],
  abortSignal?: AbortSignal
): Promise<void> {
  const internals = worker as unknown as {
    downloadChunksConcurrently: (
      task: DownloadTask,
      chunks: ChunkInfo[],
      progressTracker: ProgressTracker,
      onProgress?: never,
      abortSignal?: AbortSignal
    ) => Promise<void>
  }
  return internals.downloadChunksConcurrently(
    downloadTask,
    chunks,
    new ProgressTracker(downloadTask.id),
    undefined,
    abortSignal
  )
}

describe('DownloadWorker chunk concurrency', () => {
  it('never starts more ranged requests than the configured limit', async () => {
    const concurrentLimit = 2
    const dir = await createWorkspace()
    const chunks = Array.from({ length: 4 }, (_, index) => chunk(dir, index))
    let activeRequests = 0
    let peakActiveRequests = 0

    requestStream.mockImplementation(async () => {
      activeRequests += 1
      peakActiveRequests = Math.max(peakActiveRequests, activeRequests)

      // The scheduler has an opportunity to start another chunk before this request settles.
      await new Promise<void>((resolve) => queueMicrotask(resolve))
      activeRequests -= 1

      return { headers: {}, stream: Readable.from([Buffer.from('x')]) }
    })

    const worker = new DownloadWorker(
      concurrentLimit,
      {} as never,
      {
        getChunkProgress: (activeChunks: ChunkInfo[]) => ({
          downloadedSize: activeChunks.reduce(
            (sum, activeChunk) => sum + activeChunk.downloaded,
            0
          ),
          totalSize: activeChunks.reduce((sum, activeChunk) => sum + activeChunk.size, 0)
        })
      } as never,
      { chunk: { maxRetries: 0 }, network: { timeout: 5_000, retryDelay: 0 } } as never
    )

    await downloadChunks(worker, task(dir), chunks)

    expect(peakActiveRequests).toBeLessThanOrEqual(concurrentLimit)
    expect(activeRequests).toBe(0)
    expect(requestStream).toHaveBeenCalledTimes(chunks.length)
    expect(chunks.map(({ downloaded, size, status }) => ({ downloaded, size, status }))).toEqual([
      { downloaded: 1, size: 1, status: ChunkStatus.COMPLETED },
      { downloaded: 1, size: 1, status: ChunkStatus.COMPLETED },
      { downloaded: 1, size: 1, status: ChunkStatus.COMPLETED },
      { downloaded: 1, size: 1, status: ChunkStatus.COMPLETED }
    ])
  })

  it('logs a redacted summary when a chunk request is retried', async () => {
    const dir = await createWorkspace()
    const chunks = [chunk(dir, 0)]
    const sensitiveToken = 'retry-secret-token'
    const sensitiveUrl = 'https://private.example/download/payload.bin?token=retry-secret-token'
    const rawError = Object.assign(new Error(`network request failed: ${sensitiveUrl}`), {
      path: '/private/downloads/payload.bin',
      token: sensitiveToken,
      headers: { Authorization: `Bearer ${sensitiveToken}`, Range: 'bytes=0-0' },
      request: { method: 'GET', url: sensitiveUrl },
      config: { headers: { Authorization: `Bearer ${sensitiveToken}` }, url: sensitiveUrl }
    })
    let requestCount = 0

    requestStream.mockImplementation(async () => {
      requestCount += 1
      if (requestCount === 1) {
        throw rawError
      }

      return { headers: {}, stream: Readable.from([Buffer.from('x')]) }
    })

    const worker = new DownloadWorker(
      1,
      {} as never,
      {
        getChunkProgress: (activeChunks: ChunkInfo[]) => ({
          downloadedSize: activeChunks.reduce(
            (sum, activeChunk) => sum + activeChunk.downloaded,
            0
          ),
          totalSize: activeChunks.reduce((sum, activeChunk) => sum + activeChunk.size, 0)
        })
      } as never,
      { chunk: { maxRetries: 1 }, network: { timeout: 5_000, retryDelay: 0 } } as never
    )

    await downloadChunks(worker, task(dir), chunks)

    expect(requestCount).toBe(2)
    expect(downloadWorkerLog.warn).toHaveBeenCalledTimes(1)
    expect(downloadWorkerLog.warn).toHaveBeenCalledWith('Chunk download retry failed', {
      error: {
        type: DownloadErrorType.NETWORK_ERROR,
        severity: ErrorSeverity.MEDIUM,
        canRetry: true
      },
      meta: { taskId: 'task-1', chunkIndex: 0, retryCount: 1 }
    })

    const [, loggedPayload] = downloadWorkerLog.warn.mock.calls[0]
    expect(JSON.stringify(loggedPayload)).not.toContain(sensitiveUrl)
    expect(JSON.stringify(loggedPayload)).not.toContain('/private/downloads/payload.bin')
    expect(JSON.stringify(loggedPayload)).not.toContain(sensitiveToken)
    expect(loggedPayload).not.toHaveProperty('headers')
    expect(loggedPayload).not.toHaveProperty('request')
    expect(loggedPayload).not.toHaveProperty('config')
    expect(loggedPayload).not.toHaveProperty('stack')
    expect(loggedPayload).not.toHaveProperty('error.message')
    expect(loggedPayload).not.toHaveProperty('error.context')
    expect(loggedPayload).not.toHaveProperty('error.originalError')
    expect(loggedPayload).not.toHaveProperty('error.stackTrace')
  })

  it('rejects cancellation raised during the final chunk after all lanes settle', async () => {
    const dir = await createWorkspace()
    const chunks = Array.from({ length: 2 }, (_, index) => chunk(dir, index))
    const abortController = new AbortController()

    requestStream.mockImplementation(async (request: { headers: Record<string, string> }) => {
      if (request.headers.Range === 'bytes=1-1') {
        abortController.abort()
      }

      return { headers: {}, stream: Readable.from([Buffer.from('x')]) }
    })

    const worker = new DownloadWorker(
      1,
      {} as never,
      {
        getChunkProgress: (activeChunks: ChunkInfo[]) => ({
          downloadedSize: activeChunks.reduce(
            (sum, activeChunk) => sum + activeChunk.downloaded,
            0
          ),
          totalSize: activeChunks.reduce((sum, activeChunk) => sum + activeChunk.size, 0)
        })
      } as never,
      { chunk: { maxRetries: 0 }, network: { timeout: 5_000, retryDelay: 0 } } as never
    )

    await expect(downloadChunks(worker, task(dir), chunks, abortController.signal)).rejects.toThrow(
      'Task was cancelled'
    )
  })

  it('keeps an active request owned until terminal failure can surface', async () => {
    const dir = await createWorkspace()
    const chunks = Array.from({ length: 3 }, (_, index) => chunk(dir, index))
    const activeRequestStarted = Promise.withResolvers<void>()
    const activeRequest = Promise.withResolvers<{
      headers: Record<string, string>
      stream: Readable
    }>()
    const activeRequestResolved = Promise.withResolvers<void>()
    const terminalFailureLogged = Promise.withResolvers<void>()
    const outerFailureSurfaced = Promise.withResolvers<void>()
    const terminalFailure = new Error('first chunk failed permanently')
    const requestRanges: string[] = []

    activeRequest.promise.then(() => activeRequestResolved.resolve())

    requestStream.mockImplementation(async (request: { headers: Record<string, string> }) => {
      const range = request.headers.Range
      requestRanges.push(range)

      if (range === 'bytes=0-0') {
        await activeRequestStarted.promise
        throw terminalFailure
      }

      if (range === 'bytes=1-1') {
        activeRequestStarted.resolve()
        return await activeRequest.promise
      }

      throw new Error(`Queued chunk was claimed after terminal failure: ${range}`)
    })
    downloadWorkerLog.error.mockImplementationOnce(() => {
      terminalFailureLogged.resolve()
      // Keep the active lane at its request boundary through two microtask checkpoints. An
      // immediate Promise.all rejection wins this race; a drained worker can only surface the
      // terminal error after this request resolves.
      queueMicrotask(() => {
        queueMicrotask(() => {
          activeRequest.resolve({ headers: {}, stream: Readable.from([Buffer.from('x')]) })
        })
      })
    })

    const worker = new DownloadWorker(
      2,
      {} as never,
      {
        getChunkProgress: (activeChunks: ChunkInfo[]) => ({
          downloadedSize: activeChunks.reduce(
            (sum, activeChunk) => sum + activeChunk.downloaded,
            0
          ),
          totalSize: activeChunks.reduce((sum, activeChunk) => sum + activeChunk.size, 0)
        })
      } as never,
      { chunk: { maxRetries: 0 }, network: { timeout: 5_000, retryDelay: 0 } } as never
    )

    const result = downloadChunks(worker, task(dir), chunks).then(
      () => ({ error: undefined }),
      (error: unknown) => {
        outerFailureSurfaced.resolve()
        return { error }
      }
    )

    await terminalFailureLogged.promise

    expect(downloadWorkerLog.error).toHaveBeenCalledWith(
      'Chunk download failed',
      expect.objectContaining({ meta: expect.objectContaining({ chunkIndex: 0 }) })
    )
    expect(requestRanges).toEqual(['bytes=0-0', 'bytes=1-1'])
    await expect(
      Promise.race([
        activeRequestResolved.promise.then(() => 'active request resolved'),
        outerFailureSurfaced.promise.then(() => 'outer failure surfaced')
      ])
    ).resolves.toBe('active request resolved')

    const { error } = await result
    expect(error).toMatchObject({ message: terminalFailure.message })
  })
})
