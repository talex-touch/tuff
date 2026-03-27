import type { Client } from '@libsql/client'
import type { MaybePromise, ModuleInitContext, ModuleKey, TimingLogLevel } from '@talex-touch/utils'
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
import { getSqliteBusyRetryCount } from '../../db/sqlite-retry'
import { BaseModule } from '../abstract-base-module'

const dbLog = getLogger('database')
const AUX_MIGRATION_MARKER_KEY = 'db.aux.migration.v1.complete'
const DB_WAL_PASSIVE_TASK_ID = 'database_wal_checkpoint_passive'
const DB_WAL_TRUNCATE_TASK_ID = 'database_wal_checkpoint_truncate'
const DB_HEALTH_REPORT_TASK_ID = 'database_health_report'
const DB_WAL_PASSIVE_INTERVAL_MS = 5 * 60 * 1000
const DB_WAL_TRUNCATE_INTERVAL_MS = 30 * 60 * 1000
const DB_HEALTH_REPORT_INTERVAL_MS = 10 * 60 * 1000
const DB_WAL_TRUNCATE_MAX_QUEUED_WRITES = 2
const WAL_WARN_THRESHOLD_BYTES = 512 * 1024 * 1024
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
  private walMaintenanceRegistered = false
  private walPeakBytes = 0
  private schedulerQueuePeak = 0

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
    await client.execute('PRAGMA journal_mode = WAL')
    await client.execute('PRAGMA busy_timeout = 30000')
    await client.execute('PRAGMA synchronous = NORMAL')
    await client.execute('PRAGMA locking_mode = NORMAL')
    await client.execute('PRAGMA mmap_size = 268435456')
    dbLog.info(`SQLite ${label} configured: WAL mode enabled, busy_timeout=30s`)
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

  private async runWalCheckpoint(mode: 'PASSIVE' | 'TRUNCATE'): Promise<void> {
    if (!this.client) return

    const queueDepth = dbWriteScheduler.getStats().queued
    this.schedulerQueuePeak = Math.max(this.schedulerQueuePeak, queueDepth)

    try {
      const result = await this.client.execute(`PRAGMA wal_checkpoint(${mode})`)
      const parsed = this.parseCheckpointRow(result.rows?.[0])
      const walSize = await this.getWalSizeBytes()
      this.walPeakBytes = Math.max(this.walPeakBytes, walSize)

      dbLog.info(`WAL checkpoint ${mode} complete`, {
        meta: {
          busy: parsed.busy,
          logFrames: parsed.log,
          checkpointedFrames: parsed.checkpointed,
          walSizeBytes: walSize,
          walPeakBytes: this.walPeakBytes,
          schedulerQueueDepth: queueDepth,
          schedulerQueuePeak: this.schedulerQueuePeak
        }
      })
    } catch (error) {
      dbLog.warn(`WAL checkpoint ${mode} failed`, { error })
    }
  }

  private async reportDatabaseHealth(source: 'periodic' | 'threshold'): Promise<void> {
    const queueDepth = dbWriteScheduler.getStats().queued
    this.schedulerQueuePeak = Math.max(this.schedulerQueuePeak, queueDepth)

    const [walSizeBytes, openFdCount] = await Promise.all([
      this.getWalSizeBytes(),
      this.getOpenFdCount()
    ])
    this.walPeakBytes = Math.max(this.walPeakBytes, walSizeBytes)

    const busyRetryCount = getSqliteBusyRetryCount()
    const level = walSizeBytes >= WAL_WARN_THRESHOLD_BYTES ? 'warn' : 'info'
    const payload = {
      source,
      walSizeBytes,
      walPeakBytes: this.walPeakBytes,
      busyRetryCount,
      schedulerQueueDepth: queueDepth,
      schedulerQueuePeak: this.schedulerQueuePeak,
      openFdCount: openFdCount ?? undefined
    }

    if (level === 'warn') {
      dbLog.warn('Database health snapshot (WAL threshold exceeded)', { meta: payload })
      return
    }

    dbLog.info('Database health snapshot', { meta: payload })
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
      this.auxDb = drizzle(this.auxClient, { schema })
      await this.ensureAuxTables()
      await this.migrateHotTablesToAux()
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

  async onInit({ file }: ModuleInitContext<TalexEvents>): Promise<void> {
    const { dirPath } = file
    const dbPath = path.join(dirPath!, 'database.db')
    this.mainDbPath = dbPath
    this.client = createClient({ url: `file:${dbPath}` })

    this.db = drizzle(this.client, { schema })

    // Configure SQLite for better concurrency
    try {
      await this.configureSqliteClient(this.client, 'primary')
    } catch (error) {
      dbLog.warn('Failed to configure SQLite pragmas', { error })
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

    await this.initAuxDatabase(dirPath!)
    this.registerWalMaintenanceTasks()
    await this.reportDatabaseHealth('threshold')
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

  onDestroy(): MaybePromise<void> {
    if (this.walMaintenanceRegistered) {
      pollingService.unregister(DB_WAL_PASSIVE_TASK_ID)
      pollingService.unregister(DB_WAL_TRUNCATE_TASK_ID)
      pollingService.unregister(DB_HEALTH_REPORT_TASK_ID)
      this.walMaintenanceRegistered = false
    }
    this.client?.close()
    this.auxClient?.close()
    this.db = null
    this.auxDb = null
    this.auxInitialized = false
    dbLog.info('DatabaseManager destroyed')
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
