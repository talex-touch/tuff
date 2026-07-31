import type { FileProviderWorkerStatusSnapshot } from '../box-tool/addon/files/services/file-provider-worker-status-service'

const SAFE_TOKEN_PATTERN = /^[\w.:-]{1,96}$/i
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function finiteOrZero(value: unknown): number {
  return finiteOrNull(value) ?? 0
}

function safeToken(value: unknown, fallback: string): string {
  return typeof value === 'string' && SAFE_TOKEN_PATTERN.test(value) ? value : fallback
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !ISO_TIMESTAMP_PATTERN.test(value)) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? value : null
}

export function projectFileIndexDashboardFileName(value: unknown): string {
  if (typeof value !== 'string') return ''
  const normalized = value.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).at(-1) ?? ''
}

export function projectFileIndexDashboardErrorCode(
  value: unknown,
  fallback = 'FILE_INDEX_ITEM_FAILED'
): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  return value.includes('SQLITE_BUSY') ? 'FILE_INDEX_DATABASE_BUSY' : fallback
}

export function projectFileIndexDashboardWorkerSnapshot(
  snapshot: FileProviderWorkerStatusSnapshot
) {
  const workers = snapshot.workers.map((worker) => ({
    name: safeToken(worker.name, 'file-index-worker'),
    threadId: finiteOrNull(worker.threadId),
    state: worker.state === 'idle' || worker.state === 'busy' ? worker.state : 'offline',
    pending: finiteOrZero(worker.pending),
    lastTask: worker.lastTask
      ? {
          id: safeToken(worker.lastTask.id, 'unknown-task'),
          startedAt: isoTimestamp(worker.lastTask.startedAt),
          finishedAt: isoTimestamp(worker.lastTask.finishedAt),
          durationMs: finiteOrNull(worker.lastTask.durationMs),
          errorCode: projectFileIndexDashboardErrorCode(
            worker.lastTask.error,
            'FILE_INDEX_WORKER_TASK_FAILED'
          )
        }
      : null,
    errorCode: projectFileIndexDashboardErrorCode(worker.lastError, 'FILE_INDEX_WORKER_FAILED'),
    uptimeMs: finiteOrNull(worker.uptimeMs),
    metrics: worker.metrics
      ? {
          capturedAt: finiteOrZero(worker.metrics.capturedAt),
          memory: {
            rss: finiteOrZero(worker.metrics.memory.rss),
            heapUsed: finiteOrZero(worker.metrics.memory.heapUsed),
            heapTotal: finiteOrZero(worker.metrics.memory.heapTotal),
            external: finiteOrZero(worker.metrics.memory.external),
            arrayBuffers: finiteOrZero(worker.metrics.memory.arrayBuffers)
          },
          cpu: {
            user: finiteOrZero(worker.metrics.cpu.user),
            system: finiteOrZero(worker.metrics.cpu.system),
            percent: finiteOrNull(worker.metrics.cpu.percent)
          },
          eventLoop: worker.metrics.eventLoop
            ? {
                active: finiteOrZero(worker.metrics.eventLoop.active),
                idle: finiteOrZero(worker.metrics.eventLoop.idle),
                utilization: finiteOrZero(worker.metrics.eventLoop.utilization)
              }
            : null
        }
      : null
  }))

  return {
    summary: {
      total: finiteOrZero(snapshot.summary.total),
      busy: finiteOrZero(snapshot.summary.busy),
      idle: finiteOrZero(snapshot.summary.idle),
      offline: finiteOrZero(snapshot.summary.offline)
    },
    workers
  }
}
