import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql'
import { createClient, Client } from '@libsql/client'
import path from 'path'
import { migrate } from 'drizzle-orm/libsql/migrator'
import chalk from 'chalk'
import * as schema from '../../db/schema'
import migrationsLocator from '../../../../resources/db/locator.json?commonjs-external&asset'
import { MaybePromise, ModuleInitContext, ModuleKey, createTiming } from '@talex-touch/utils'
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

    const timing = createTiming('Database:Migrations', {
      storeHistory: false,
      formatter: (entry, stats) =>
        `${chalk.dim('[Timing]')} ${chalk.blue(entry.label)} ${chalk.yellow(entry.durationMs.toFixed(2))}ms (avg ${stats.avgMs.toFixed(2)}ms, max ${stats.maxMs.toFixed(2)}ms, count ${stats.count})`
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

  private async ensureKeywordMappingsProviderColumn(): Promise<void> {
    if (!this.client) {
      return
    }

    const tableExists = await this.client.execute(
      `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'keyword_mappings' LIMIT 1`
    )

    if (!tableExists.rows.length) {
      return
    }

    const providerExists = await this.client.execute(
      `SELECT 1 FROM pragma_table_info('keyword_mappings') WHERE name = 'provider_id' LIMIT 1`
    )

    if (providerExists.rows.length) {
      return
    }

    console.log(chalk.yellow('[Database] Backfilling `provider_id` column on `keyword_mappings`...'))

    await this.client.execute(
      `ALTER TABLE keyword_mappings ADD COLUMN provider_id text DEFAULT '' NOT NULL`
    )

    console.log(chalk.green('[Database] Added `provider_id` column on `keyword_mappings` table.'))
  }
}

const databaseModule = new DatabaseModule()

export { databaseModule }
