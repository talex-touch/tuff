import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql'
import { createClient, Client } from '@libsql/client'
import path from 'path'
import { migrate } from 'drizzle-orm/libsql/migrator'
import * as schema from '../../db/schema'
import migrationsLocator from '../../../../resources/db/locator.json?commonjs-external&asset'

export class DatabaseManager {
  private db: LibSQLDatabase<typeof schema> | null = null
  private client: Client | null = null

  public async init(modulePath: string): Promise<void> {
    console.log('[Database] Database start to init ===')
    const dbPath = path.join(modulePath, 'database.db')
    this.client = createClient({ url: `file:${dbPath}` })
    this.db = drizzle(this.client, { schema })

    const dbFolder = path.dirname(migrationsLocator)
    const migrationsFolder = path.join(dbFolder, 'migrations')
    console.log(`[Database] Running migrations from: ${migrationsFolder}`)
    try {
      await migrate(this.db, { migrationsFolder })
    } catch (error) {
      console.error('[Database] Migration failed:', error)
      throw error // Re-throw to ensure the app doesn't continue in a broken state
    }

    console.log('[Database] Database migrations completed')

    console.log('[Database] DatabaseManager initialized at', dbPath)
  }

  public getDb(): LibSQLDatabase<typeof schema> {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.')
    }
    return this.db
  }

  public destroy(): void {
    this.client?.close()
    this.db = null
    console.log('[Database] DatabaseManager destroyed')
  }
}

export const databaseManager = new DatabaseManager()

export default {
  name: Symbol('Database'),
  filePath: 'database',
  async init(): Promise<void> {
    console.log('[Database] Database start to init')

    const modulePath = this['modulePath']!
    await databaseManager.init(modulePath)

    console.log('[Database] Database initialized')
  },
  destroy(): void {
    databaseManager.destroy()
  }
}
