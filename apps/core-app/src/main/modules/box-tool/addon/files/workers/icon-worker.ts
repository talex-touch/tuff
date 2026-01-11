import { parentPort } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'
import extractFileIcon from 'extract-file-icon'
import type { WorkerMetricsPayload, WorkerMetricsRequest, WorkerMetricsResponse } from './worker-status'

type IconRequest = {
  type: 'extract'
  taskId: string
  filePath: string
}

type IconResultMessage = {
  type: 'done'
  taskId: string
  buffer: Buffer | null
}

type IconErrorMessage = {
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

const queue: IconRequest[] = []
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

  try {
    const buffer = extractFileIcon(next.filePath)
    parentPort?.postMessage({
      type: 'done',
      taskId: next.taskId,
      buffer: buffer && buffer.length > 0 ? buffer : null,
    } satisfies IconResultMessage)
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      taskId: next.taskId,
      error: error instanceof Error ? error.message : String(error),
    } satisfies IconErrorMessage)
  } finally {
    running = false
    if (queue.length > 0) {
      void processQueue()
    }
  }
}

parentPort?.on('message', (payload: IconRequest | WorkerMetricsRequest) => {
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
  if (payload.type !== 'extract') {
    return
  }
  queue.push(payload)
  void processQueue()
})
