/**
 * The single-stream path opened the destination with 'w', truncating whatever was already there
 * before one new byte was known good — and its failure path then unlinked that same path, so a
 * failed re-download did not merely corrupt the previous file, it *removed* it (#1457).
 *
 * Found while fixing the chunked merge (#781) and filed rather than folded into that PR. Same fix
 * shape: stream to a sibling .part and rename into place.
 *
 * These run against a real temp directory, because the property under test is what is on disk
 * after a failed download, which a mocked fs cannot show.
 */
import type { DownloadTask } from '@talex-touch/utils'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The import graph reaches modules that touch electron at module scope; this harness is the
// repo's own answer to that.
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'single-stream-'))
  tempDirs.push(dir)
  return dir
}

function task(destination: string): DownloadTask {
  return {
    id: 'task-1',
    destination,
    filename: 'payload.bin',
    url: 'https://example.test/f'
  } as unknown as DownloadTask
}

/** A worker whose network layer replays `chunks`, optionally failing after emitting them. */
function createWorker(chunks: string[], failure?: Error): DownloadWorker {
  requestStream.mockImplementation(async () => ({
    headers: {},
    stream: new Readable({
      read() {
        for (const chunk of chunks) this.push(Buffer.from(chunk))
        if (failure) this.destroy(failure)
        else this.push(null)
      }
    })
  }))

  return new DownloadWorker(1, {} as never, {} as never, { network: { timeout: 5_000 } } as never)
}

/** downloadWithoutChunks is private; the property under test lives only on that path. */
function run(worker: DownloadWorker, destination: string): Promise<unknown> {
  const internals = worker as unknown as {
    downloadWithoutChunks: (
      task: DownloadTask,
      tracker: ProgressTracker,
      headers?: Record<string, string>
    ) => Promise<unknown>
  }
  return internals.downloadWithoutChunks(task(destination), new ProgressTracker('task-1'))
}

describe('a single-stream download does not damage the destination', () => {
  it('成功后目标文件是完整内容,且不留 .part 残留', async () => {
    const dir = await createWorkspace()

    await run(createWorker(['hello-', 'world']), dir)

    expect(requestStream).toHaveBeenCalledWith(
      expect.objectContaining({ streamTimeoutMode: 'caller-signal' })
    )
    expect(await fs.readFile(path.join(dir, 'payload.bin'), 'utf8')).toBe('hello-world')
    expect((await fs.readdir(dir)).filter((name) => name.endsWith('.part'))).toEqual([])
  })

  it('传输中途失败时,已存在的目标文件原封不动', async () => {
    const dir = await createWorkspace()
    const destination = path.join(dir, 'payload.bin')
    await fs.writeFile(destination, 'previous-good-download')

    await expect(
      run(createWorker(['partial-'], new Error('connection reset')), dir)
    ).rejects.toThrow(/connection reset/)

    // Before the fix this file did not exist at all: truncated by 'w', then unlinked on failure.
    expect(await fs.readFile(destination, 'utf8')).toBe('previous-good-download')
  })

  it('目标文件此前不存在且失败时,不会凭空造出一个截断文件', async () => {
    const dir = await createWorkspace()

    await expect(
      run(createWorker(['partial-'], new Error('connection reset')), dir)
    ).rejects.toThrow()

    expect(existsSync(path.join(dir, 'payload.bin'))).toBe(false)
  })

  it('失败后不留下 .part 残留文件', async () => {
    const dir = await createWorkspace()

    await expect(
      run(createWorker(['partial-'], new Error('connection reset')), dir)
    ).rejects.toThrow()

    expect((await fs.readdir(dir)).filter((name) => name.endsWith('.part'))).toEqual([])
  })
})
