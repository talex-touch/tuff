import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql'
import { createClient, Client } from '@libsql/client'
import path from 'path'
import { migrate } from 'drizzle-orm/libsql/migrator'
import * as schema from '../../db/schema'
import migrationsLocator from '../../../../resources/db/locator.json?commonjs-external&asset'
import { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
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

    console.log(`[Database] Running migrations from: ${migrationsFolder}`)

    try {
      await migrate(this.db, { migrationsFolder })
    } catch (error: any) {
      const message = String(error?.message ?? '')
      const duplicateColumn = message.includes('duplicate column name: provider_id')

      if (duplicateColumn) {
        console.warn(
          '[Database] Migration skipped: column `provider_id` already exists. Continuing without applying duplicate migration.'
        )
        return
      }

      console.error('[Database] Migration failed:', error)
      throw error // Re-throw to ensure the app doesn't continue in a broken state
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
