import type { Buffer } from 'node:buffer'
import type {
  WorkerMetricsPayload,
  WorkerMetricsRequest,
  WorkerMetricsResponse
} from './worker-status'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { parentPort } from 'node:worker_threads'
import {
  FILE_ICON_MAX_BYTES,
  readFileIconPngDimensions
} from '../../../../../service/file-icon-artifact'
import { getWorkerMemorySnapshot } from './worker-status'

type ExtractFileIcon = (filePath: string, size?: number) => Buffer | null

interface IconRequest {
  type: 'extract'
  taskId: string
  filePath: string
  outputPath: string
  size?: number
}

interface IconResultMessage {
  type: 'done'
  taskId: string
  path: string | null
}

interface IconErrorMessage {
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
    memory: getWorkerMemorySnapshot(memory),
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

const queue: IconRequest[] = []
let running = false
let extractFileIcon: ExtractFileIcon | null | undefined

async function loadExtractFileIcon(): Promise<ExtractFileIcon | null> {
  if (extractFileIcon !== undefined) {
    return extractFileIcon
  }

  try {
    // Runtime-selected: `extract-file-icon` is an optional native dependency that is absent on some
    // platforms, so a static import would fail the whole worker bundle instead of degrading.
    const loaded = await import('extract-file-icon')
    extractFileIcon = (loaded.default || loaded) as ExtractFileIcon
  } catch {
    extractFileIcon = null
  }

  return extractFileIcon
}

/**
 * Writes the extracted PNG to the caller-provided staging path atomically. Image bytes never leave
 * the worker: the parent only receives a path after the bounded bytes are already on disk.
 */
async function writeIconPngAtomically(outputPath: string, bytes: Uint8Array): Promise<void> {
  const temporaryPath = `${outputPath}.${process.pid}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporaryPath, bytes)
    await fs.rename(temporaryPath, outputPath)
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

async function extractIconToFile(request: IconRequest): Promise<string | null> {
  // AppKit extraction is main-thread-only; the IconService owns that path and never sends it here.
  if (process.platform === 'darwin') {
    return null
  }
  if (!request.outputPath || !path.isAbsolute(request.outputPath)) {
    return null
  }

  const extractor = await loadExtractFileIcon()
  if (!extractor) {
    return null
  }

  const buffer = extractor(request.filePath, request.size)
  if (!buffer || buffer.length === 0 || buffer.length > FILE_ICON_MAX_BYTES) {
    return null
  }
  if (!readFileIconPngDimensions(buffer)) {
    return null
  }

  await writeIconPngAtomically(request.outputPath, buffer)
  return request.outputPath
}

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
    const writtenPath = await extractIconToFile(next)
    parentPort?.postMessage({
      type: 'done',
      taskId: next.taskId,
      path: writtenPath
    } satisfies IconResultMessage)
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      taskId: next.taskId,
      error: error instanceof Error ? error.message : String(error)
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
      metrics: buildMetricsPayload()
    } satisfies WorkerMetricsResponse)
    return
  }
  if (payload.type !== 'extract') {
    return
  }
  queue.push(payload)
  void processQueue()
})
