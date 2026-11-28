import type { Client } from '@libsql/client'
import type { getLogger } from '@talex-touch/utils/common/logger'
import fs from 'node:fs/promises'
import process from 'node:process'
import { pollingService } from '@talex-touch/utils/common/utils/polling'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import { getSqliteBusyRetryCount } from '../../db/sqlite-retry'
import { operationalErrorService } from '../observability'
import {
  getDatabaseWalSearchIndexWriterPort,
  type DatabaseWalSearchIndexWriterPort,
  type DatabaseWalSearchIndexWriterStatus
} from './database-ports'

export const DB_WAL_PASSIVE_TASK_ID = 'database_wal_checkpoint_passive'
export const DB_WAL_TRUNCATE_TASK_ID = 'database_wal_checkpoint_truncate'
export const DB_HEALTH_REPORT_TASK_ID = 'database_health_report'
export const DB_WAL_PASSIVE_INTERVAL_MS = 5 * 60 * 1000
export const DB_WAL_TRUNCATE_INTERVAL_MS = 30 * 60 * 1000
export const DB_HEALTH_REPORT_INTERVAL_MS = 10 * 60 * 1000
export const DB_WAL_TRUNCATE_MAX_QUEUED_WRITES = 2
export const DB_WAL_TRUNCATE_MIN_BYTES = 16 * 1024 * 1024
export const DB_WAL_CHECKPOINT_MAX_QUEUE_WAIT_MS = 5_000
export const DB_WAL_CHECKPOINT_SKIPPED_BUSY = 'DB_WAL_CHECKPOINT_SKIPPED_BUSY'
export const WAL_WARN_THRESHOLD_BYTES = 512 * 1024 * 1024
export const DB_BUSY_RETRY_WARN_DELTA = 10
export const DB_SCHEDULER_BUSY_FAILURE_WARN_DELTA = 3
export const DB_SCHEDULER_QUEUE_WARN_THRESHOLD = 20
export const DB_WRITER_PENDING_WARN_THRESHOLD = 20
export const DB_OPEN_FD_WARN_THRESHOLD = 256
export const DB_WAL_INCREMENTAL_VACUUM_MAX_PAGES = 256
export const DB_WAL_INCREMENTAL_VACUUM_MIN_FREELIST_PAGES = 256

export type WalCheckpointMode = 'PASSIVE' | 'TRUNCATE'

export interface DbSchedulerBusyReason {
  reason: 'db-write-scheduler'
  queued: number
  processing: boolean
  currentTaskLabel?: string
}

export type IncrementalVacuumClient = Pick<Client, 'execute'> &
  Partial<Pick<Client, 'executeMultiple'>>

let cachedFdDirPath: string | null = null

export function parseSqliteCount(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'bigint') return Number(raw)
  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

export async function readWalFileSizeBytes(mainDbPath: string): Promise<number> {
  if (!mainDbPath) return 0
  try {
    const stat = await fs.stat(`${mainDbPath}-wal`)
    return stat.size
  } catch {
    return 0
  }
}

/**
 * Counts open file descriptors using the platform's native fd directory first
 * (avoiding an extra `/proc/self/fd` ENOENT syscall on macOS) and caches it.
 */
export async function readOpenFdCount(): Promise<number | null> {
  if (cachedFdDirPath) {
    try {
      return (await fs.readdir(cachedFdDirPath)).length
    } catch {
      cachedFdDirPath = null
    }
  }

  const candidates =
    process.platform === 'darwin' ? ['/dev/fd', '/proc/self/fd'] : ['/proc/self/fd', '/dev/fd']

  for (const candidate of candidates) {
    try {
      const entries = await fs.readdir(candidate)
      cachedFdDirPath = candidate
      return entries.length
    } catch {
      // Try next candidate.
    }
  }
  return null
}

export function parseWalCheckpointRow(row: unknown): {
  busy: number
  log: number
  checkpointed: number
} {
  if (!row || typeof row !== 'object') {
    return { busy: 0, log: 0, checkpointed: 0 }
  }
  const record = row as Record<string, unknown>
  return {
    busy: parseSqliteCount(record.busy ?? record[0]),
    log: parseSqliteCount(record.log ?? record[1]),
    checkpointed: parseSqliteCount(record.checkpointed ?? record[2])
  }
}

async function readPragmaScalar(
  client: Pick<Client, 'execute'>,
  pragma: string,
  column: string
): Promise<number> {
  const result = await client.execute(`PRAGMA ${pragma}`)
  const row = result.rows?.[0] as Record<string, unknown> | undefined
  if (!row) return 0
  return parseSqliteCount(row[column] ?? row[0])
}

/**
 * Reclaims up to `maxPages` free pages from an `INCREMENTAL` (`auto_vacuum = 2`)
 * SQLite database via `executeMultiple` (required by libSQL to avoid `SQLITE_LOCKED`).
 * Caller must already hold the single-writer lane for `client`.
 */
export async function reclaimIncrementalVacuumPages(
  client: IncrementalVacuumClient | null | undefined,
  maxPages: number = DB_WAL_INCREMENTAL_VACUUM_MAX_PAGES,
  minFreelistPages: number = DB_WAL_INCREMENTAL_VACUUM_MIN_FREELIST_PAGES
): Promise<number> {
  const safeMaxPages = Math.floor(maxPages)
  if (!client || safeMaxPages <= 0 || typeof client.executeMultiple !== 'function') {
    return 0
  }

  const autoVacuum = await readPragmaScalar(client, 'auto_vacuum', 'auto_vacuum')
  if (autoVacuum !== 2) {
    return 0
  }

  const freelistPages = await readPragmaScalar(client, 'freelist_count', 'freelist_count')
  const requiredMin = Math.max(1, Math.floor(minFreelistPages))
  if (freelistPages < requiredMin) {
    return 0
  }

  const pagesToReclaim = Math.min(freelistPages, safeMaxPages)
  await client.executeMultiple(`PRAGMA incremental_vacuum(${pagesToReclaim});`)
  return pagesToReclaim
}

const DEFAULT_UNREGISTERED_WRITER_STATUS: DatabaseWalSearchIndexWriterStatus = {
  readiness: 'pending',
  admissionPaused: false,
  activeAdmissions: 0,
  pending: 0
}

export interface DatabaseWalMaintenanceDeps {
  getClient: () => Client | null
  getWalSizeBytes: () => Promise<number>
  getOpenFdCount: () => Promise<number | null>
  runWalCheckpoint: (mode: WalCheckpointMode) => Promise<void>
  reportDatabaseHealth: (source: 'periodic' | 'threshold') => Promise<void>
  getSearchIndexWriter?: () => DatabaseWalSearchIndexWriterPort | null
  log: ReturnType<typeof getLogger>
}

/**
 * Encapsulates periodic WAL checkpointing, bounded incremental freelist reclamation,
 * and contention/health telemetry for `DatabaseModule`.
 */
export class DatabaseWalMaintenance {
  private walPeakBytes = 0
  private schedulerQueuePeak = 0
  private lastHealthBusyRetryCount = 0
  private lastHealthSchedulerBusyFailures = 0

  constructor(private readonly deps: DatabaseWalMaintenanceDeps) {}

  resetHealthBaselines(): void {
    this.lastHealthBusyRetryCount = getSqliteBusyRetryCount()
    this.lastHealthSchedulerBusyFailures = dbWriteScheduler.getDetailedStats().busyFailures
  }

  getDbSchedulerBusyReason(): DbSchedulerBusyReason | null {
    const stats = dbWriteScheduler.getStats()
    this.schedulerQueuePeak = Math.max(this.schedulerQueuePeak, stats.queued)
    // WAL checkpoints run against the PRIMARY file (database.db), so the busy
    // gate consults the primary lane only: an aux-lane backlog writes a
    // different file and must not skip a primary-file checkpoint (lane split,
    // design D3/FR4).
    const primaryLane = stats.lanes.primary
    if (primaryLane.queued > 0 || primaryLane.processing) {
      return {
        reason: 'db-write-scheduler',
        queued: primaryLane.queued,
        processing: primaryLane.processing,
        currentTaskLabel: primaryLane.currentTaskLabel ?? undefined
      }
    }
    return null
  }

  private logWalCheckpointSkippedBusy(mode: WalCheckpointMode, busy: DbSchedulerBusyReason): void {
    this.deps.log.info(DB_WAL_CHECKPOINT_SKIPPED_BUSY, {
      meta: {
        mode,
        reason: busy.reason,
        busyQueueDepth: busy.queued,
        busyProcessing: busy.processing,
        currentTaskLabel: busy.currentTaskLabel
      }
    })
  }

  private getSearchIndexWriterPort(): DatabaseWalSearchIndexWriterPort | null {
    return (this.deps.getSearchIndexWriter ?? getDatabaseWalSearchIndexWriterPort)()
  }

  private getSearchIndexWriterStatus(): DatabaseWalSearchIndexWriterStatus {
    return this.getSearchIndexWriterPort()?.getStatus() ?? DEFAULT_UNREGISTERED_WRITER_STATUS
  }

  private isSearchIndexWriterPausedAndDrained(status: DatabaseWalSearchIndexWriterStatus): boolean {
    return status.admissionPaused && status.activeAdmissions === 0 && status.pending === 0
  }

  private logWalCheckpointSkippedWriter(
    mode: WalCheckpointMode,
    reason: 'search-index-writer-drain-timeout' | 'search-index-writer-not-quiescent',
    status: DatabaseWalSearchIndexWriterStatus
  ): void {
    this.deps.log.info(DB_WAL_CHECKPOINT_SKIPPED_BUSY, {
      meta: {
        mode,
        reason,
        busyQueueDepth: status.pending,
        busyProcessing: status.activeAdmissions > 0,
        admissionPaused: status.admissionPaused
      }
    })
  }

  private async executeScheduledWalCheckpoint(
    mode: WalCheckpointMode,
    writer: DatabaseWalSearchIndexWriterPort | null
  ): Promise<void> {
    await dbWriteScheduler.schedule(
      `database.wal-checkpoint.${mode.toLowerCase()}`,
      async () => {
        if (writer) {
          const statusBeforeExecute = writer.getStatus()
          if (!this.isSearchIndexWriterPausedAndDrained(statusBeforeExecute)) {
            this.logWalCheckpointSkippedWriter(
              mode,
              'search-index-writer-not-quiescent',
              statusBeforeExecute
            )
            return
          }
        }

        const activeClient = this.deps.getClient()
        if (!activeClient) return

        const checkpointStart = Date.now()
        this.deps.log.debug('DB_WAL_CHECKPOINT_START', {
          meta: { mode }
        })

        let reclaimedFreePages = 0
        if (mode === 'TRUNCATE') {
          // Reclaim incremental free pages before truncating WAL so freed-page
          // moves are checkpointed and truncated right away instead of idling in `-wal`.
          try {
            reclaimedFreePages = await reclaimIncrementalVacuumPages(
              activeClient,
              DB_WAL_INCREMENTAL_VACUUM_MAX_PAGES,
              DB_WAL_INCREMENTAL_VACUUM_MIN_FREELIST_PAGES
            )
          } catch (vacuumError) {
            this.deps.log.debug('Bounded incremental_vacuum skipped before WAL TRUNCATE', {
              error: vacuumError
            })
          }
        }

        const result = await activeClient.execute(`PRAGMA wal_checkpoint(${mode})`)
        const parsed = parseWalCheckpointRow(result.rows?.[0])
        const walSize = await this.deps.getWalSizeBytes()
        this.walPeakBytes = Math.max(this.walPeakBytes, walSize)

        this.deps.log.info(`WAL checkpoint ${mode} complete`, {
          meta: {
            mode,
            busy: parsed.busy,
            logFrames: parsed.log,
            checkpointedFrames: parsed.checkpointed,
            walSizeBytes: walSize,
            walPeakBytes: this.walPeakBytes,
            durationMs: Date.now() - checkpointStart,
            schedulerQueuePeak: this.schedulerQueuePeak,
            ...(reclaimedFreePages > 0 ? { reclaimedFreePages } : {})
          }
        })
      },
      {
        priority: 'best_effort',
        dropPolicy: 'drop',
        maxQueueWaitMs: DB_WAL_CHECKPOINT_MAX_QUEUE_WAIT_MS
      }
    )
  }

  async runWalCheckpoint(mode: WalCheckpointMode): Promise<void> {
    const client = this.deps.getClient()
    if (!client) return

    const busyBeforeSchedule = this.getDbSchedulerBusyReason()
    if (busyBeforeSchedule) {
      this.logWalCheckpointSkippedBusy(mode, busyBeforeSchedule)
      return
    }

    const writer = this.getSearchIndexWriterPort()
    try {
      if (!writer) {
        await this.executeScheduledWalCheckpoint(mode, null)
        return
      }

      await writer.withPausedAdmission(
        `database.wal-checkpoint.${mode.toLowerCase()}`,
        async (pausedStatus) => {
          if (!this.isSearchIndexWriterPausedAndDrained(pausedStatus)) {
            this.logWalCheckpointSkippedWriter(
              mode,
              'search-index-writer-not-quiescent',
              pausedStatus
            )
            return
          }

          await this.executeScheduledWalCheckpoint(mode, writer)
        },
        DB_WAL_CHECKPOINT_MAX_QUEUE_WAIT_MS
      )
    } catch (error) {
      if (
        writer &&
        error instanceof Error &&
        (error.message === 'SEARCH_INDEX_WRITER_DRAIN_TIMEOUT' ||
          error.message === 'SEARCH_INDEX_WRITER_ADMISSION_DRAIN_TIMEOUT')
      ) {
        this.logWalCheckpointSkippedWriter(
          mode,
          'search-index-writer-drain-timeout',
          writer.getStatus()
        )
        return
      }
      this.deps.log.warn(`WAL checkpoint ${mode} failed`, { error })
    }
  }

  async reportDatabaseHealth(source: 'periodic' | 'threshold'): Promise<void> {
    const scheduler = dbWriteScheduler.getDetailedStats()
    this.schedulerQueuePeak = Math.max(this.schedulerQueuePeak, scheduler.queued)
    const writer = this.getSearchIndexWriterStatus()

    const [walSizeBytes, openFdCount] = await Promise.all([
      this.deps.getWalSizeBytes(),
      this.deps.getOpenFdCount()
    ])
    this.walPeakBytes = Math.max(this.walPeakBytes, walSizeBytes)

    const busyRetryCount = getSqliteBusyRetryCount()
    const busyRetryDelta = Math.max(0, busyRetryCount - this.lastHealthBusyRetryCount)
    this.lastHealthBusyRetryCount = busyRetryCount
    const schedulerBusyFailureDelta = Math.max(
      0,
      scheduler.busyFailures - this.lastHealthSchedulerBusyFailures
    )
    this.lastHealthSchedulerBusyFailures = scheduler.busyFailures
    const unhealthy =
      walSizeBytes >= WAL_WARN_THRESHOLD_BYTES ||
      busyRetryDelta >= DB_BUSY_RETRY_WARN_DELTA ||
      schedulerBusyFailureDelta >= DB_SCHEDULER_BUSY_FAILURE_WARN_DELTA ||
      scheduler.queued >= DB_SCHEDULER_QUEUE_WARN_THRESHOLD ||
      writer.pending >= DB_WRITER_PENDING_WARN_THRESHOLD ||
      (openFdCount !== null && openFdCount >= DB_OPEN_FD_WARN_THRESHOLD)
    const payload = {
      source,
      walSizeBytes,
      walPeakBytes: this.walPeakBytes,
      busyRetryCount,
      busyRetryDelta,
      schedulerBusyFailureDelta,
      // Aggregate depth (sum across lanes) keeps the snapshot shape; per-lane
      // depths locate which FILE a backlog belongs to (lane split).
      schedulerQueueDepth: scheduler.queued,
      schedulerQueueDepthPrimary: scheduler.lanes.primary.queued,
      schedulerQueueDepthAux: scheduler.lanes.aux.queued,
      schedulerQueuePeak: this.schedulerQueuePeak,
      writerPending: writer.pending,
      writerActive: writer.activeAdmissions,
      writerAdmissionPaused: writer.admissionPaused,
      openFdCount: openFdCount ?? undefined
    }
    this.schedulerQueuePeak = scheduler.queued
    this.walPeakBytes = walSizeBytes

    if (!unhealthy) {
      this.deps.log.info('Database health snapshot', { meta: payload })
      return
    }

    this.deps.log.warn('Database health snapshot exceeded contention threshold', { meta: payload })
    operationalErrorService.report({
      domain: 'database',
      operation: 'health-window',
      error: new Error('DATABASE_CONTENTION_THRESHOLD_EXCEEDED'),
      code: 'DATABASE_CONTENTION',
      severity: 'warning',
      retryable: true,
      userImpact: 'degraded',
      captureDetail: false,
      dedupeWindowMs: DB_HEALTH_REPORT_INTERVAL_MS,
      context: payload
    })
  }

  registerTasks(): void {
    pollingService.register(
      DB_WAL_PASSIVE_TASK_ID,
      async () => {
        await this.deps.runWalCheckpoint('PASSIVE')
      },
      {
        interval: DB_WAL_PASSIVE_INTERVAL_MS,
        unit: 'milliseconds',
        lane: 'maintenance',
        backpressure: 'coalesce',
        dedupeKey: DB_WAL_PASSIVE_TASK_ID,
        maxInFlight: 1
      }
    )

    pollingService.register(
      DB_WAL_TRUNCATE_TASK_ID,
      async () => {
        const stats = dbWriteScheduler.getStats()
        this.schedulerQueuePeak = Math.max(this.schedulerQueuePeak, stats.queued)
        // Primary-lane depth only: TRUNCATE checkpoints the primary file, and
        // an aux-lane backlog must not defer it (lane split, design D3/FR4).
        const primaryQueueDepth = stats.lanes.primary.queued
        if (primaryQueueDepth > DB_WAL_TRUNCATE_MAX_QUEUED_WRITES) {
          this.deps.log.info('Skipping WAL TRUNCATE checkpoint due to active write backlog', {
            meta: { schedulerQueueDepth: primaryQueueDepth }
          })
          return
        }
        const walSize = await this.deps.getWalSizeBytes()
        if (walSize < DB_WAL_TRUNCATE_MIN_BYTES) {
          this.deps.log.debug('Skipping WAL TRUNCATE checkpoint because WAL is below threshold', {
            meta: { walSizeBytes: walSize, minBytes: DB_WAL_TRUNCATE_MIN_BYTES }
          })
          return
        }
        await this.deps.runWalCheckpoint('TRUNCATE')
      },
      {
        interval: DB_WAL_TRUNCATE_INTERVAL_MS,
        unit: 'milliseconds',
        lane: 'maintenance',
        backpressure: 'latest_wins',
        dedupeKey: DB_WAL_TRUNCATE_TASK_ID,
        maxInFlight: 1
      }
    )

    pollingService.register(
      DB_HEALTH_REPORT_TASK_ID,
      async () => {
        await this.deps.reportDatabaseHealth('periodic')
      },
      {
        interval: DB_HEALTH_REPORT_INTERVAL_MS,
        unit: 'milliseconds',
        lane: 'maintenance',
        backpressure: 'coalesce',
        dedupeKey: DB_HEALTH_REPORT_TASK_ID,
        maxInFlight: 1
      }
    )
  }

  unregisterTasks(): void {
    pollingService.unregister(DB_WAL_PASSIVE_TASK_ID)
    pollingService.unregister(DB_WAL_TRUNCATE_TASK_ID)
    pollingService.unregister(DB_HEALTH_REPORT_TASK_ID)
  }
}
