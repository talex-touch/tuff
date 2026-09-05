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

vi.mock('../network', () => ({
  getNetworkService: () => ({ requestStream })
}))

vi.mock('./logger', () => ({
  downloadWorkerLog: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import { DownloadWorker } from './download-worker'
import { ProgressTracker } from './progress-tracker'

const tempDirs: string[] = []

afterEach(async () => {
  requestStream.mockReset()
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => await fs.rm(dir, { recursive: true, force: true }))
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
  chunks: ChunkInfo[]
): Promise<void> {
  const internals = worker as unknown as {
    downloadChunksConcurrently: (
      task: DownloadTask,
      chunks: ChunkInfo[],
      progressTracker: ProgressTracker
    ) => Promise<void>
  }
  return internals.downloadChunksConcurrently(
    downloadTask,
    chunks,
    new ProgressTracker(downloadTask.id)
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
})
