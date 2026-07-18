import type { FileScanOptions, ScannedFileInfo } from '@talex-touch/utils/common/file-scan-utils'
import type {
  WorkerMetricsPayload,
  WorkerMetricsRequest,
  WorkerMetricsResponse
} from './worker-status'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { parentPort } from 'node:worker_threads'
import { scanDirectoryBatches } from '@talex-touch/utils/common/file-scan-utils'

interface FileScanRequest {
  type: 'scan'
  taskId: string
  paths: string[]
  excludePaths?: string[]
  options?: FileScanOptions
  batchSize?: number
}

interface FileScanCancelRequest {
  type: 'cancel'
  taskId: string
}

interface FileScanBatchAckRequest {
  type: 'batchAck'
  taskId: string
  sequence: number
}

interface FileScanBatchMessage {
  type: 'batch'
  taskId: string
  batch: ScannedFileInfo[]
  sequence: number
}

interface FileScanDoneMessage {
  type: 'done'
  taskId: string
  scannedCount: number
}

interface FileScanErrorMessage {
  type: 'error'
  taskId: string
  error: string
}

function buildMetricsPayload(): WorkerMetricsPayload {
  const memory = process.memoryUsage()
  const eventLoop =
    typeof performance.eventLoopUtilization === 'function'
      ? performance.eventLoopUtilization()
      : null
  return {
    timestamp: Date.now(),
    memory: {
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers ?? 0
    },
    cpuUsage: process.cpuUsage(),
    eventLoop: eventLoop
      ? {
          active: eventLoop.active,
          idle: eventLoop.idle,
          utilization: eventLoop.utilization
        }
      : null
  }
}

const queue: FileScanRequest[] = []
const activeControllers = new Map<string, AbortController>()
const cancelledTasks = new Set<string>()
const batchAckWaiters = new Map<string, () => void>()
let running = false

async function processQueue(): Promise<void> {
  if (running) {
    return
  }
  const next = queue.shift()
  if (!next) {
    return
  }
  running = true
  if (cancelledTasks.delete(next.taskId)) {
    running = false
    if (queue.length > 0) void processQueue()
    return
  }

  const excludePathsSet = next.excludePaths ? new Set(next.excludePaths) : undefined
  const batchSize = Math.max(1, Number(next.batchSize ?? 500))
  const controller = new AbortController()
  activeControllers.set(next.taskId, controller)
  let scannedCount = 0
  let sequence = 0

  try {
    for (const scanPath of next.paths) {
      await scanDirectoryBatches(
        scanPath,
        async (batch) => {
          controller.signal.throwIfAborted()
          const currentSequence = sequence
          sequence += 1
          const ackKey = `${next.taskId}:${String(currentSequence)}`
          const acknowledged = new Promise<void>((resolve) => {
            batchAckWaiters.set(ackKey, resolve)
          })
          parentPort?.postMessage({
            type: 'batch',
            taskId: next.taskId,
            sequence: currentSequence,
            batch
          } satisfies FileScanBatchMessage)
          await acknowledged
          controller.signal.throwIfAborted()
          scannedCount += batch.length
        },
        next.options,
        excludePathsSet,
        { batchSize, signal: controller.signal }
      )
    }

    parentPort?.postMessage({
      type: 'done',
      taskId: next.taskId,
      scannedCount
    } satisfies FileScanDoneMessage)
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      taskId: next.taskId,
      error: error instanceof Error ? error.message : String(error)
    } satisfies FileScanErrorMessage)
  } finally {
    activeControllers.delete(next.taskId)
    cancelledTasks.delete(next.taskId)
    for (const [key, resolve] of batchAckWaiters) {
      if (!key.startsWith(`${next.taskId}:`)) continue
      batchAckWaiters.delete(key)
      resolve()
    }
    running = false
    if (queue.length > 0) {
      void processQueue()
    }
  }
}

parentPort?.on(
  'message',
  (
    payload:
      | FileScanRequest
      | FileScanCancelRequest
      | FileScanBatchAckRequest
      | WorkerMetricsRequest
  ) => {
    if (!payload) {
      return
    }
    if (payload.type === 'metrics') {
      parentPort?.postMessage({
        type: 'metrics',
        requestId: payload.requestId,
        metrics: buildMetricsPayload()
      } satisfies WorkerMetricsResponse)
      return
    }
    if (payload.type === 'cancel') {
      cancelledTasks.add(payload.taskId)
      activeControllers.get(payload.taskId)?.abort(new Error('FILE_SCAN_ABORTED'))
      for (const [key, resolve] of batchAckWaiters) {
        if (!key.startsWith(`${payload.taskId}:`)) continue
        batchAckWaiters.delete(key)
        resolve()
      }
      return
    }
    if (payload.type === 'batchAck') {
      const key = `${payload.taskId}:${String(payload.sequence)}`
      const resolve = batchAckWaiters.get(key)
      if (resolve) {
        batchAckWaiters.delete(key)
        resolve()
      }
      return
    }
    if (payload.type !== 'scan') {
      return
    }
    queue.push(payload)
    void processQueue()
  }
)
