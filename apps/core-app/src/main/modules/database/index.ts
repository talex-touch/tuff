import type { Client } from '@libsql/client'
import type { MaybePromise, ModuleInitContext, ModuleKey, TimingLogLevel } from '@talex-touch/utils'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { createTiming } from '@talex-touch/utils'
import chalk from 'chalk'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { app, BrowserWindow, dialog } from 'electron'
import fse from 'fs-extra'
import migrationsLocator from '../../../../resources/db/locator.json?commonjs-external&asset'
import * as schema from '../../db/schema'
import { createLogger } from '../../utils/logger'
import { BaseModule } from '../abstract-base-module'

const dbLog = createLogger('Database')

export class DatabaseModule extends BaseModule {
  private db: LibSQLDatabase<typeof schema> | null = null
  private client: Client | null = null

  static key: symbol = Symbol.for('Database')
  name: ModuleKey = DatabaseModule.key

  constructor() {
    super(DatabaseModule.key, {
      create: true,
      dirName: 'database'
    })
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

  async onInit({ file }: ModuleInitContext<TalexEvents>): Promise<void> {
    const { dirPath } = file
    const dbPath = path.join(dirPath!, 'database.db')
    this.client = createClient({ url: `file:${dbPath}` })

    this.db = drizzle(this.client, { schema })

    // Configure SQLite for better concurrency
    try {
      await this.client.execute('PRAGMA journal_mode = WAL')
      await this.client.execute('PRAGMA busy_timeout = 30000')
      await this.client.execute('PRAGMA synchronous = NORMAL')
      await this.client.execute('PRAGMA locking_mode = NORMAL')
      await this.client.execute('PRAGMA mmap_size = 268435456')
      dbLog.success('SQLite configured: WAL mode enabled, busy_timeout=30s')
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
      dbLog.success(`Migrations completed successfully in ${duration}ms`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error ?? '')
      const duplicateColumn = message.includes('duplicate column name: provider_id')

      if (duplicateColumn) {
        dbLog.warn('Migration skipped: column `provider_id` already exists')
        return
      }

      dbLog.error('Migration failed', { error })

      const errorMessage = error instanceof Error ? error.message : String(error ?? 'Unknown error')
      const errorInstance = error instanceof Error ? error : new Error(errorMessage)
      await this.showDatabaseErrorDialog(
        errorInstance,
        `Database migration failed:\n${errorMessage}\n\nCheck log files for more information.\nLog location: ${app.getPath('userData')}/tuff/logs/`
      )

      process.exit(1)
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
    this.client?.close()
    this.db = null
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
