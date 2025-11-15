/**
 * Database migration utilities for download center
 */

import { createClient } from '@libsql/client'
import { EventEmitter } from 'events'

export interface Migration {
  version: number
  name: string
  description?: string
  up: (db: any) => Promise<void>
  down?: (db: any) => Promise<void>
}

export interface MigrationStatus {
  version: number
  name: string
  appliedAt: number
}

export class MigrationRunner extends EventEmitter {
  private dbPath: string

  constructor(dbPath: string) {
    super()
    this.dbPath = dbPath
  }

  /**
   * Get current schema version
   */
  async getCurrentVersion(): Promise<number> {
    const client = createClient({ url: `file:${this.dbPath}` })

    try {
      const result = await client.execute(
        'SELECT MAX(version) as version FROM migrations'
      )
      return (result.rows[0]?.version as number) || 0
    } catch {
      return 0
    } finally {
      client.close()
    }
  }

  /**
   * Get all applied migrations
   */
  async getAppliedMigrations(): Promise<MigrationStatus[]> {
    const client = createClient({ url: `file:${this.dbPath}` })

    try {
      const result = await client.execute(
        'SELECT version, name, applied_at FROM migrations ORDER BY version'
      )

      return result.rows.map(row => ({
        version: row.version as number,
        name: row.name as string,
        appliedAt: row.applied_at as number
      }))
    } catch {
      return []
    } finally {
      client.close()
    }
  }

  /**
   * Run migrations with progress tracking
   */
  async runMigrations(migrations: Migration[]): Promise<void> {
    const client = createClient({ url: `file:${this.dbPath}` })

    try {
      // Create migrations table if it doesn't exist
      await client.execute(`
        CREATE TABLE IF NOT EXISTS migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL
        )
      `)

      // Get applied migrations
      const result = await client.execute('SELECT version FROM migrations ORDER BY version')
      const appliedVersions = new Set(result.rows.map((row: any) => row.version))

      const pendingMigrations = migrations
        .filter(m => !appliedVersions.has(m.version))
        .sort((a, b) => a.version - b.version)

      if (pendingMigrations.length === 0) {
        console.log('[MigrationRunner] No pending migrations')
        return
      }

      console.log(`[MigrationRunner] Running ${pendingMigrations.length} migrations`)

      // Apply pending migrations
      for (let i = 0; i < pendingMigrations.length; i++) {
        const migration = pendingMigrations[i]

        this.emit('progress', {
          current: i + 1,
          total: pendingMigrations.length,
          migration: migration.name,
          version: migration.version
        })

        console.log(`[MigrationRunner] Applying migration ${migration.version}: ${migration.name}`)

        await migration.up(client)

        await client.execute({
          sql: 'INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)',
          args: [migration.version, migration.name, Date.now()]
        })

        console.log(`[MigrationRunner] Migration ${migration.version} applied successfully`)
      }

      this.emit('complete', { count: pendingMigrations.length })
      console.log('[MigrationRunner] All migrations completed')
    } catch (error) {
      this.emit('error', error)
      console.error('[MigrationRunner] Error running migrations:', error)
      throw error
    } finally {
      client.close()
    }
  }

  /**
   * Rollback to a specific version
   */
  async rollbackTo(targetVersion: number, migrations: Migration[]): Promise<void> {
    const client = createClient({ url: `file:${this.dbPath}` })

    try {
      const result = await client.execute(
        'SELECT version FROM migrations WHERE version > ? ORDER BY version DESC',
        [targetVersion]
      )

      const versionsToRollback = result.rows.map(row => row.version as number)

      for (const version of versionsToRollback) {
        const migration = migrations.find(m => m.version === version)

        if (!migration) {
          throw new Error(`Migration ${version} not found`)
        }

        if (!migration.down) {
          throw new Error(`Migration ${version} does not have a down function`)
        }

        console.log(`[MigrationRunner] Rolling back migration ${version}: ${migration.name}`)

        await migration.down(client)

        await client.execute({
          sql: 'DELETE FROM migrations WHERE version = ?',
          args: [version]
        })

        console.log(`[MigrationRunner] Migration ${version} rolled back successfully`)
      }
    } catch (error) {
      console.error('[MigrationRunner] Error rolling back migrations:', error)
      throw error
    } finally {
      client.close()
    }
  }
}

/**
 * Migration to add performance indexes
 */
export const addPerformanceIndexes: Migration = {
  version: 1,
  name: 'add_performance_indexes',
  up: async (db: any) => {
    // Add indexes for download_tasks table
    await db.run(`
      CREATE INDEX IF NOT EXISTS idx_tasks_status
      ON download_tasks(status)
    `)

    await db.run(`
      CREATE INDEX IF NOT EXISTS idx_tasks_created
      ON download_tasks(created_at)
    `)

    await db.run(`
      CREATE INDEX IF NOT EXISTS idx_tasks_priority
      ON download_tasks(priority)
    `)

    await db.run(`
      CREATE INDEX IF NOT EXISTS idx_tasks_status_priority
      ON download_tasks(status, priority)
    `)

    // Add indexes for download_chunks table
    await db.run(`
      CREATE INDEX IF NOT EXISTS idx_chunks_task
      ON download_chunks(task_id)
    `)

    await db.run(`
      CREATE INDEX IF NOT EXISTS idx_chunks_task_index
      ON download_chunks(task_id, index)
    `)

    // Add indexes for download_history table
    await db.run(`
      CREATE INDEX IF NOT EXISTS idx_history_created
      ON download_history(created_at)
    `)

    await db.run(`
      CREATE INDEX IF NOT EXISTS idx_history_completed
      ON download_history(completed_at)
    `)

    console.log('[Migration] Performance indexes added successfully')
  },
  down: async (db: any) => {
    // Drop indexes if needed
    await db.run('DROP INDEX IF EXISTS idx_tasks_status')
    await db.run('DROP INDEX IF EXISTS idx_tasks_created')
    await db.run('DROP INDEX IF EXISTS idx_tasks_priority')
    await db.run('DROP INDEX IF EXISTS idx_tasks_status_priority')
    await db.run('DROP INDEX IF EXISTS idx_chunks_task')
    await db.run('DROP INDEX IF EXISTS idx_chunks_task_index')
    await db.run('DROP INDEX IF EXISTS idx_history_created')
    await db.run('DROP INDEX IF EXISTS idx_history_completed')

    console.log('[Migration] Performance indexes removed')
  }
}

/**
 * Run migrations
 */
export async function runMigrations(dbPath: string, migrations: Migration[]): Promise<void> {
  const client = createClient({
    url: `file:${dbPath}`
  })

  try {
    // Create migrations table if it doesn't exist
    await client.execute(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      )
    `)

    // Get applied migrations
    const result = await client.execute('SELECT version FROM migrations ORDER BY version')
    const appliedVersions = new Set(result.rows.map((row: any) => row.version))

    // Apply pending migrations
    for (const migration of migrations.sort((a, b) => a.version - b.version)) {
      if (!appliedVersions.has(migration.version)) {
        console.log(`[Migration] Applying migration ${migration.version}: ${migration.name}`)

        await migration.up(client)

        await client.execute({
          sql: 'INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)',
          args: [migration.version, migration.name, Date.now()]
        })

        console.log(`[Migration] Migration ${migration.version} applied successfully`)
      }
    }

    console.log('[Migration] All migrations completed')
  } catch (error) {
    console.error('[Migration] Error running migrations:', error)
    throw error
  } finally {
    client.close()
  }
}

/**
 * Migration to add checksum field
 */
export const addChecksumField: Migration = {
  version: 2,
  name: 'add_checksum_field',
  description: 'Add checksum field to download_tasks table for file verification',
  up: async (db: any) => {
    // Check if column already exists
    const tableInfo = await db.execute('PRAGMA table_info(download_tasks)')
    const hasChecksum = tableInfo.rows.some((row: any) => row.name === 'checksum')

    if (!hasChecksum) {
      await db.execute('ALTER TABLE download_tasks ADD COLUMN checksum TEXT')
      console.log('[Migration] Added checksum field to download_tasks')
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  down: async (_db: any) => {
    // SQLite doesn't support DROP COLUMN easily, so we'd need to recreate the table
    console.log('[Migration] Checksum field removal not implemented (SQLite limitation)')
  }
}

/**
 * Migration to add metadata field
 */
export const addMetadataField: Migration = {
  version: 3,
  name: 'add_metadata_field',
  description: 'Add metadata field to download_tasks for storing additional information',
  up: async (db: any) => {
    const tableInfo = await db.execute('PRAGMA table_info(download_tasks)')
    const hasMetadata = tableInfo.rows.some((row: any) => row.name === 'metadata')

    if (!hasMetadata) {
      await db.execute('ALTER TABLE download_tasks ADD COLUMN metadata TEXT')
      console.log('[Migration] Added metadata field to download_tasks')
    }
  }
}

/**
 * Migration to add error field
 */
export const addErrorField: Migration = {
  version: 4,
  name: 'add_error_field',
  description: 'Add error field to download_tasks for storing error messages',
  up: async (db: any) => {
    const tableInfo = await db.execute('PRAGMA table_info(download_tasks)')
    const hasError = tableInfo.rows.some((row: any) => row.name === 'error')

    if (!hasError) {
      await db.execute('ALTER TABLE download_tasks ADD COLUMN error TEXT')
      console.log('[Migration] Added error field to download_tasks')
    }
  }
}

/**
 * All available migrations in order
 */
export const allMigrations: Migration[] = [
  addPerformanceIndexes,
  addChecksumField,
  addMetadataField,
  addErrorField
]

/**
 * Rollback a specific migration
 */
export async function rollbackMigration(
  dbPath: string,
  migration: Migration
): Promise<void> {
  if (!migration.down) {
    throw new Error(`Migration ${migration.version} does not have a down function`)
  }

  const client = createClient({
    url: `file:${dbPath}`
  })

  try {
    console.log(`[Migration] Rolling back migration ${migration.version}: ${migration.name}`)

    await migration.down(client)

    await client.execute({
      sql: 'DELETE FROM migrations WHERE version = ?',
      args: [migration.version]
    })

    console.log(`[Migration] Migration ${migration.version} rolled back successfully`)
  } catch (error) {
    console.error('[Migration] Error rolling back migration:', error)
    throw error
  } finally {
    client.close()
  }
}
