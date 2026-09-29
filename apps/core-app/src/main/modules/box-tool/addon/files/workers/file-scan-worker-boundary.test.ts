import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FileScanOptions } from '@talex-touch/utils/common/file-scan-constants'
import {
  scanDirectoryBatches,
  type ScannedFileInfo
} from '@talex-touch/utils/common/file-scan-utils'

/** The frames the worker publishes to its host, as the host client reads them. */
type WorkerBatchFrame = {
  type: 'batch'
  taskId: string
  sequence: number
  batch: ScannedFileInfo[]
}
type WorkerDoneFrame = {
  type: 'done'
  taskId: string
  scannedCount: number
  errorCount: number
  backend: 'fd' | 'legacy' | 'mixed'
  fdFallback: boolean
}
type WorkerErrorFrame = { type: 'error'; taskId: string; error: string }
type WorkerFrame = WorkerBatchFrame | WorkerDoneFrame | WorkerErrorFrame

/**
 * The packaged worker runs without Electron: an Electron-facing import anywhere in its graph fails
 * at spawn with `Cannot find module 'electron'`, which the signed smoke caught. This drives the
 * real worker module — over a fake parent port, with `electron` poisoned — through one scan task,
 * and acknowledges batches the way the host client does.
 */
const workerPort = vi.hoisted(() => {
  type Handler = (payload: unknown) => void
  const handlers: Handler[] = []
  const frames: WorkerFrame[] = []
  const doneWaiters = new Map<string, (frame: WorkerDoneFrame) => void>()

  return {
    frames,
    framesOfType<Type extends WorkerFrame['type']>(
      type: Type,
      taskId: string
    ): Array<Extract<WorkerFrame, { type: Type }>> {
      return frames.filter(
        (frame): frame is Extract<WorkerFrame, { type: Type }> =>
          frame.type === type && frame.taskId === taskId
      )
    },
    waitForDone(taskId: string): Promise<WorkerDoneFrame> {
      const settled = frames.find(
        (frame): frame is WorkerDoneFrame => frame.type === 'done' && frame.taskId === taskId
      )
      if (settled) return Promise.resolve(settled)
      const { promise, resolve } = Promise.withResolvers<WorkerDoneFrame>()
      doneWaiters.set(taskId, resolve)
      return promise
    },
    emit(payload: unknown): void {
      for (const handler of [...handlers]) handler(payload)
    },
    parentPort: {
      on(event: string, handler: Handler): void {
        if (event === 'message') handlers.push(handler)
      },
      postMessage(frame: WorkerFrame): void {
        frames.push(frame)
        if (frame.type === 'batch') {
          // The worker parks on each batch until the host acknowledges it.
          for (const handler of [...handlers]) {
            handler({ type: 'batchAck', taskId: frame.taskId, sequence: frame.sequence })
          }
        }
        if (frame.type === 'done') {
          doneWaiters.get(frame.taskId)?.(frame)
          doneWaiters.delete(frame.taskId)
        }
      }
    }
  }
})

vi.mock('node:worker_threads', () => ({ parentPort: workerPort.parentPort }))
vi.mock('electron', () => {
  throw new Error('ELECTRON_IMPORTED_BY_FILE_SCAN_WORKER')
})

// Loading the worker is the assertion: its message loop only runs if the whole graph resolves
// against worker-safe modules, with no Electron-facing import in it.
import './file-scan-worker'

/** Traversal and admission filters off: the fixture tree lives under a system temp path. */
const scanOptions: FileScanOptions = {
  maxDepth: 4,
  enableSystemPathFilter: false,
  enableCachePathFilter: false,
  enableDevPathFilter: false,
  enablePhotosLibraryFilter: false
}

/** The worker relays the shared walker's results, so paths compare on the index's own identity. */
function sortedPaths(files: ScannedFileInfo[]): string[] {
  return files.map((file) => file.path.normalize('NFC')).sort()
}

describe('file-scan worker import boundary', () => {
  let root = ''

  beforeAll(() => {
    // realpath: the walkers canonicalise the root they are handed, and /var is a symlink of
    // /private/var on macOS.
    root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tuff-file-scan-worker-')))
    writeFileSync(path.join(root, 'root.txt'), 'root')
    writeFileSync(path.join(root, 'notes.md'), '# notes')
    mkdirSync(path.join(root, 'nested'))
    writeFileSync(path.join(root, 'nested', 'deep.txt'), 'deep')
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('publishes the shared walker set for a scan task with Electron unavailable', async () => {
    const taskId = 'boundary-task'
    const finished = workerPort.waitForDone(taskId)

    workerPort.emit({
      type: 'scan',
      taskId,
      paths: [root],
      batchSize: 2,
      options: scanOptions
    })

    const done = await finished
    const batches = workerPort.framesOfType('batch', taskId)

    // Every published batch is complete and none of them stalls: the host acknowledged each one.
    expect(batches.length).toBeGreaterThan(0)
    expect(batches.every((frame) => frame.batch.length <= 2)).toBe(true)
    expect(done.scannedCount).toBe(batches.flatMap((frame) => frame.batch).length)

    const direct: ScannedFileInfo[][] = []
    await scanDirectoryBatches(
      root,
      async (batch) => {
        direct.push(batch)
      },
      scanOptions,
      undefined,
      { batchSize: 2 }
    )

    // Non-vacuous parity: the worker admitted the tree the shared walker admits, not an empty one.
    expect(sortedPaths(batches.flatMap((frame) => frame.batch))).toEqual(sortedPaths(direct.flat()))
    expect(sortedPaths(direct.flat()).length).toBeGreaterThan(0)
    expect(done.errorCount).toBe(0)
    expect(workerPort.framesOfType('error', taskId)).toEqual([])
  })
})
