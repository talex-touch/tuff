import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql'
import { createClient, Client } from '@libsql/client'
import path from 'path'

export class DatabaseManager {
  private db: LibSQLDatabase | null = null
  private client: Client | null = null

  public init(modulePath: string): void {
    const dbPath = path.join(modulePath, 'database.db')
    this.client = createClient({ url: `file:${dbPath}` })
    this.db = drizzle(this.client)
    console.log('[Database] DatabaseManager initialized at', dbPath)
  }

  public getDb(): LibSQLDatabase {
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
  init(): void {
    const modulePath = this['modulePath']!
    databaseManager.init(modulePath)
  },
  destroy(): void {
    databaseManager.destroy()
  }
}
