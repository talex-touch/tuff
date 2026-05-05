/**
 * Database migration utilities for download center
 */

import { EventEmitter } from 'node:events'
import { createClient } from '@libsql/client'
import { downloadMigrationLog, downloadMigrationRunnerLog } from './logger'

type LibSqlClient = ReturnType<typeof createClient>
type LibSqlRow = Record<string, unknown>

const getRowNumber = (row: LibSqlRow, key: string): number => {
  const value = row[key]
  return typeof value === 'number' ? value : Number(value ?? 0)
}

const getRowString = (row: LibSqlRow, key: string): string => {
  const value = row[key]
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  return String(value)
}

export interface Migration {
  version: number
  name: string
  description?: string
  up: (db: LibSqlClient) => Promise<void>
  down?: (db: LibSqlClient) => Promise<void>
}

export interface MigrationStatus {
  version: number
  name: string
  appliedAt: number
}

type MigrationLogMeta = Record<string, string | number | boolean | null | undefined>

const getMigrationMeta = (
  migration: Pick<Migration, 'version' | 'name'>,
  meta: MigrationLogMeta = {}
): MigrationLogMeta => ({
  version: migration.version,
  migration: migration.name,
  ...meta
})

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
      const result = await client.execute('SELECT MAX(version) as version FROM migrations')
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

      return result.rows.map((row) => ({
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
      const appliedVersions = new Set(
        result.rows.map((row) => getRowNumber(row as LibSqlRow, 'version'))
      )

      const pendingMigrations = migrations
        .filter((m) => !appliedVersions.has(m.version))
        .sort((a, b) => a.version - b.version)

      if (pendingMigrations.length === 0) {
        downloadMigrationRunnerLog.info('No pending migrations', {
          meta: { dbPath: this.dbPath }
        })
        return
      }

      downloadMigrationRunnerLog.info('Running pending migrations', {
        meta: {
          dbPath: this.dbPath,
          count: pendingMigrations.length
        }
      })

      // Apply pending migrations
      for (let i = 0; i < pendingMigrations.length; i++) {
        const migration = pendingMigrations[i]

        this.emit('progress', {
          current: i + 1,
          total: pendingMigrations.length,
          migration: migration.name,
          version: migration.version
        })

        downloadMigrationRunnerLog.info('Applying migration', {
          meta: getMigrationMeta(migration, {
            dbPath: this.dbPath,
            current: i + 1,
            total: pendingMigrations.length
          })
        })

        await migration.up(client)

        await client.execute({
          sql: 'INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)',
          args: [migration.version, migration.name, Date.now()]
        })

        downloadMigrationRunnerLog.success('Migration applied', {
          meta: getMigrationMeta(migration, { dbPath: this.dbPath })
        })
      }

      this.emit('complete', { count: pendingMigrations.length })
      downloadMigrationRunnerLog.success('All migrations completed', {
        meta: {
          dbPath: this.dbPath,
          count: pendingMigrations.length
        }
      })
    } catch (error) {
      this.emit('error', error)
      downloadMigrationRunnerLog.error('Failed to run migrations', {
        error,
        meta: { dbPath: this.dbPath }
      })
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

      const versionsToRollback = result.rows.map((row) => row.version as number)

      for (const version of versionsToRollback) {
        const migration = migrations.find((m) => m.version === version)

        if (!migration) {
          throw new Error(`Migration ${version} not found`)
        }

        if (!migration.down) {
          throw new Error(`Migration ${version} does not have a down function`)
        }

        downloadMigrationRunnerLog.warn('Rolling back migration', {
          meta: getMigrationMeta(migration, {
            dbPath: this.dbPath,
            targetVersion
          })
        })

        await migration.down(client)

        await client.execute({
          sql: 'DELETE FROM migrations WHERE version = ?',
          args: [version]
        })

        downloadMigrationRunnerLog.success('Migration rolled back', {
          meta: getMigrationMeta(migration, {
            dbPath: this.dbPath,
            targetVersion
          })
        })
      }
    } catch (error) {
      downloadMigrationRunnerLog.error('Failed to rollback migrations', {
        error,
        meta: {
          dbPath: this.dbPath,
          targetVersion
        }
      })
      throw error
    } finally {
      client.close()
    }
  }
}

/**
 * Migration to create base database tables
 */
export const createBaseTables: Migration = {
  version: 0,
  name: 'create_base_tables',
  description: 'Create download_tasks, download_chunks, and download_history tables',
  up: async (db: LibSqlClient) => {
    // Create download_tasks table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS download_tasks (
        id TEXT PRIMARY KEY NOT NULL,
        url TEXT NOT NULL,
        destination TEXT NOT NULL,
        filename TEXT NOT NULL,
        priority INTEGER NOT NULL,
        module TEXT NOT NULL,
        status TEXT NOT NULL,
        total_size INTEGER,
        downloaded_size INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER
      )
    `)

    // Create download_chunks table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS download_chunks (
        id TEXT PRIMARY KEY NOT NULL,
        task_id TEXT NOT NULL,
        "index" INTEGER NOT NULL,
        start INTEGER NOT NULL,
        "end" INTEGER NOT NULL,
        size INTEGER NOT NULL,
        downloaded INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        file_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES download_tasks(id)
      )
    `)

    // Create download_history table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS download_history (
        id TEXT PRIMARY KEY NOT NULL,
        task_id TEXT NOT NULL,
        url TEXT NOT NULL,
        filename TEXT NOT NULL,
        module TEXT NOT NULL,
        status TEXT NOT NULL,
        total_size INTEGER,
        downloaded_size INTEGER,
        duration INTEGER,
        average_speed INTEGER,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      )
    `)

    downloadMigrationLog.debug('Created base tables', {
      meta: getMigrationMeta(createBaseTables)
    })
  },
  down: async (db: LibSqlClient) => {
    // Drop tables in reverse order due to foreign key constraints
    await db.execute('DROP TABLE IF EXISTS download_history')
    await db.execute('DROP TABLE IF EXISTS download_chunks')
    await db.execute('DROP TABLE IF EXISTS download_tasks')
    downloadMigrationLog.debug('Dropped base tables', {
      meta: getMigrationMeta(createBaseTables)
    })
  }
}

/**
 * Migration to add performance indexes
 */
export const addPerformanceIndexes: Migration = {
  version: 1,
  name: 'add_performance_indexes',
  up: async (db: LibSqlClient) => {
    // Check if download_tasks table exists before creating indexes
    const tablesResult = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('download_tasks', 'download_chunks', 'download_history')"
    )
    const existingTables = new Set(
      tablesResult.rows.map((row) => getRowString(row as LibSqlRow, 'name'))
    )

    // Add indexes for download_tasks table (if exists)
    if (existingTables.has('download_tasks')) {
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_tasks_status
        ON download_tasks(status)
      `)

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_tasks_created
        ON download_tasks(created_at)
      `)

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_tasks_priority
        ON download_tasks(priority)
      `)

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_tasks_status_priority
        ON download_tasks(status, priority)
      `)
      downloadMigrationLog.debug('Added indexes for download_tasks', {
        meta: getMigrationMeta(addPerformanceIndexes)
      })
    } else {
      downloadMigrationLog.debug('Skip download_tasks indexes: table missing', {
        meta: getMigrationMeta(addPerformanceIndexes)
      })
    }

    // Add indexes for download_chunks table (if exists)
    if (existingTables.has('download_chunks')) {
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_chunks_task
        ON download_chunks(task_id)
      `)

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_chunks_task_index
        ON download_chunks(task_id, "index")
      `)
      downloadMigrationLog.debug('Added indexes for download_chunks', {
        meta: getMigrationMeta(addPerformanceIndexes)
      })
    } else {
      downloadMigrationLog.debug('Skip download_chunks indexes: table missing', {
        meta: getMigrationMeta(addPerformanceIndexes)
      })
    }

    // Add indexes for download_history table (if exists)
    if (existingTables.has('download_history')) {
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_history_created
        ON download_history(created_at)
      `)

      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_history_completed
        ON download_history(completed_at)
      `)
      downloadMigrationLog.debug('Added indexes for download_history', {
        meta: getMigrationMeta(addPerformanceIndexes)
      })
    } else {
      downloadMigrationLog.debug('Skip download_history indexes: table missing', {
        meta: getMigrationMeta(addPerformanceIndexes)
      })
    }

    downloadMigrationLog.info('Performance indexes migration completed', {
      meta: getMigrationMeta(addPerformanceIndexes)
    })
  },
  down: async (db: LibSqlClient) => {
    // Drop indexes if needed
    await db.execute('DROP INDEX IF EXISTS idx_tasks_status')
    await db.execute('DROP INDEX IF EXISTS idx_tasks_created')
    await db.execute('DROP INDEX IF EXISTS idx_tasks_priority')
    await db.execute('DROP INDEX IF EXISTS idx_tasks_status_priority')
    await db.execute('DROP INDEX IF EXISTS idx_chunks_task')
    await db.execute('DROP INDEX IF EXISTS idx_chunks_task_index')
    await db.execute('DROP INDEX IF EXISTS idx_history_created')
    await db.execute('DROP INDEX IF EXISTS idx_history_completed')

    downloadMigrationLog.info('Performance indexes removed', {
      meta: getMigrationMeta(addPerformanceIndexes)
    })
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
    const appliedVersions = new Set(
      result.rows.map((row) => getRowNumber(row as LibSqlRow, 'version'))
    )

    // Apply pending migrations
    for (const migration of migrations.sort((a, b) => a.version - b.version)) {
      if (!appliedVersions.has(migration.version)) {
        downloadMigrationLog.info('Applying migration', {
          meta: getMigrationMeta(migration, { dbPath })
        })

        await migration.up(client)

        await client.execute({
          sql: 'INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)',
          args: [migration.version, migration.name, Date.now()]
        })

        downloadMigrationLog.success('Migration applied', {
          meta: getMigrationMeta(migration, { dbPath })
        })
      }
    }

    downloadMigrationLog.success('All migrations completed', {
      meta: { dbPath }
    })
  } catch (error) {
    downloadMigrationLog.error('Failed to run migrations', {
      error,
      meta: { dbPath }
    })
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
  up: async (db: LibSqlClient) => {
    // Check if column already exists
    const tableInfo = await db.execute('PRAGMA table_info(download_tasks)')
    const hasChecksum = tableInfo.rows.some(
      (row) => getRowString(row as LibSqlRow, 'name') === 'checksum'
    )

    if (!hasChecksum) {
      await db.execute('ALTER TABLE download_tasks ADD COLUMN checksum TEXT')
      downloadMigrationLog.info('Added checksum field to download_tasks', {
        meta: getMigrationMeta(addChecksumField)
      })
    }
  },

  down: async (_db: LibSqlClient) => {
    // One-way migration by design: SQLite would require full table recreation for DROP COLUMN.
    downloadMigrationLog.debug('Skip checksum field rollback (one-way migration)', {
      meta: getMigrationMeta(addChecksumField)
    })
  }
}

/**
 * Migration to add metadata field
 */
export const addMetadataField: Migration = {
  version: 3,
  name: 'add_metadata_field',
  description: 'Add metadata field to download_tasks for storing additional information',
  up: async (db: LibSqlClient) => {
    const tableInfo = await db.execute('PRAGMA table_info(download_tasks)')
    const hasMetadata = tableInfo.rows.some(
      (row) => getRowString(row as LibSqlRow, 'name') === 'metadata'
    )

    if (!hasMetadata) {
      await db.execute('ALTER TABLE download_tasks ADD COLUMN metadata TEXT')
      downloadMigrationLog.info('Added metadata field to download_tasks', {
        meta: getMigrationMeta(addMetadataField)
      })
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
  up: async (db: LibSqlClient) => {
    const tableInfo = await db.execute('PRAGMA table_info(download_tasks)')
    const hasError = tableInfo.rows.some(
      (row) => getRowString(row as LibSqlRow, 'name') === 'error'
    )

    if (!hasError) {
      await db.execute('ALTER TABLE download_tasks ADD COLUMN error TEXT')
      downloadMigrationLog.info('Added error field to download_tasks', {
        meta: getMigrationMeta(addErrorField)
      })
    }
  }
}

/**
 * All available migrations in order
 */
export const allMigrations: Migration[] = [
  createBaseTables,
  addPerformanceIndexes,
  addChecksumField,
  addMetadataField,
  addErrorField
]

/**
 * Rollback a specific migration
 */
export async function rollbackMigration(dbPath: string, migration: Migration): Promise<void> {
  if (!migration.down) {
    throw new Error(`Migration ${migration.version} does not have a down function`)
  }

  const client = createClient({
    url: `file:${dbPath}`
  })

  try {
    downloadMigrationLog.warn('Rolling back migration', {
      meta: getMigrationMeta(migration, { dbPath })
    })

    await migration.down(client)

    await client.execute({
      sql: 'DELETE FROM migrations WHERE version = ?',
      args: [migration.version]
    })

    downloadMigrationLog.success('Migration rolled back', {
      meta: getMigrationMeta(migration, { dbPath })
    })
  } catch (error) {
    downloadMigrationLog.error('Failed to rollback migration', {
      error,
      meta: getMigrationMeta(migration, { dbPath })
    })
    throw error
  } finally {
    client.close()
  }
}
