/**
 * Migration Manager - Handles data migration from old systems
 */

import { createClient } from '@libsql/client'
import { EventEmitter } from 'events'
import fs from 'fs/promises'
import path from 'path'
import { app } from 'electron'
import type { DownloadTask, DownloadHistory } from './schema'
import { DownloadStatus } from '@talex-touch/utils'

export interface MigrationProgress {
  phase: 'scanning' | 'migrating' | 'validating' | 'complete' | 'error'
  current: number
  total: number
  message: string
  percentage: number
}

export interface OldDownloadRecord {
  id?: string
  url: string
  path?: string
  name?: string
  filename?: string
  status?: string
  size?: number
  downloaded?: number
  createdAt?: number
  completedAt?: number
  error?: string
}

export interface OldUpdateConfig {
  autoCheck?: boolean
  autoDownload?: boolean
  checkFrequency?: string
  ignoredVersions?: string[]
}

export interface MigrationResult {
  success: boolean
  migratedTasks: number
  migratedHistory: number
  migratedConfig: boolean
  errors: string[]
  duration: number
}

export class MigrationManager extends EventEmitter {
  private dbPath: string
  // private oldDataPath: string
  private migrationInProgress = false

  constructor(dbPath: string) {
    super()
    this.dbPath = dbPath
    // this.oldDataPath = path.join(app.getPath('userData'), 'old_downloads')
  }

  /**
   * Check if migration is needed
   */
  async needsMigration(): Promise<boolean> {
    try {
      // Check if old data exists
      const oldDbPath = path.join(app.getPath('userData'), 'downloads.db')
      const oldConfigPath = path.join(app.getPath('userData'), 'download-config.json')

      const [oldDbExists, oldConfigExists] = await Promise.all([
        this.fileExists(oldDbPath),
        this.fileExists(oldConfigPath)
      ])

      // Check if migration has already been completed
      const migrationCompleted = await this.isMigrationCompleted()

      return (oldDbExists || oldConfigExists) && !migrationCompleted
    } catch (error) {
      console.error('[MigrationManager] Error checking migration status:', error)
      return false
    }
  }

  /**
   * Run full migration process
   */
  async migrate(): Promise<MigrationResult> {
    if (this.migrationInProgress) {
      throw new Error('Migration already in progress')
    }

    this.migrationInProgress = true
    const startTime = Date.now()
    const result: MigrationResult = {
      success: false,
      migratedTasks: 0,
      migratedHistory: 0,
      migratedConfig: false,
      errors: [],
      duration: 0
    }

    try {
      this.emitProgress({
        phase: 'scanning',
        current: 0,
        total: 100,
        message: 'Scanning for old data...',
        percentage: 0
      })

      // Step 1: Migrate old download tasks
      const tasks = await this.migrateDownloadTasks()
      result.migratedTasks = tasks.length

      this.emitProgress({
        phase: 'migrating',
        current: 33,
        total: 100,
        message: `Migrated ${tasks.length} download tasks`,
        percentage: 33
      })

      // Step 2: Migrate download history
      const history = await this.migrateDownloadHistory()
      result.migratedHistory = history.length

      this.emitProgress({
        phase: 'migrating',
        current: 66,
        total: 100,
        message: `Migrated ${history.length} history records`,
        percentage: 66
      })

      // Step 3: Migrate configuration
      const configMigrated = await this.migrateConfiguration()
      result.migratedConfig = configMigrated

      this.emitProgress({
        phase: 'validating',
        current: 90,
        total: 100,
        message: 'Validating migrated data...',
        percentage: 90
      })

      // Step 4: Validate migration
      await this.validateMigration()

      // Step 5: Mark migration as complete
      await this.markMigrationComplete()

      result.success = true
      result.duration = Date.now() - startTime

      this.emitProgress({
        phase: 'complete',
        current: 100,
        total: 100,
        message: 'Migration completed successfully',
        percentage: 100
      })

      console.log('[MigrationManager] Migration completed:', result)
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error))
      result.duration = Date.now() - startTime

      this.emitProgress({
        phase: 'error',
        current: 0,
        total: 100,
        message: `Migration failed: ${error instanceof Error ? error.message : String(error)}`,
        percentage: 0
      })

      console.error('[MigrationManager] Migration failed:', error)
    } finally {
      this.migrationInProgress = false
    }

    return result
  }

  /**
   * Migrate old download tasks
   */
  private async migrateDownloadTasks(): Promise<DownloadTask[]> {
    const oldDbPath = path.join(app.getPath('userData'), 'downloads.db')

    if (!(await this.fileExists(oldDbPath))) {
      console.log('[MigrationManager] No old download database found')
      return []
    }

    const oldClient = createClient({ url: `file:${oldDbPath}` })
    const newClient = createClient({ url: `file:${this.dbPath}` })
    const migratedTasks: DownloadTask[] = []

    try {
      // Read old tasks
      const result = await oldClient.execute('SELECT * FROM downloads')

      for (const row of result.rows) {
        const oldRecord = row as unknown as OldDownloadRecord

        // Convert old format to new format
        const newTask: DownloadTask = {
          id: oldRecord.id || this.generateId(),
          url: oldRecord.url,
          destination: oldRecord.path || path.join(app.getPath('downloads'), oldRecord.filename || 'unknown'),
          filename: oldRecord.filename || oldRecord.name || 'unknown',
          priority: 5, // Default priority
          module: 'legacy',
          status: this.mapOldStatus(oldRecord.status),
          totalSize: oldRecord.size || null,
          downloadedSize: oldRecord.downloaded || 0,
          checksum: null,
          metadata: null,
          createdAt: oldRecord.createdAt || Date.now(),
          updatedAt: Date.now(),
          completedAt: oldRecord.completedAt || null,
          error: oldRecord.error || null
        }

        // Insert into new database
        await newClient.execute({
          sql: `INSERT INTO download_tasks (
            id, url, destination, filename, priority, module, status,
            total_size, downloaded_size, checksum, metadata,
            created_at, updated_at, completed_at, error
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            newTask.id,
            newTask.url,
            newTask.destination,
            newTask.filename,
            newTask.priority,
            newTask.module,
            newTask.status,
            newTask.totalSize,
            newTask.downloadedSize,
            newTask.checksum,
            newTask.metadata,
            newTask.createdAt,
            newTask.updatedAt,
            newTask.completedAt,
            newTask.error
          ]
        })

        migratedTasks.push(newTask)
      }

      console.log(`[MigrationManager] Migrated ${migratedTasks.length} download tasks`)
    } catch (error) {
      console.error('[MigrationManager] Error migrating download tasks:', error)
      throw error
    } finally {
      oldClient.close()
      newClient.close()
    }

    return migratedTasks
  }

  /**
   * Migrate download history
   */
  private async migrateDownloadHistory(): Promise<DownloadHistory[]> {
    const oldDbPath = path.join(app.getPath('userData'), 'downloads.db')

    if (!(await this.fileExists(oldDbPath))) {
      return []
    }

    const oldClient = createClient({ url: `file:${oldDbPath}` })
    const newClient = createClient({ url: `file:${this.dbPath}` })
    const migratedHistory: DownloadHistory[] = []

    try {
      // Check if history table exists in old database
      const tableCheck = await oldClient.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='download_history'"
      )

      if (tableCheck.rows.length === 0) {
        console.log('[MigrationManager] No old history table found')
        return []
      }

      const result = await oldClient.execute('SELECT * FROM download_history')

      for (const row of result.rows) {
        const oldRecord = row as unknown as OldDownloadRecord

        const newHistory: DownloadHistory = {
          id: `${oldRecord.id || this.generateId()}_history`,
          taskId: oldRecord.id || this.generateId(),
          url: oldRecord.url,
          filename: oldRecord.filename || oldRecord.name || 'unknown',
          module: 'legacy',
          status: this.mapOldStatus(oldRecord.status),
          totalSize: oldRecord.size || null,
          downloadedSize: oldRecord.downloaded || null,
          duration: oldRecord.completedAt && oldRecord.createdAt
            ? Math.round((oldRecord.completedAt - oldRecord.createdAt) / 1000)
            : null,
          averageSpeed: null,
          createdAt: oldRecord.createdAt || Date.now(),
          completedAt: oldRecord.completedAt || null
        }

        await newClient.execute({
          sql: `INSERT INTO download_history (
            id, task_id, url, filename, module, status,
            total_size, downloaded_size, duration, average_speed,
            created_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            newHistory.id,
            newHistory.taskId,
            newHistory.url,
            newHistory.filename,
            newHistory.module,
            newHistory.status,
            newHistory.totalSize,
            newHistory.downloadedSize,
            newHistory.duration,
            newHistory.averageSpeed,
            newHistory.createdAt,
            newHistory.completedAt
          ]
        })

        migratedHistory.push(newHistory)
      }

      console.log(`[MigrationManager] Migrated ${migratedHistory.length} history records`)
    } catch (error) {
      console.error('[MigrationManager] Error migrating history:', error)
      // Don't throw - history migration is not critical
    } finally {
      oldClient.close()
      newClient.close()
    }

    return migratedHistory
  }

  /**
   * Migrate configuration files
   */
  private async migrateConfiguration(): Promise<boolean> {
    const oldConfigPath = path.join(app.getPath('userData'), 'download-config.json')
    const newConfigPath = path.join(app.getPath('userData'), 'config.json')

    try {
      if (!(await this.fileExists(oldConfigPath))) {
        console.log('[MigrationManager] No old configuration found')
        return false
      }

      // Read old config
      const oldConfigData = await fs.readFile(oldConfigPath, 'utf-8')
      const oldConfig = JSON.parse(oldConfigData) as OldUpdateConfig

      // Read or create new config
      let newConfig: any = {}
      if (await this.fileExists(newConfigPath)) {
        const newConfigData = await fs.readFile(newConfigPath, 'utf-8')
        newConfig = JSON.parse(newConfigData)
      }

      // Merge configurations
      newConfig.download = {
        ...newConfig.download,
        concurrency: {
          maxConcurrent: 3,
          autoAdjust: true,
          networkAware: true,
          priorityBased: true
        },
        chunk: {
          size: 1048576, // 1MB
          resume: true,
          autoRetry: true,
          maxRetries: 3
        },
        storage: {
          tempDir: path.join(app.getPath('temp'), 'tuff-downloads'),
          historyRetention: 30,
          autoCleanup: true
        },
        network: {
          timeout: 30000,
          retryDelay: 5000,
          maxRetries: 3
        }
      }

      newConfig.update = {
        ...newConfig.update,
        enabled: true,
        autoCheck: oldConfig.autoCheck ?? true,
        autoDownload: oldConfig.autoDownload ?? false,
        checkFrequency: oldConfig.checkFrequency || 'startup',
        ignoredVersions: oldConfig.ignoredVersions || [],
        updateSource: {
          type: 'github',
          url: undefined
        }
      }

      // Save new config
      await fs.writeFile(newConfigPath, JSON.stringify(newConfig, null, 2), 'utf-8')

      console.log('[MigrationManager] Configuration migrated successfully')
      return true
    } catch (error) {
      console.error('[MigrationManager] Error migrating configuration:', error)
      return false
    }
  }

  /**
   * Validate migrated data
   */
  private async validateMigration(): Promise<void> {
    const client = createClient({ url: `file:${this.dbPath}` })

    try {
      // Check if tables exist
      const tables = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
      )

      const tableNames = tables.rows.map(row => row.name)
      const requiredTables = ['download_tasks', 'download_chunks', 'download_history']

      for (const table of requiredTables) {
        if (!tableNames.includes(table)) {
          throw new Error(`Required table ${table} not found`)
        }
      }

      // Check if data was migrated
      const taskCount = await client.execute('SELECT COUNT(*) as count FROM download_tasks')
      console.log(`[MigrationManager] Validation: ${taskCount.rows[0].count} tasks in database`)

      console.log('[MigrationManager] Validation completed successfully')
    } catch (error) {
      console.error('[MigrationManager] Validation failed:', error)
      throw error
    } finally {
      client.close()
    }
  }

  /**
   * Mark migration as complete
   */
  private async markMigrationComplete(): Promise<void> {
    const client = createClient({ url: `file:${this.dbPath}` })

    try {
      // Create migration tracking table if it doesn't exist
      await client.execute(`
        CREATE TABLE IF NOT EXISTS migration_status (
          id INTEGER PRIMARY KEY,
          completed_at INTEGER NOT NULL,
          version TEXT NOT NULL
        )
      `)

      // Insert completion record
      await client.execute({
        sql: 'INSERT INTO migration_status (id, completed_at, version) VALUES (?, ?, ?)',
        args: [1, Date.now(), '1.0.0']
      })

      console.log('[MigrationManager] Migration marked as complete')
    } catch (error) {
      console.error('[MigrationManager] Error marking migration complete:', error)
      throw error
    } finally {
      client.close()
    }
  }

  /**
   * Check if migration has been completed
   */
  private async isMigrationCompleted(): Promise<boolean> {
    const client = createClient({ url: `file:${this.dbPath}` })

    try {
      const result = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='migration_status'"
      )

      if (result.rows.length === 0) {
        return false
      }

      const status = await client.execute('SELECT * FROM migration_status WHERE id = 1')
      return status.rows.length > 0
    } catch (error) {
      return false
    } finally {
      client.close()
    }
  }

  /**
   * Helper: Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Helper: Map old status to new status
   */
  private mapOldStatus(oldStatus?: string): DownloadStatus {
    if (!oldStatus) return DownloadStatus.PENDING

    const statusMap: Record<string, DownloadStatus> = {
      'pending': DownloadStatus.PENDING,
      'downloading': DownloadStatus.DOWNLOADING,
      'paused': DownloadStatus.PAUSED,
      'completed': DownloadStatus.COMPLETED,
      'failed': DownloadStatus.FAILED,
      'cancelled': DownloadStatus.CANCELLED
    }

    return statusMap[oldStatus.toLowerCase()] || DownloadStatus.PENDING
  }

  /**
   * Helper: Generate unique ID
   */
  private generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Helper: Emit progress event
   */
  private emitProgress(progress: MigrationProgress): void {
    this.emit('progress', progress)
  }
}
