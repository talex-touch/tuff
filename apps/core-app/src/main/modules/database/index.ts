import type { Client } from '@libsql/client'
import type {
  MaybePromise,
  ModuleInitContext,
  ModuleKey,
  TimingLogLevel,
} from '@talex-touch/utils'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import path from 'node:path'
import { createClient } from '@libsql/client'
import {
  createTiming,

} from '@talex-touch/utils'
import chalk from 'chalk'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { app, BrowserWindow, dialog } from 'electron'
import fse from 'fs-extra'
import migrationsLocator from '../../../../resources/db/locator.json?commonjs-external&asset'
import * as schema from '../../db/schema'
import { BaseModule } from '../abstract-base-module'

export class DatabaseModule extends BaseModule {
  private db: LibSQLDatabase<typeof schema> | null = null
  private client: Client | null = null

  static key: symbol = Symbol.for('Database')
  name: ModuleKey = DatabaseModule.key

  constructor() {
    super(DatabaseModule.key, {
      create: true,
      dirName: 'database',
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
      noLink: true,
    })
  }

  private resolveMigrationsFolder(): string {
    if (app.isPackaged) {
      const appPath = app.getAppPath()
      const migrationsPath = path.resolve(appPath, 'resources', 'db', 'migrations')

      console.log(chalk.cyan(`[Database] Resolving migrations folder...`))
      console.log(chalk.cyan(`[Database] app.getAppPath(): ${appPath}`))
      console.log(chalk.cyan(`[Database] __dirname: ${__dirname}`))
      console.log(chalk.cyan(`[Database] process.resourcesPath: ${process.resourcesPath || 'N/A'}`))
      console.log(chalk.cyan(`[Database] Primary path: ${migrationsPath}`))
      console.log(chalk.cyan(`[Database] Primary path exists: ${fse.existsSync(migrationsPath)}`))

      // First check the expected path
      if (fse.existsSync(migrationsPath)) {
        const metaJournalPath = path.resolve(migrationsPath, 'meta', '_journal.json')
        console.log(chalk.cyan(`[Database] Checking meta journal: ${metaJournalPath}`))
        console.log(chalk.cyan(`[Database] Meta journal exists: ${fse.existsSync(metaJournalPath)}`))

        if (fse.existsSync(metaJournalPath)) {
          console.log(chalk.green(`[Database] Using primary migrations path: ${migrationsPath}`))
          return migrationsPath
        }
      }

      // Try alternative paths
      const alternativePaths = [
        // Alternative 1: relative to main directory
        path.resolve(path.dirname(__dirname || path.join(appPath, 'main')), '..', 'resources', 'db', 'migrations'),
        // Alternative 2: relative to appPath
        path.resolve(appPath, '..', 'resources', 'db', 'migrations'),
        // Alternative 3: process.resourcesPath (Electron specific)
        ...(process.resourcesPath
          ? [
              path.resolve(process.resourcesPath, 'app', 'resources', 'db', 'migrations'),
              path.resolve(process.resourcesPath, 'resources', 'db', 'migrations'),
            ]
          : []),
        // Alternative 4: macOS-specific paths
        ...(process.platform === 'darwin'
          ? [
              path.resolve(appPath, '..', '..', '..', 'Resources', 'app', 'resources', 'db', 'migrations'),
              path.resolve(__dirname, '..', '..', '..', 'resources', 'db', 'migrations'),
            ]
          : []),
      ]

      console.log(chalk.cyan(`[Database] Trying ${alternativePaths.length} alternative paths...`))
      for (let i = 0; i < alternativePaths.length; i++) {
        const altPath = alternativePaths[i]
        console.log(chalk.cyan(`[Database] Alternative ${i + 1}: ${altPath}`))
        console.log(chalk.cyan(`[Database] Alternative ${i + 1} exists: ${fse.existsSync(altPath)}`))

        if (fse.existsSync(altPath)) {
          const metaJournalPath = path.resolve(altPath, 'meta', '_journal.json')
          console.log(chalk.cyan(`[Database] Checking meta journal: ${metaJournalPath}`))
          console.log(chalk.cyan(`[Database] Meta journal exists: ${fse.existsSync(metaJournalPath)}`))

          if (fse.existsSync(metaJournalPath)) {
            console.log(chalk.yellow(`[Database] Using alternative migrations path: ${altPath}`))
            return altPath
          }
        }
      }

      // Return the expected path even if it doesn't exist (will be caught by validation)
      console.log(chalk.red(`[Database] No valid migrations path found, returning primary path: ${migrationsPath}`))
      return migrationsPath
    }
    else {
      const dbFolder = path.dirname(migrationsLocator)
      return path.resolve(dbFolder, 'migrations')
    }
  }

  async onInit({ file }: ModuleInitContext<TalexEvents>): Promise<void> {
    const { dirPath } = file
    const dbPath = path.join(dirPath!, 'database.db')
    this.client = createClient({ url: `file:${dbPath}` })

    this.db = drizzle(this.client, { schema })

    const migrationsFolder = this.resolveMigrationsFolder()
    const migrationsFolderResolved = path.resolve(migrationsFolder)

    console.log(chalk.cyan(`[Database] Resolved migrations folder: ${migrationsFolderResolved}`))

    if (!fse.existsSync(migrationsFolderResolved)) {
      const error = new Error(`Migrations folder not found: ${migrationsFolderResolved}`)
      console.error(chalk.red('[Database] Migration folder not found:'), migrationsFolderResolved)
      console.error(chalk.red('[Database] App path:'), app.getAppPath())
      console.error(chalk.red('[Database] __dirname:'), __dirname)
      console.error(chalk.red('[Database] process.resourcesPath:'), process.resourcesPath)

      // List actual directory contents to help debug
      try {
        const appPath = app.getAppPath()
        console.error(chalk.red('[Database] App path contents:'), fse.existsSync(appPath) ? fse.readdirSync(appPath) : 'N/A')
        if (fse.existsSync(appPath)) {
          const resourcesInApp = path.join(appPath, 'resources')
          console.error(chalk.red('[Database] resources in app exists:'), fse.existsSync(resourcesInApp))
          if (fse.existsSync(resourcesInApp)) {
            console.error(chalk.red('[Database] resources contents:'), fse.readdirSync(resourcesInApp))
          }
        }
      }
      catch (e) {
        console.error(chalk.red('[Database] Error listing directory:'), e)
      }

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
                    ...(process.platform === 'darwin' ? [path.resolve(process.resourcesPath, 'resources', 'db', 'migrations')] : []),
                  ]
                : []),
              path.resolve(__dirname, '..', '..', '..', 'resources', 'db', 'migrations'),
            ]
          : []),
      ]

      const detail = `Migrations folder not found:\n${migrationsFolderResolved}\n\nPlease check if the application installation is complete.\n\nDebug information:\n- app.getAppPath(): ${app.getAppPath()}\n- __dirname: ${__dirname}\n- process.resourcesPath: ${process.resourcesPath || 'N/A'}\n- Tried paths:\n${allTriedPaths.join('\n')}`

      await this.showDatabaseErrorDialog(error, detail)
      throw error
    }

    const metaJournalPath = path.resolve(migrationsFolderResolved, 'meta', '_journal.json')
    if (!fse.existsSync(metaJournalPath)) {
      const error = new Error(`Migration journal not found: ${metaJournalPath}`)
      console.error(chalk.red('[Database] Migration journal not found:'), metaJournalPath)
      console.error(
        chalk.red('[Database] Migrations folder exists:'),
        fse.existsSync(migrationsFolderResolved),
      )
      console.error(chalk.red('[Database] Migrations folder contents:'), fse.existsSync(migrationsFolderResolved) ? fse.readdirSync(migrationsFolderResolved) : 'N/A')

      const folderContents = fse.existsSync(migrationsFolderResolved)
        ? fse.readdirSync(migrationsFolderResolved).join(', ')
        : 'N/A'

      const detail = `Migration journal file not found:\n${metaJournalPath}\n\nMigrations folder exists: ${fse.existsSync(migrationsFolderResolved)}\nFolder contents: ${folderContents}\n\nPlease check if the application installation is complete.\n\nDebug information:\n- app.getAppPath(): ${app.getAppPath()}\n- __dirname: ${__dirname}\n- process.resourcesPath: ${process.resourcesPath || 'N/A'}\n- Migrations folder: ${migrationsFolderResolved}`

      await this.showDatabaseErrorDialog(error, detail)
      throw error
    }

    console.log(chalk.cyan(`[Database] Preparing SQLite database at ${chalk.bold(dbPath)}`))
    console.log(chalk.cyan(`[Database] Applying migrations from ${chalk.bold(migrationsFolderResolved)}`))

    await this.ensureKeywordMappingsProviderColumn()

    const timingLevelColors: Record<TimingLogLevel, typeof chalk.gray> = {
      none: chalk.gray,
      info: chalk.green,
      warn: chalk.yellow,
      error: chalk.red,
    }

    const timing = createTiming('Database:Migrations', {
      storeHistory: false,
      logThresholds: {
        none: 200,
        info: 800,
        warn: 2000,
      },
      formatter: (entry, stats) => {
        const level = entry.logLevel ?? 'info'
        const color = timingLevelColors[level] ?? chalk.green
        const durationText = color(`${entry.durationMs.toFixed(2)}ms`)
        return `${chalk.dim('[Timing]')} ${chalk.blue(entry.label)} ${durationText} (avg ${stats.avgMs.toFixed(
          2,
        )}ms, max ${stats.maxMs.toFixed(2)}ms, count ${stats.count})`
      },
    })

    try {
      // Use resolved path for migration
      await timing.cost(async () => migrate(this.db!, { migrationsFolder: migrationsFolderResolved }), {
        folder: migrationsFolderResolved,
      })

      await this.ensureKeywordMappingsProviderColumn()

      const stats = timing.getStats()
      const duration = stats ? stats.lastMs.toFixed(2) : 'N/A'
      console.log(chalk.green(`[Database] Migrations completed successfully in ${duration} ms.`))
    }
    catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error ?? '')
      const duplicateColumn = message.includes('duplicate column name: provider_id')

      if (duplicateColumn) {
        console.warn(
          chalk.yellow(
            '[Database] Migration skipped: column `provider_id` already exists. Continuing without applying duplicate migration.',
          ),
        )
        console.error(error)
        return
      }

      console.error(chalk.red('[Database] Migration failed:'), error)

      const errorMessage = error instanceof Error ? error.message : String(error ?? 'Unknown error')
      const errorInstance = error instanceof Error ? error : new Error(errorMessage)
      await this.showDatabaseErrorDialog(
        errorInstance,
        `Database migration failed:\n${errorMessage}\n\nCheck log files for more information.\nLog location: ${app.getPath('userData')}/tuff/logs/`,
      )

      process.exit(1)
    }
  }

  private async ensureKeywordMappingsProviderColumn(): Promise<void> {
    if (!this.client)
      return

    try {
      const check = await this.client.execute(
        'SELECT 1 FROM pragma_table_info(\'keyword_mappings\') WHERE name = \'provider_id\' LIMIT 1',
      )
      if (check.rows.length > 0) {
        return
      }

      console.log(chalk.yellow('[Database] Adding missing column `keyword_mappings.provider_id`'))
      await this.client.execute(
        'ALTER TABLE keyword_mappings ADD COLUMN provider_id text DEFAULT \'\' NOT NULL',
      )
    }
    catch (error) {
      console.warn('[Database] Failed to set up `provider_id` column pre-migration:', error)
    }
  }

  onDestroy(): MaybePromise<void> {
    this.client?.close()
    this.db = null
    console.log('[Database] DatabaseManager destroyed')
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
