import type {
  WorkerMetricsPayload,
  WorkerMetricsRequest,
  WorkerMetricsResponse
} from './worker-status'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { parentPort } from 'node:worker_threads'
import { nativeImage } from 'electron'
import { THUMBNAIL_JPEG_QUALITY, THUMBNAIL_SIZE } from '../thumbnail-config'

interface ThumbnailRequest {
  type: 'thumbnail'
  taskId: string
  filePath: string
}

interface ThumbnailResultMessage {
  type: 'done'
  taskId: string
  thumbnail: string | null
}

interface ThumbnailErrorMessage {
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

function generateThumbnail(filePath: string): string | null {
  const img = nativeImage.createFromPath(filePath)
  if (img.isEmpty()) return null

  const size = img.getSize()
  if (size.width <= THUMBNAIL_SIZE && size.height <= THUMBNAIL_SIZE) {
    return null
  }

  const resized = img.resize({ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, quality: 'good' })
  const jpegBuffer = resized.toJPEG(THUMBNAIL_JPEG_QUALITY)
  if (jpegBuffer.length === 0) return null

  return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`
}

const queue: ThumbnailRequest[] = []
let running = false

async function processQueue(): Promise<void> {
  if (running) return
  const next = queue.shift()
  if (!next) return
  running = true

  try {
    const thumbnail = generateThumbnail(next.filePath)
    parentPort?.postMessage({
      type: 'done',
      taskId: next.taskId,
      thumbnail
    } satisfies ThumbnailResultMessage)
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      taskId: next.taskId,
      error: error instanceof Error ? error.message : String(error)
    } satisfies ThumbnailErrorMessage)
  } finally {
    running = false
    if (queue.length > 0) {
      void processQueue()
    }
  }
}

parentPort?.on('message', (payload: ThumbnailRequest | WorkerMetricsRequest) => {
  if (!payload) return
  if (payload.type === 'metrics') {
    parentPort?.postMessage({
      type: 'metrics',
      requestId: payload.requestId,
      metrics: buildMetricsPayload()
    } satisfies WorkerMetricsResponse)
    return
  }
  if (payload.type !== 'thumbnail') return
  queue.push(payload)
  void processQueue()
})
