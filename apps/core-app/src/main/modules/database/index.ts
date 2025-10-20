import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql'
import { createClient, Client } from '@libsql/client'
import path from 'path'
import { migrate } from 'drizzle-orm/libsql/migrator'
import chalk from 'chalk'
import * as schema from '../../db/schema'
import migrationsLocator from '../../../../resources/db/locator.json?commonjs-external&asset'
import {
  MaybePromise,
  ModuleInitContext,
  ModuleKey,
  createTiming,
  type TimingLogLevel
} from '@talex-touch/utils'
import { TalexEvents } from '../../core/eventbus/touch-event'
import { BaseModule } from '../abstract-base-module'

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

  async onInit({ file }: ModuleInitContext<TalexEvents>): Promise<void> {
    const { dirPath } = file
    const dbPath = path.join(dirPath!, 'database.db')
    this.client = createClient({ url: `file:${dbPath}` })

    this.db = drizzle(this.client, { schema })

    const dbFolder = path.dirname(migrationsLocator)
    const migrationsFolder = path.join(dbFolder, 'migrations')

    console.log(chalk.cyan(`[Database] Preparing SQLite database at ${chalk.bold(dbPath)}`))
    console.log(chalk.cyan(`[Database] Applying migrations from ${chalk.bold(migrationsFolder)}`))

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
      await timing.cost(async () => migrate(this.db!, { migrationsFolder }), {
        folder: migrationsFolder
      })

      await this.ensureKeywordMappingsProviderColumn()

      const stats = timing.getStats()
      const duration = stats ? stats.lastMs.toFixed(2) : 'N/A'
      console.log(chalk.green(`[Database] Migrations completed successfully in ${duration} ms.`))
    } catch (error: any) {
      const message = String(error?.message ?? '')
      const duplicateColumn = message.includes('duplicate column name: provider_id')

      if (duplicateColumn) {
        console.warn(
          chalk.yellow(
            '[Database] Migration skipped: column `provider_id` already exists. Continuing without applying duplicate migration.'
          )
        )
        console.error(error)
        return
      }

      console.error(chalk.red('[Database] Migration failed:'), error)
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

      console.log(chalk.yellow('[Database] Adding missing column `keyword_mappings.provider_id`'))
      await this.client.execute(
        "ALTER TABLE keyword_mappings ADD COLUMN provider_id text DEFAULT '' NOT NULL"
      )
    } catch (error) {
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
