import type { FileScanOptions, ScannedFileInfo } from '@talex-touch/utils/common/file-scan-utils'
import { parentPort } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'
import { scanDirectory } from '@talex-touch/utils/common/file-scan-utils'
import type { WorkerMetricsPayload, WorkerMetricsRequest, WorkerMetricsResponse } from './worker-status'

type FileScanRequest = {
  type: 'scan'
  taskId: string
  paths: string[]
  excludePaths?: string[]
  options?: FileScanOptions
  batchSize?: number
}

type FileScanBatchMessage = {
  type: 'batch'
  taskId: string
  batch: ScannedFileInfo[]
}

type FileScanDoneMessage = {
  type: 'done'
  taskId: string
  scannedCount: number
}

type FileScanErrorMessage = {
  type: 'error'
  taskId: string
  error: string
}

function buildMetricsPayload(): WorkerMetricsPayload {
  const memory = process.memoryUsage()
  const eventLoop = typeof performance.eventLoopUtilization === 'function'
    ? performance.eventLoopUtilization()
    : null
  return {
    timestamp: Date.now(),
    memory: {
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers ?? 0,
    },
    cpuUsage: process.cpuUsage(),
    eventLoop: eventLoop
      ? {
          active: eventLoop.active,
          idle: eventLoop.idle,
          utilization: eventLoop.utilization,
        }
      : null,
  }
}

const queue: FileScanRequest[] = []
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

  const excludePathsSet = next.excludePaths ? new Set(next.excludePaths) : undefined
  const batchSize = Math.max(1, Number(next.batchSize ?? 500))
  let scannedCount = 0

  try {
    for (const path of next.paths) {
      const files = await scanDirectory(path, next.options, excludePathsSet)
      scannedCount += files.length

      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize)
        parentPort?.postMessage({
          type: 'batch',
          taskId: next.taskId,
          batch,
        } satisfies FileScanBatchMessage)
      }
    }

    parentPort?.postMessage({
      type: 'done',
      taskId: next.taskId,
      scannedCount,
    } satisfies FileScanDoneMessage)
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      taskId: next.taskId,
      error: error instanceof Error ? error.message : String(error),
    } satisfies FileScanErrorMessage)
  } finally {
    running = false
    if (queue.length > 0) {
      void processQueue()
    }
  }
}

parentPort?.on('message', (payload: FileScanRequest | WorkerMetricsRequest) => {
  if (!payload) {
    return
  }
  if (payload.type === 'metrics') {
    parentPort?.postMessage({
      type: 'metrics',
      requestId: payload.requestId,
      metrics: buildMetricsPayload(),
    } satisfies WorkerMetricsResponse)
    return
  }
  if (payload.type !== 'scan') {
    return
  }
  queue.push(payload)
  void processQueue()
})
