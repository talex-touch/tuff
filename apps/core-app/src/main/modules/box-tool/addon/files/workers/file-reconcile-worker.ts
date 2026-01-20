import type {
  WorkerMetricsPayload,
  WorkerMetricsRequest,
  WorkerMetricsResponse
} from './worker-status'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { parentPort } from 'node:worker_threads'

interface ReconcileDiskFile {
  path: string
  name: string
  extension: string
  size: number
  mtime: number
  ctime: number
}

interface ReconcileDbFile {
  id: number
  path: string
  mtime: number
}

interface ReconcileRequest {
  type: 'reconcile'
  taskId: string
  diskFiles: ReconcileDiskFile[]
  dbFiles: ReconcileDbFile[]
  reconciliationPaths: string[]
}

interface ReconcileResult {
  filesToAdd: ReconcileDiskFile[]
  filesToUpdate: Array<ReconcileDiskFile & { id: number }>
  deletedIds: number[]
}

interface ReconcileDoneMessage {
  type: 'done'
  taskId: string
  result: ReconcileResult
}

interface ReconcileErrorMessage {
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

const queue: ReconcileRequest[] = []
let running = false

function matchesReconciliationPath(paths: string[], targetPath: string): boolean {
  for (const prefix of paths) {
    if (targetPath.startsWith(prefix)) {
      return true
    }
  }
  return false
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
    const dbMap = new Map<string, ReconcileDbFile>()
    for (const dbFile of next.dbFiles) {
      dbMap.set(dbFile.path, dbFile)
    }

    const filesToAdd: ReconcileDiskFile[] = []
    const filesToUpdate: Array<ReconcileDiskFile & { id: number }> = []
    const seenDiskPaths = new Set<string>()

    for (const diskFile of next.diskFiles) {
      if (seenDiskPaths.has(diskFile.path)) {
        continue
      }
      seenDiskPaths.add(diskFile.path)

      const dbFile = dbMap.get(diskFile.path)
      if (!dbFile) {
        filesToAdd.push(diskFile)
      } else if (diskFile.mtime > dbFile.mtime) {
        filesToUpdate.push({ ...diskFile, id: dbFile.id })
      }
      dbMap.delete(diskFile.path)
    }

    const deletedIds: number[] = []
    if (next.reconciliationPaths.length > 0) {
      for (const [path, dbFile] of dbMap.entries()) {
        if (matchesReconciliationPath(next.reconciliationPaths, path)) {
          deletedIds.push(dbFile.id)
        }
      }
    }

    parentPort?.postMessage({
      type: 'done',
      taskId: next.taskId,
      result: { filesToAdd, filesToUpdate, deletedIds }
    } satisfies ReconcileDoneMessage)
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      taskId: next.taskId,
      error: error instanceof Error ? error.message : String(error)
    } satisfies ReconcileErrorMessage)
  } finally {
    running = false
    if (queue.length > 0) {
      void processQueue()
    }
  }
}

parentPort?.on('message', (payload: ReconcileRequest | WorkerMetricsRequest) => {
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
  if (payload.type !== 'reconcile') {
    return
  }
  queue.push(payload)
  void processQueue()
})
