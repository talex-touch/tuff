import type { Client } from '@libsql/client'
import type { ModuleInitContext, ModuleKey, TimingLogLevel } from '@talex-touch/utils'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { createTiming } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { pollingService } from '@talex-touch/utils/common/utils/polling'
import chalk from 'chalk'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { app, BrowserWindow, dialog } from 'electron'
import fse from 'fs-extra'
import migrationsLocator from '../../../../resources/db/locator.json?commonjs-external&asset'
import * as schema from '../../db/schema'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import { DB_AUX_ENABLED } from '../../db/runtime-flags'
import {
  getSqliteBusyRetryCount,
  isSqliteCorruptionError,
  setSqliteRetryExhaustedListener
} from '../../db/sqlite-retry'
import { BaseModule } from '../abstract-base-module'
import { operationalErrorService } from '../observability'
import { searchIndexWriter } from '../box-tool/search-engine/search-index-writer'
import {
  planScanProgressSourceScopeMigration,
  runScanProgressSourceScopeMigration
} from '../box-tool/search-engine/scan-progress-schema'

const dbLog = getLogger('database')
const AUX_MIGRATION_MARKER_KEY = 'db.aux.migration.v1.complete'
const DB_WAL_PASSIVE_TASK_ID = 'database_wal_checkpoint_passive'
const DB_WAL_TRUNCATE_TASK_ID = 'database_wal_checkpoint_truncate'
const DB_HEALTH_REPORT_TASK_ID = 'database_health_report'
const DB_WAL_PASSIVE_INTERVAL_MS = 5 * 60 * 1000
const DB_WAL_TRUNCATE_INTERVAL_MS = 30 * 60 * 1000
const DB_HEALTH_REPORT_INTERVAL_MS = 10 * 60 * 1000
const DB_WAL_TRUNCATE_MAX_QUEUED_WRITES = 2
const DB_WAL_CHECKPOINT_MAX_QUEUE_WAIT_MS = 5_000
const DB_WAL_CHECKPOINT_SKIPPED_BUSY = 'DB_WAL_CHECKPOINT_SKIPPED_BUSY'
const WAL_WARN_THRESHOLD_BYTES = 512 * 1024 * 1024
const DB_BUSY_RETRY_WARN_DELTA = 10
const DB_SCHEDULER_BUSY_FAILURE_WARN_DELTA = 3
const DB_SCHEDULER_QUEUE_WARN_THRESHOLD = 20
const DB_WRITER_PENDING_WARN_THRESHOLD = 20
const DB_OPEN_FD_WARN_THRESHOLD = 256
const AUX_COPY_TABLES = [
  'analytics_snapshots',
  'plugin_analytics',
  'analytics_report_queue',
  'telemetry_upload_stats',
  'recommendation_cache',
  'clipboard_history',
  'clipboard_history_meta',
  'ocr_jobs',
  'ocr_results',
  'config'
] as const

export class DatabaseModule extends BaseModule {
  private db: LibSQLDatabase<typeof schema> | null = null
  private client: Client | null = null
  private auxDb: LibSQLDatabase<typeof schema> | null = null
  private auxClient: Client | null = null
  private auxInitialized = false
  private mainDbPath = ''
  private auxDbPath = ''
  private dbRunningMarkerPath = ''
  private probeDbIntegrity = false
  private walMaintenanceRegistered = false
  private backgroundStartupPromise: Promise<void> | null = null
  private destroying = false
  private walPeakBytes = 0
  private schedulerQueuePeak = 0
  private lastHealthBusyRetryCount = 0
  private lastHealthSchedulerBusyFailures = 0
  private disposeRetryExhaustedListener: (() => void) | null = null

  static key: symbol = Symbol.for('Database')
  name: ModuleKey = DatabaseModule.key

  constructor() {
    super(DatabaseModule.key, {
      create: true,
      dirName: 'database'
    })
  }

  public getClient(): Client | null {
    return this.client
  }

  public getAuxClient(): Client | null {
    return this.auxClient
  }

  public isAuxEnabled(): boolean {
    return DB_AUX_ENABLED
  }

  public isAuxReady(): boolean {
    return this.auxInitialized && !!this.auxDb
  }

  public getAuxDb(): LibSQLDatabase<typeof schema> {
    if (this.auxDb) {
      return this.auxDb
    }
    return this.getDb()
  }

  private async showDatabaseErrorDialog(error: Error, details?: string): Promise<void> {
    const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]

    await dialog.showMessageBox(window || undefined, {
      type: 'error',
      title: 'Database Initialization Failed',
      message: 'Database migration failed, application cannot start',
      detail: details || error.message || 'Unknown error',
      buttons: ['OK'],
      defaultId: 0,
      noLink: true
    })
  }

  private resolveMigrationsFolder(): string {
    if (app.isPackaged) {
      const appPath = app.getAppPath()
      const migrationsPath = path.resolve(appPath, 'resources', 'db', 'migrations')

      dbLog.debug('Resolving migrations folder', {
        meta: { appPath, __dirname, resourcesPath: process.resourcesPath || 'N/A' }
      })
      dbLog.debug(`Primary path: ${migrationsPath}, exists: ${fse.existsSync(migrationsPath)}`)

      // First check the expected path
      if (fse.existsSync(migrationsPath)) {
        const metaJournalPath = path.resolve(migrationsPath, 'meta', '_journal.json')
        if (fse.existsSync(metaJournalPath)) {
          dbLog.info(`Using primary migrations path: ${migrationsPath}`)
          return migrationsPath
        }
      }

      // Try alternative paths
      const alternativePaths = [
        // Alternative 1: relative to main directory
        path.resolve(
          path.dirname(__dirname || path.join(appPath, 'main')),
          '..',
          'resources',
          'db',
          'migrations'
        ),
        // Alternative 2: relative to appPath
        path.resolve(appPath, '..', 'resources', 'db', 'migrations'),
        // Alternative 3: process.resourcesPath (Electron specific)
        ...(process.resourcesPath
          ? [
              path.resolve(process.resourcesPath, 'app', 'resources', 'db', 'migrations'),
              path.resolve(process.resourcesPath, 'resources', 'db', 'migrations')
            ]
          : []),
        // Alternative 4: macOS-specific paths
        ...(process.platform === 'darwin'
          ? [
              path.resolve(
                appPath,
                '..',
                '..',
                '..',
                'Resources',
                'app',
                'resources',
                'db',
                'migrations'
              ),
              path.resolve(__dirname, '..', '..', '..', 'resources', 'db', 'migrations')
            ]
          : [])
      ]

      dbLog.debug(`Trying ${alternativePaths.length} alternative paths`)
      for (let i = 0; i < alternativePaths.length; i++) {
        const altPath = alternativePaths[i]
        if (fse.existsSync(altPath)) {
          const metaJournalPath = path.resolve(altPath, 'meta', '_journal.json')
          if (fse.existsSync(metaJournalPath)) {
            dbLog.info(`Using alternative migrations path: ${altPath}`)
            return altPath
          }
        }
      }

      dbLog.error(`No valid migrations path found, returning primary: ${migrationsPath}`)
      return migrationsPath
    } else {
      const dbFolder = path.dirname(migrationsLocator)
      return path.resolve(dbFolder, 'migrations')
    }
  }

  private async configureSqliteClient(client: Client, label: 'primary' | 'aux'): Promise<void> {
    const journalModeResult = await client.execute('PRAGMA journal_mode = WAL')
    const journalMode = String(
      (journalModeResult.rows?.[0] as Record<string, unknown> | undefined)?.journal_mode ?? ''
    ).toLowerCase()
    if (journalMode !== 'wal') {
      // The search-index worker opens a second connection to this same file.
      // Two connections in different journal modes is a direct corruption path,
      // so surface a failure to enter WAL loudly instead of writing regardless.
      dbLog.error(`SQLite ${label} did not enter WAL mode`, { meta: { journalMode } })
      operationalErrorService.report({
        domain: 'database',
        operation: `journal-mode.${label}`,
        error: new Error(`journal_mode is '${journalMode}', expected 'wal'`),
        code: 'DATABASE_JOURNAL_MODE',
        severity: 'warning',
        retryable: false,
        userImpact: 'degraded'
      })
    }
    // Enforce declared foreign keys. SQLite defaults this OFF per-connection,
    // which silently disabled every onDelete: 'cascade' in the schema.
    await client.execute('PRAGMA foreign_keys = ON')
    await client.execute('PRAGMA busy_timeout = 30000')
    await client.execute('PRAGMA synchronous = NORMAL')
    await client.execute('PRAGMA locking_mode = NORMAL')
    await client.execute('PRAGMA mmap_size = 268435456')
    dbLog.info(`SQLite ${label} configured: WAL mode enabled, busy_timeout=30s`)
  }

  /**
   * Probe a freshly-opened database for on-disk corruption via `PRAGMA
   * quick_check`. Returns true when the file is corrupt (or a badly damaged
   * header throws SQLITE_CORRUPT / SQLITE_NOTADB instead of returning rows).
   * Non-corruption failures (locked / IO / permissions) return false so we
   * never destroy a database we merely failed to read.
   */
  private async detectDatabaseCorruption(client: Client): Promise<boolean> {
    try {
      const result = await client.execute('PRAGMA quick_check(1)')
      const row = result.rows?.[0] as Record<string, unknown> | undefined
      const verdict = row
        ? String(row.quick_check ?? row[0] ?? '')
            .trim()
            .toLowerCase()
        : ''
      // A healthy database returns a single 'ok' row. If we can't read a verdict
      // at all (empty/unexpected result), default to NOT corrupt — never destroy
      // a database we merely failed to probe (mirrors the non-corruption catch).
      if (!verdict) {
        dbLog.warn('Database integrity probe returned no verdict; treating as healthy')
        return false
      }
      return verdict !== 'ok'
    } catch (error) {
      if (isSqliteCorruptionError(error)) return true
      dbLog.warn('Database integrity probe failed (non-corruption)', { error })
      return false
    }
  }

  /**
   * Move the corrupt database file (and its WAL/SHM/journal sidecars) aside so a
   * clean file can be recreated. Exactly one quarantined copy is kept per file
   * (fixed `.corrupt` suffix, overwritten) so a repeatedly-corrupt database can
   * never fill the disk; the copy still lets support inspect the damage.
   */
  private async quarantineCorruptDatabaseFiles(dbPath: string): Promise<void> {
    const targets = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`]
    for (const target of targets) {
      try {
        if (!fse.existsSync(target)) continue
        const quarantinePath = `${target}.corrupt`
        await fs.rm(quarantinePath, { force: true })
        await fs.rename(target, quarantinePath)
        dbLog.warn('Quarantined corrupt database file', {
          meta: { from: target, to: quarantinePath }
        })
      } catch (error) {
        // Rename can fail across devices or on locked files; delete as a last
        // resort so a clean database can still be created on this launch.
        try {
          await fs.rm(target, { force: true })
          dbLog.warn('Removed corrupt database file (quarantine failed)', {
            meta: { target },
            error
          })
        } catch (removeError) {
          dbLog.error('Failed to quarantine or remove corrupt database file', {
            meta: { target },
            error: removeError
          })
        }
      }
    }
  }

  /**
   * Detect and auto-recover from on-disk corruption before migrations run.
   * DatabaseModule is the first module loaded, so no other connection (incl. the
   * search-index worker) is open yet — quarantining the files here is safe. On
   * corruption the damaged files are moved aside and a fresh, empty database is
   * opened; the caller then rebuilds the schema (migrations / ensure* tables)
   * and providers re-index their data on the next scan. Returns true when the
   * database was rebuilt.
   */
  private async ensureDatabaseIntegrity(
    dbPath: string,
    label: 'primary' | 'aux',
    shouldProbe: boolean
  ): Promise<boolean> {
    const client = label === 'primary' ? this.client : this.auxClient
    if (!client) return false

    // `quick_check` reads every page of the file, so only probe when the previous
    // run did not shut down cleanly (a crash/kill mid-write is what leaves real
    // corruption). A clean prior shutdown skips the full-file scan on boot.
    if (!shouldProbe) return false

    if (!(await this.detectDatabaseCorruption(client))) return false

    operationalErrorService.report({
      domain: 'database',
      operation: `integrity.${label}`,
      error: new Error(`Corrupt ${label} SQLite database detected at ${dbPath}`),
      code: 'DATABASE_CORRUPT',
      severity: 'error',
      retryable: false,
      userImpact: 'degraded'
    })
    dbLog.error(`Corrupt ${label} database detected; quarantining and rebuilding`, {
      meta: { dbPath }
    })

    try {
      client.close()
    } catch {
      // The handle is already unusable; ignore close failures.
    }

    await this.quarantineCorruptDatabaseFiles(dbPath)

    const freshClient = createClient({ url: `file:${dbPath}` })
    await this.configureSqliteClient(freshClient, label)
    if (label === 'primary') {
      this.client = freshClient
      this.db = drizzle(freshClient, { schema })
    } else {
      this.auxClient = freshClient
    }
    dbLog.warn(`Rebuilt empty ${label} database after corruption`, { meta: { dbPath } })
    return true
  }

  private escapeSqlPath(filePath: string): string {
    return filePath.replace(/'/g, "''")
  }

  private parseCount(raw: unknown): number {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    if (typeof raw === 'bigint') return Number(raw)
    if (typeof raw === 'string') {
      const parsed = Number.parseInt(raw, 10)
      if (Number.isFinite(parsed)) return parsed
    }
    return 0
  }

  private async getWalSizeBytes(): Promise<number> {
    if (!this.mainDbPath) return 0
    try {
      const walPath = `${this.mainDbPath}-wal`
      const stat = await fs.stat(walPath)
      return stat.size
    } catch {
      return 0
    }
  }

  private async getOpenFdCount(): Promise<number | null> {
    const candidates = ['/proc/self/fd', '/dev/fd']
    for (const candidate of candidates) {
      try {
        const entries = await fs.readdir(candidate)
        return entries.length
      } catch {
        // Try next candidate.
      }
    }
    return null
  }

  private parseCheckpointRow(row: unknown): { busy: number; log: number; checkpointed: number } {
    if (!row || typeof row !== 'object') {
      return { busy: 0, log: 0, checkpointed: 0 }
    }
    const record = row as Record<string, unknown>
    return {
      busy: this.parseCount(record.busy ?? record[0]),
      log: this.parseCount(record.log ?? record[1]),
      checkpointed: this.parseCount(record.checkpointed ?? record[2])
    }
  }

  private getDbSchedulerBusyReason(): {
    reason: 'db-write-scheduler'
    queued: number
    processing: boolean
    currentTaskLabel?: string
  } | null {
    const stats = dbWriteScheduler.getStats()
    this.schedulerQueuePeak = Math.max(this.schedulerQueuePeak, stats.queued)
    if (stats.queued > 0 || stats.processing) {
      return {
        reason: 'db-write-scheduler',
        queued: stats.queued,
        processing: stats.processing,
        currentTaskLabel: stats.currentTaskLabel ?? undefined
      }
    }
    return null
  }

  private getWalCheckpointBusyReason(): {
    reason: 'db-write-scheduler'
    queued: number
    processing: boolean
    currentTaskLabel?: string
  } | null {
    return this.getDbSchedulerBusyReason()
  }

  private logWalCheckpointSkippedBusy(
    mode: 'PASSIVE' | 'TRUNCATE',
    busy: NonNullable<ReturnType<DatabaseModule['getWalCheckpointBusyReason']>>
  ): void {
    dbLog.info(DB_WAL_CHECKPOINT_SKIPPED_BUSY, {
      meta: {
        mode,
        reason: busy.reason,
        busyQueueDepth: busy.queued,
        busyProcessing: busy.processing,
        currentTaskLabel: busy.currentTaskLabel
      }
    })
  }

  private isSearchIndexWriterPausedAndDrained(
    status: ReturnType<typeof searchIndexWriter.getStatus>
  ): boolean {
    return status.admissionPaused && status.activeAdmissions === 0 && status.pending === 0
  }

  private logWalCheckpointSkippedWriter(
    mode: 'PASSIVE' | 'TRUNCATE',
    reason: 'search-index-writer-drain-timeout' | 'search-index-writer-not-quiescent',
    status: ReturnType<typeof searchIndexWriter.getStatus>
  ): void {
    dbLog.info(DB_WAL_CHECKPOINT_SKIPPED_BUSY, {
      meta: {
        mode,
        reason,
        busyQueueDepth: status.pending,
        busyProcessing: status.activeAdmissions > 0,
        admissionPaused: status.admissionPaused
      }
    })
  }

  private async runWalCheckpoint(mode: 'PASSIVE' | 'TRUNCATE'): Promise<void> {
    if (!this.client) return

    const busyBeforeSchedule = this.getWalCheckpointBusyReason()
    if (busyBeforeSchedule) {
      this.logWalCheckpointSkippedBusy(mode, busyBeforeSchedule)
      return
    }

    try {
      await searchIndexWriter.withPausedAdmission(
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

          await dbWriteScheduler.schedule(
            `database.wal-checkpoint.${mode.toLowerCase()}`,
            async () => {
              const statusBeforeExecute = searchIndexWriter.getStatus()
              if (!this.isSearchIndexWriterPausedAndDrained(statusBeforeExecute)) {
                this.logWalCheckpointSkippedWriter(
                  mode,
                  'search-index-writer-not-quiescent',
                  statusBeforeExecute
                )
                return
              }

              const checkpointStart = Date.now()
              dbLog.debug('DB_WAL_CHECKPOINT_START', {
                meta: { mode }
              })
              const result = await this.client!.execute(`PRAGMA wal_checkpoint(${mode})`)
              const parsed = this.parseCheckpointRow(result.rows?.[0])
              const walSize = await this.getWalSizeBytes()
              this.walPeakBytes = Math.max(this.walPeakBytes, walSize)

              dbLog.info(`WAL checkpoint ${mode} complete`, {
                meta: {
                  mode,
                  busy: parsed.busy,
                  logFrames: parsed.log,
                  checkpointedFrames: parsed.checkpointed,
                  walSizeBytes: walSize,
                  walPeakBytes: this.walPeakBytes,
                  durationMs: Date.now() - checkpointStart,
                  schedulerQueuePeak: this.schedulerQueuePeak
                }
              })
            },
            {
              priority: 'best_effort',
              dropPolicy: 'drop',
              maxQueueWaitMs: DB_WAL_CHECKPOINT_MAX_QUEUE_WAIT_MS
            }
          )
        },
        DB_WAL_CHECKPOINT_MAX_QUEUE_WAIT_MS
      )
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === 'SEARCH_INDEX_WRITER_DRAIN_TIMEOUT' ||
          error.message === 'SEARCH_INDEX_WRITER_ADMISSION_DRAIN_TIMEOUT')
      ) {
        this.logWalCheckpointSkippedWriter(
          mode,
          'search-index-writer-drain-timeout',
          searchIndexWriter.getStatus()
        )
        return
      }
      dbLog.warn(`WAL checkpoint ${mode} failed`, { error })
    }
  }

  private async reportDatabaseHealth(source: 'periodic' | 'threshold'): Promise<void> {
    const scheduler = dbWriteScheduler.getDetailedStats()
    this.schedulerQueuePeak = Math.max(this.schedulerQueuePeak, scheduler.queued)
    const writer = searchIndexWriter.getStatus()

    const [walSizeBytes, openFdCount] = await Promise.all([
      this.getWalSizeBytes(),
      this.getOpenFdCount()
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
      schedulerQueueDepth: scheduler.queued,
      schedulerQueuePeak: this.schedulerQueuePeak,
      writerPending: writer.pending,
      writerActive: writer.activeAdmissions,
      writerAdmissionPaused: writer.admissionPaused,
      openFdCount: openFdCount ?? undefined
    }
    this.schedulerQueuePeak = scheduler.queued
    this.walPeakBytes = walSizeBytes

    if (!unhealthy) {
      dbLog.info('Database health snapshot', { meta: payload })
      return
    }

    dbLog.warn('Database health snapshot exceeded contention threshold', { meta: payload })
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

  private registerWalMaintenanceTasks(): void {
    if (this.walMaintenanceRegistered) return
    this.walMaintenanceRegistered = true

    pollingService.register(
      DB_WAL_PASSIVE_TASK_ID,
      async () => {
        await this.runWalCheckpoint('PASSIVE')
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
        const queueDepth = dbWriteScheduler.getStats().queued
        this.schedulerQueuePeak = Math.max(this.schedulerQueuePeak, queueDepth)
        if (queueDepth > DB_WAL_TRUNCATE_MAX_QUEUED_WRITES) {
          dbLog.info('Skipping WAL TRUNCATE checkpoint due to active write backlog', {
            meta: { schedulerQueueDepth: queueDepth }
          })
          return
        }
        await this.runWalCheckpoint('TRUNCATE')
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
        await this.reportDatabaseHealth('periodic')
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

  private async getTableCount(client: Client, tableName: string): Promise<number> {
    const rs = await client.execute(`SELECT count(*) as cnt FROM ${tableName}`)
    const first = (rs.rows?.[0] ?? null) as Record<string, unknown> | null
    if (!first) return 0
    return this.parseCount(first.cnt ?? first['count(*)'])
  }

  private async hasAuxMigrationMarker(): Promise<boolean> {
    if (!this.db) return false
    try {
      const row = await this.db
        .select({ value: schema.config.value })
        .from(schema.config)
        .where(eq(schema.config.key, AUX_MIGRATION_MARKER_KEY))
        .get()
      return !!row
    } catch {
      return false
    }
  }

  private async markAuxMigrationCompleted(): Promise<void> {
    if (!this.db) return
    await this.db
      .insert(schema.config)
      .values({
        key: AUX_MIGRATION_MARKER_KEY,
        value: JSON.stringify({
          migratedAt: Date.now(),
          auxDbPath: this.auxDbPath
        })
      })
      .onConflictDoUpdate({
        target: schema.config.key,
        set: {
          value: JSON.stringify({
            migratedAt: Date.now(),
            auxDbPath: this.auxDbPath
          })
        }
      })
  }

  private async ensureAuxTables(): Promise<void> {
    if (!this.auxClient) return

    const statements = [
      `CREATE TABLE IF NOT EXISTS analytics_snapshots (
        id integer PRIMARY KEY AUTOINCREMENT,
        window_type text NOT NULL,
        timestamp integer NOT NULL,
        metrics text NOT NULL,
        created_at integer DEFAULT (unixepoch())
      )`,
      'CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_window_time ON analytics_snapshots (window_type, timestamp)',
      `CREATE TABLE IF NOT EXISTS plugin_analytics (
        id integer PRIMARY KEY AUTOINCREMENT,
        plugin_name text NOT NULL,
        plugin_version text,
        feature_id text,
        event_type text NOT NULL,
        count integer DEFAULT 1,
        metadata text,
        timestamp integer NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS idx_plugin_analytics_plugin_time ON plugin_analytics (plugin_name, timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_plugin_analytics_plugin_version_time ON plugin_analytics (plugin_name, plugin_version, timestamp)',
      `CREATE TABLE IF NOT EXISTS analytics_report_queue (
        id integer PRIMARY KEY AUTOINCREMENT,
        endpoint text NOT NULL,
        payload text NOT NULL,
        created_at integer NOT NULL,
        retry_count integer NOT NULL DEFAULT 0,
        last_attempt_at integer,
        last_error text
      )`,
      'CREATE INDEX IF NOT EXISTS idx_analytics_report_queue_created_at ON analytics_report_queue (created_at)',
      `CREATE TABLE IF NOT EXISTS telemetry_upload_stats (
        id integer PRIMARY KEY,
        search_count integer NOT NULL DEFAULT 0,
        total_uploads integer NOT NULL DEFAULT 0,
        failed_uploads integer NOT NULL DEFAULT 0,
        last_upload_time integer,
        last_failure_at integer,
        last_failure_message text,
        updated_at integer NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS recommendation_cache (
        cache_key text PRIMARY KEY NOT NULL,
        recommended_items text NOT NULL,
        created_at integer DEFAULT (strftime('%s', 'now')) NOT NULL,
        expires_at integer NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS idx_recommendation_cache_expires ON recommendation_cache (expires_at)',
      `CREATE TABLE IF NOT EXISTS clipboard_history (
        id integer PRIMARY KEY AUTOINCREMENT,
        type text NOT NULL,
        content text NOT NULL,
        raw_content text,
        thumbnail text,
        timestamp integer NOT NULL,
        source_app text,
        is_favorite integer DEFAULT 0,
        metadata text
      )`,
      'CREATE INDEX IF NOT EXISTS idx_clipboard_history_timestamp ON clipboard_history (timestamp)',
      `CREATE TABLE IF NOT EXISTS clipboard_history_meta (
        id integer PRIMARY KEY AUTOINCREMENT,
        clipboard_id integer NOT NULL REFERENCES clipboard_history(id) ON DELETE cascade,
        key text NOT NULL,
        value text,
        created_at integer DEFAULT (strftime('%s', 'now')) NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS idx_clipboard_history_meta_clipboard_id ON clipboard_history_meta (clipboard_id)',
      `CREATE TABLE IF NOT EXISTS ocr_jobs (
        id integer PRIMARY KEY AUTOINCREMENT,
        clipboard_id integer REFERENCES clipboard_history(id) ON DELETE cascade,
        status text NOT NULL DEFAULT 'pending',
        priority integer NOT NULL DEFAULT 0,
        attempts integer NOT NULL DEFAULT 0,
        last_error text,
        next_retry_at integer,
        payload_hash text,
        meta text,
        queued_at integer DEFAULT (strftime('%s', 'now')) NOT NULL,
        started_at integer,
        finished_at integer
      )`,
      'CREATE INDEX IF NOT EXISTS idx_ocr_jobs_status_retry ON ocr_jobs (status, next_retry_at, priority)',
      `CREATE TABLE IF NOT EXISTS ocr_results (
        id integer PRIMARY KEY AUTOINCREMENT,
        job_id integer NOT NULL REFERENCES ocr_jobs(id) ON DELETE cascade,
        text text NOT NULL,
        confidence real,
        language text,
        checksum text,
        extra text,
        created_at integer DEFAULT (strftime('%s', 'now')) NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS idx_ocr_results_job_id ON ocr_results (job_id)',
      `CREATE TABLE IF NOT EXISTS config (
        key text PRIMARY KEY,
        value text
      )`
    ]

    for (const statement of statements) {
      await this.auxClient.execute(statement)
    }
  }

  private async migrateHotTablesToAux(): Promise<void> {
    if (!this.auxClient || !this.db || !this.mainDbPath) return

    const marked = await this.hasAuxMigrationMarker()
    if (marked) {
      dbLog.info('Aux hot tables migration marker detected; skipping data copy')
      return
    }

    const escapedMainPath = this.escapeSqlPath(this.mainDbPath)
    await this.auxClient.execute(`ATTACH DATABASE '${escapedMainPath}' AS coredb`)
    try {
      for (const table of AUX_COPY_TABLES) {
        await this.auxClient.execute(`INSERT OR IGNORE INTO ${table} SELECT * FROM coredb.${table}`)
        const [sourceCount, targetCount] = await Promise.all([
          this.getTableCount(this.auxClient, `coredb.${table}`),
          this.getTableCount(this.auxClient, table)
        ])
        if (targetCount < sourceCount) {
          dbLog.warn(`Aux migration verification mismatch for ${table}`, {
            meta: { sourceCount, targetCount }
          })
        }
      }
      await this.markAuxMigrationCompleted()
      dbLog.info('Aux hot tables migration completed', {
        meta: { tables: AUX_COPY_TABLES.length }
      })
    } finally {
      try {
        await this.auxClient.execute('DETACH DATABASE coredb')
      } catch (error) {
        dbLog.warn('Failed to detach coredb after aux migration', { error })
      }
    }
  }

  private async initAuxDatabase(databaseDirPath: string): Promise<void> {
    if (!DB_AUX_ENABLED) {
      dbLog.info('Aux database disabled by TUFF_DB_AUX_ENABLED')
      return
    }

    try {
      this.auxDbPath = path.join(databaseDirPath, 'database-aux.db')
      this.auxClient = createClient({ url: `file:${this.auxDbPath}` })
      await this.configureSqliteClient(this.auxClient, 'aux')
      await this.ensureDatabaseIntegrity(this.auxDbPath, 'aux', this.probeDbIntegrity)
      const auxDb = drizzle(this.auxClient, { schema })
      await this.ensureAuxTables()
      await this.migrateHotTablesToAux()
      if (this.destroying) return
      this.auxDb = auxDb
      this.auxInitialized = true
      dbLog.info('Aux database initialized', {
        meta: { path: this.auxDbPath }
      })
    } catch (error) {
      dbLog.warn('Aux database initialization failed; fallback to primary DB', { error })
      this.auxInitialized = false
      this.auxDb = null
      try {
        this.auxClient?.close()
      } catch {
        // ignore
      }
      this.auxClient = null
      this.auxDbPath = ''
    }
  }

  private scheduleBackgroundStartupTasks(databaseDirPath: string): void {
    if (this.backgroundStartupPromise) return
    const startedAt = performance.now()
    this.backgroundStartupPromise = new Promise<void>((resolve) => setImmediate(resolve))
      .then(async () => {
        if (this.destroying) return
        this.registerWalMaintenanceTasks()

        if (this.destroying) return
        await this.initAuxDatabase(databaseDirPath)

        if (this.destroying) return
        await this.reportDatabaseHealth('threshold')
      })
      .catch((error) => {
        dbLog.warn('Database background startup tasks failed', { error })
      })
      .finally(() => {
        dbLog.debug('Database background startup tasks finished', {
          meta: { durationMs: Math.round(performance.now() - startedAt) }
        })
      })
  }

  async onInit({ file }: ModuleInitContext<TalexEvents>): Promise<void> {
    const { dirPath } = file
    this.destroying = false
    this.lastHealthBusyRetryCount = getSqliteBusyRetryCount()
    this.lastHealthSchedulerBusyFailures = dbWriteScheduler.getDetailedStats().busyFailures
    this.disposeRetryExhaustedListener?.()
    this.disposeRetryExhaustedListener = setSqliteRetryExhaustedListener((event) => {
      operationalErrorService.report({
        domain: 'database',
        operation: event.label,
        error: event.error,
        code: 'DATABASE_BUSY_RETRY_EXHAUSTED',
        severity: 'warning',
        retryable: true,
        userImpact: 'degraded',
        captureDetail: false,
        context: {
          attempts: event.attempts,
          elapsedMs: event.elapsedMs,
          rawCode: event.rawCode
        }
      })
    })
    const dbPath = path.join(dirPath!, 'database.db')
    this.mainDbPath = dbPath
    // Unclean-shutdown marker: present on boot means the previous run crashed or
    // was killed without a clean onDestroy — the only case that can leave real
    // corruption — so we probe (quick_check) only then. Written now (in use),
    // removed on clean shutdown.
    this.dbRunningMarkerPath = `${dbPath}.running`
    this.probeDbIntegrity = fse.existsSync(this.dbRunningMarkerPath)
    try {
      await fs.writeFile(this.dbRunningMarkerPath, String(Date.now()))
    } catch (error) {
      dbLog.warn('Failed to write database running marker', { error })
    }
    this.client = createClient({ url: `file:${dbPath}` })

    this.db = drizzle(this.client, { schema })

    // Configure SQLite for better concurrency
    try {
      await this.configureSqliteClient(this.client, 'primary')
    } catch (error) {
      dbLog.warn('Failed to configure SQLite pragmas', { error })
    }

    // Detect on-disk corruption and rebuild before migrations run — only after an
    // unclean prior shutdown (see probeDbIntegrity). Safe here because no other
    // connection (incl. the search-index worker) is open yet.
    try {
      await this.ensureDatabaseIntegrity(dbPath, 'primary', this.probeDbIntegrity)
    } catch (error) {
      dbLog.error('Database integrity recovery failed', { error })
    }

    const migrationsFolder = this.resolveMigrationsFolder()
    const migrationsFolderResolved = path.resolve(migrationsFolder)

    dbLog.debug(`Resolved migrations folder: ${migrationsFolderResolved}`)

    if (!fse.existsSync(migrationsFolderResolved)) {
      const error = new Error(`Migrations folder not found: ${migrationsFolderResolved}`)
      dbLog.error('Migration folder not found', {
        meta: { path: migrationsFolderResolved, appPath: app.getAppPath() }
      })

      // Collect all tried paths for error message
      const allTriedPaths = [
        migrationsFolderResolved,
        ...(app.isPackaged
          ? [
              path.resolve(app.getAppPath(), 'resources', 'db', 'migrations'),
              path.resolve(app.getAppPath(), '..', 'resources', 'db', 'migrations'),
              ...(process.resourcesPath
                ? [
                    path.resolve(process.resourcesPath, 'app', 'resources', 'db', 'migrations'),
                    ...(process.platform === 'darwin'
                      ? [path.resolve(process.resourcesPath, 'resources', 'db', 'migrations')]
                      : [])
                  ]
                : []),
              path.resolve(__dirname, '..', '..', '..', 'resources', 'db', 'migrations')
            ]
          : [])
      ]

      const detail = `Migrations folder not found:\n${migrationsFolderResolved}\n\nPlease check if the application installation is complete.\n\nDebug information:\n- app.getAppPath(): ${app.getAppPath()}\n- __dirname: ${__dirname}\n- process.resourcesPath: ${process.resourcesPath || 'N/A'}\n- Tried paths:\n${allTriedPaths.join('\n')}`

      await this.showDatabaseErrorDialog(error, detail)
      throw error
    }

    const metaJournalPath = path.resolve(migrationsFolderResolved, 'meta', '_journal.json')
    if (!fse.existsSync(metaJournalPath)) {
      const error = new Error(`Migration journal not found: ${metaJournalPath}`)
      dbLog.error('Migration journal not found', { meta: { path: metaJournalPath } })

      const folderContents = fse.existsSync(migrationsFolderResolved)
        ? fse.readdirSync(migrationsFolderResolved).join(', ')
        : 'N/A'

      const detail = `Migration journal file not found:\n${metaJournalPath}\n\nMigrations folder exists: ${fse.existsSync(migrationsFolderResolved)}\nFolder contents: ${folderContents}\n\nPlease check if the application installation is complete.\n\nDebug information:\n- app.getAppPath(): ${app.getAppPath()}\n- __dirname: ${__dirname}\n- process.resourcesPath: ${process.resourcesPath || 'N/A'}\n- Migrations folder: ${migrationsFolderResolved}`

      await this.showDatabaseErrorDialog(error, detail)
      throw error
    }

    dbLog.info(`Preparing SQLite database at ${dbPath}`)
    dbLog.info(`Applying migrations from ${migrationsFolderResolved}`)

    await this.ensureKeywordMappingsProviderColumn()

    const timingLevelColors: Record<TimingLogLevel, typeof chalk.gray> = {
      none: chalk.gray,
      info: chalk.green,
      warn: chalk.yellow,
      error: chalk.red
    }

    const timing = createTiming('Database:Migrations', {
      storeHistory: false,
      logThresholds: {
        none: 200,
        info: 800,
        warn: 2000
      },
      formatter: (entry, stats) => {
        const level = entry.logLevel ?? 'info'
        const color = timingLevelColors[level] ?? chalk.green
        const durationText = color(`${entry.durationMs.toFixed(2)}ms`)
        return `${chalk.dim('[Timing]')} ${chalk.blue(entry.label)} ${durationText} (avg ${stats.avgMs.toFixed(
          2
        )}ms, max ${stats.maxMs.toFixed(2)}ms, count ${stats.count})`
      }
    })

    try {
      // Use resolved path for migration
      await timing.cost(
        async () => migrate(this.db!, { migrationsFolder: migrationsFolderResolved }),
        {
          folder: migrationsFolderResolved
        }
      )

      await this.ensureKeywordMappingsProviderColumn()
      await this.ensureRecommendationTables()
      await this.ensureAnalyticsTables()
      await this.ensureScanProgressSourceScopeMigration()
      await this.ensureSearchPerformanceIndexes()

      const stats = timing.getStats()
      const duration = stats ? stats.lastMs.toFixed(2) : 'N/A'
      dbLog.info(`Migrations completed successfully in ${duration}ms`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error ?? '')
      const duplicateColumn = message.includes('duplicate column name: provider_id')

      if (duplicateColumn) {
        dbLog.warn('Migration warning: column `provider_id` already exists')
      } else {
        dbLog.error('Migration failed', { error })

        const errorMessage =
          error instanceof Error ? error.message : String(error ?? 'Unknown error')
        const errorInstance = error instanceof Error ? error : new Error(errorMessage)
        await this.showDatabaseErrorDialog(
          errorInstance,
          `Database migration failed:\n${errorMessage}\n\nCheck log files for more information.\nLog location: ${app.getPath('userData')}/tuff/logs/`
        )

        process.exit(1)
      }
    }

    this.scheduleBackgroundStartupTasks(dirPath!)
  }

  private async ensureSearchPerformanceIndexes(): Promise<void> {
    if (!this.client) return

    // Hot-path indexes for migration-created tables, added at runtime
    // (idempotent) to match the existing ensure* pattern. Cover the
    // per-keystroke completion LIKE, recommendation ORDER BY, embedding
    // (source_type, source_id) lookups, and usage_logs range scans.
    const statements = [
      'CREATE INDEX IF NOT EXISTS idx_query_completions_prefix ON query_completions (prefix)',
      'CREATE INDEX IF NOT EXISTS idx_item_usage_execute_count ON item_usage_stats (execute_count)',
      'CREATE INDEX IF NOT EXISTS idx_item_usage_last_executed ON item_usage_stats (last_executed)',
      'CREATE INDEX IF NOT EXISTS idx_embeddings_source ON embeddings (source_type, source_id)',
      'CREATE INDEX IF NOT EXISTS idx_usage_logs_action_ts ON usage_logs (action, timestamp)'
    ]

    try {
      for (const statement of statements) {
        await this.client.execute(statement)
      }
    } catch (error) {
      dbLog.warn('Failed to ensure search performance indexes', { error })
    }
  }

  private async ensureKeywordMappingsProviderColumn(): Promise<void> {
    if (!this.client) return

    try {
      const check = await this.client.execute(
        "SELECT 1 FROM pragma_table_info('keyword_mappings') WHERE name = 'provider_id' LIMIT 1"
      )
      if (check.rows.length > 0) {
        return
      }

      dbLog.info('Adding missing column `keyword_mappings.provider_id`')
      await this.client.execute(
        "ALTER TABLE keyword_mappings ADD COLUMN provider_id text DEFAULT '' NOT NULL"
      )
    } catch (error) {
      dbLog.warn('Failed to set up `provider_id` column pre-migration', { error })
    }
  }

  private async ensureScanProgressSourceScopeMigration(): Promise<void> {
    if (!this.db) return

    try {
      const plan = await planScanProgressSourceScopeMigration(this.db, {
        sourceId: 'file-provider'
      })

      if (plan.status === 'not-needed') {
        dbLog.debug('scan_progress already source-scoped', {
          meta: {
            primaryKeyColumns: plan.primaryKeyColumns,
            existingRows: plan.existingRows
          }
        })
        return
      }

      if (plan.status === 'blocked') {
        dbLog.warn('scan_progress source-scope migration blocked; keeping compatibility mode', {
          meta: {
            blockers: plan.blockers,
            existingRows: plan.existingRows,
            blankPathRows: plan.blankPathRows,
            invalidTimestampRows: plan.invalidTimestampRows,
            duplicatePathRows: plan.duplicatePathRows
          }
        })
        return
      }

      const result = await runScanProgressSourceScopeMigration(this.db, {
        sourceId: 'file-provider'
      })
      dbLog.info('scan_progress source-scope migration completed', {
        meta: {
          executed: result.executed,
          migratedRows: result.migratedRows,
          backupTable: result.backupTable,
          sourceId: result.plan.sourceId
        }
      })
    } catch (error) {
      dbLog.warn('Failed to migrate scan_progress to source-scoped schema', { error })
    }
  }

  private async ensureRecommendationTables(): Promise<void> {
    if (!this.client) return

    try {
      const checkTimeStats = await this.client.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='item_time_stats' LIMIT 1"
      )

      if (checkTimeStats.rows.length === 0) {
        dbLog.info('Creating missing table `item_time_stats`')
        await this.client.execute(`
          CREATE TABLE item_time_stats (
            source_id text NOT NULL,
            item_id text NOT NULL,
            hour_distribution text NOT NULL,
            day_of_week_distribution text NOT NULL,
            time_slot_distribution text NOT NULL,
            last_updated integer DEFAULT (strftime('%s', 'now')) NOT NULL,
            PRIMARY KEY(source_id, item_id)
          )
        `)
        await this.client.execute(
          'CREATE INDEX idx_item_time_stats_updated ON item_time_stats (last_updated)'
        )
      }

      const checkCache = await this.client.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='recommendation_cache' LIMIT 1"
      )

      if (checkCache.rows.length === 0) {
        dbLog.info('Creating missing table `recommendation_cache`')
        await this.client.execute(`
          CREATE TABLE recommendation_cache (
            cache_key text PRIMARY KEY NOT NULL,
            recommended_items text NOT NULL,
            created_at integer DEFAULT (strftime('%s', 'now')) NOT NULL,
            expires_at integer NOT NULL
          )
        `)
        await this.client.execute(
          'CREATE INDEX idx_recommendation_cache_expires ON recommendation_cache (expires_at)'
        )
      }
    } catch (error) {
      dbLog.warn('Failed to ensure recommendation tables', { error })
    }
  }

  private async ensureAnalyticsTables(): Promise<void> {
    if (!this.client) {
      return
    }

    try {
      const tableCheck = await this.client.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='analytics_snapshots' LIMIT 1"
      )

      if (tableCheck.rows.length === 0) {
        dbLog.info('Creating missing table `analytics_snapshots`')
        await this.client.execute(`
          CREATE TABLE analytics_snapshots (
            id integer PRIMARY KEY AUTOINCREMENT,
            window_type text NOT NULL,
            timestamp integer NOT NULL,
            metrics text NOT NULL,
            created_at integer DEFAULT (unixepoch())
          )
        `)
      } else {
        const columnCheck = await this.client.execute(
          "SELECT 1 FROM pragma_table_info('analytics_snapshots') WHERE name = 'created_at' LIMIT 1"
        )
        if (columnCheck.rows.length === 0) {
          dbLog.info('Adding missing column `analytics_snapshots.created_at`')
          await this.client.execute(
            'ALTER TABLE analytics_snapshots ADD COLUMN created_at integer DEFAULT (unixepoch())'
          )
        }
      }

      const indexCheck = await this.client.execute(
        "SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_analytics_snapshots_window_time' LIMIT 1"
      )
      if (indexCheck.rows.length === 0) {
        dbLog.info('Creating missing index `idx_analytics_snapshots_window_time`')
        await this.client.execute(
          'CREATE INDEX idx_analytics_snapshots_window_time ON analytics_snapshots (window_type, timestamp)'
        )
      }
    } catch (error) {
      dbLog.warn('Failed to ensure analytics snapshot table', { error })
    }
  }

  async onDestroy(): Promise<void> {
    this.destroying = true
    this.disposeRetryExhaustedListener?.()
    this.disposeRetryExhaustedListener = null
    if (this.backgroundStartupPromise) {
      await this.backgroundStartupPromise
      this.backgroundStartupPromise = null
    }

    if (this.walMaintenanceRegistered) {
      pollingService.unregister(DB_WAL_PASSIVE_TASK_ID)
      pollingService.unregister(DB_WAL_TRUNCATE_TASK_ID)
      pollingService.unregister(DB_HEALTH_REPORT_TASK_ID)
      this.walMaintenanceRegistered = false
    }
    // Flush the WAL back into the main db before closing. DatabaseModule is
    // destroyed last (reverse load order), after the search-index worker has
    // been terminated, so this connection is the final writer. Leaving a large
    // uncheckpointed WAL for the next launch to recover is a known WAL-mode
    // corruption origin; best-effort, never block quit on failure.
    try {
      await this.client?.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch (error) {
      dbLog.warn('Final WAL checkpoint on shutdown failed', { error })
    }
    this.client?.close()
    this.auxClient?.close()
    // Clean shutdown reached: remove the running marker so the next boot skips
    // the full-file quick_check. (If we crash before here, the marker persists
    // and the next boot probes for corruption.)
    if (this.dbRunningMarkerPath) {
      try {
        await fs.rm(this.dbRunningMarkerPath, { force: true })
      } catch (error) {
        dbLog.warn('Failed to clear database running marker', { error })
      }
    }
    this.db = null
    this.auxDb = null
    this.auxInitialized = false
    dbLog.info('DatabaseManager destroyed')
  }

  public getDatabaseFilePath(): string {
    if (!this.mainDbPath) {
      throw new Error('Database path not initialized. Call init() first.')
    }
    return this.mainDbPath
  }

  public getDb(): LibSQLDatabase<typeof schema> {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.')
    }
    return this.db
  }
}

const databaseModule = new DatabaseModule()

export { databaseModule }
