import { eq, desc, and, lt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import {
  downloadTasksSchema,
  downloadChunksSchema,
  downloadHistorySchema,
  type DownloadTask,
  type DownloadChunk,
  type DownloadHistory,
  type NewDownloadTask,
  type NewDownloadChunk,
  type NewDownloadHistory
} from './schema'
import { DownloadStatus, ChunkStatus } from '@talex-touch/utils'
import { runMigrations, addPerformanceIndexes } from './migrations'
import { PerformanceMonitor } from './performance-monitor'
import fs from 'fs'

export class DatabaseService {
  private db: ReturnType<typeof drizzle>
  private dbPath: string
  private initialized = false
  private performanceMonitor = new PerformanceMonitor()

  constructor(dbPath: string) {
    this.dbPath = dbPath
    const client = createClient({
      url: `file:${dbPath}`
    })
    this.db = drizzle(client)
  }

  /**
   * Get performance monitor instance
   */
  getPerformanceMonitor(): PerformanceMonitor {
    return this.performanceMonitor
  }

  /**
   * Initialize database and run migrations
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      // Run migrations to add performance indexes
      await runMigrations(this.dbPath, [addPerformanceIndexes])
      this.initialized = true
      console.log('[DatabaseService] Initialized successfully')
    } catch (error) {
      console.error('[DatabaseService] Initialization failed:', error)
      // Don't throw - allow the app to continue even if migrations fail
    }
  }

  // 保存下载任务
  async saveTask(task: NewDownloadTask): Promise<void> {
    await this.db.insert(downloadTasksSchema).values(task)
  }

  // 更新任务状态
  async updateTaskStatus(taskId: string, status: DownloadStatus): Promise<void> {
    await this.db
      .update(downloadTasksSchema)
      .set({
        status,
        updatedAt: Date.now(),
        completedAt: status === DownloadStatus.COMPLETED ? Date.now() : undefined
      })
      .where(eq(downloadTasksSchema.id, taskId))
  }

  // 更新下载进度
  async updateProgress(taskId: string, downloadedSize: number, totalSize?: number): Promise<void> {
    await this.db
      .update(downloadTasksSchema)
      .set({
        downloadedSize,
        totalSize,
        updatedAt: Date.now()
      })
      .where(eq(downloadTasksSchema.id, taskId))
  }

  // 更新任务错误信息
  async updateTaskError(taskId: string, error: string): Promise<void> {
    await this.db
      .update(downloadTasksSchema)
      .set({
        error,
        updatedAt: Date.now()
      })
      .where(eq(downloadTasksSchema.id, taskId))
  }

  // 获取任务
  async getTask(taskId: string): Promise<DownloadTask | undefined> {
    const result = await this.db
      .select()
      .from(downloadTasksSchema)
      .where(eq(downloadTasksSchema.id, taskId))
      .limit(1)

    return result[0]
  }

  // 获取所有任务
  async getAllTasks(): Promise<DownloadTask[]> {
    return await this.performanceMonitor.measure(
      'db_get_all_tasks',
      async () => {
        return await this.db
          .select()
          .from(downloadTasksSchema)
          .orderBy(desc(downloadTasksSchema.createdAt))
      }
    )
  }

  // 获取进行中的任务
  async getActiveTasks(): Promise<DownloadTask[]> {
    return await this.db
      .select()
      .from(downloadTasksSchema)
      .where(
        and(
          eq(downloadTasksSchema.status, DownloadStatus.DOWNLOADING),
          eq(downloadTasksSchema.status, DownloadStatus.PENDING)
        )
      )
      .orderBy(desc(downloadTasksSchema.priority))
  }

  // 保存切片信息
  async saveChunks(_taskId: string, chunks: NewDownloadChunk[]): Promise<void> {
    await this.db.insert(downloadChunksSchema).values(chunks)
  }

  // 更新切片状态
  async updateChunkStatus(
    chunkId: string,
    status: ChunkStatus,
    downloaded?: number
  ): Promise<void> {
    const updateData: any = {
      status,
      updatedAt: Date.now()
    }

    if (downloaded !== undefined) {
      updateData.downloaded = downloaded
    }

    await this.db
      .update(downloadChunksSchema)
      .set(updateData)
      .where(eq(downloadChunksSchema.id, chunkId))
  }

  // 获取任务的所有切片
  async getTaskChunks(taskId: string): Promise<DownloadChunk[]> {
    return await this.db
      .select()
      .from(downloadChunksSchema)
      .where(eq(downloadChunksSchema.taskId, taskId))
      .orderBy(downloadChunksSchema.index)
  }

  // 获取任务历史
  async getTaskHistory(limit: number = 50): Promise<DownloadHistory[]> {
    return await this.performanceMonitor.measure(
      'db_get_task_history',
      async () => {
        return await this.db
          .select()
          .from(downloadHistorySchema)
          .orderBy(desc(downloadHistorySchema.createdAt))
          .limit(limit)
      },
      { limit }
    )
  }

  // 保存到历史记录
  async saveToHistory(task: DownloadTask): Promise<void> {
    const history: NewDownloadHistory = {
      id: `${task.id}_history`,
      taskId: task.id,
      url: task.url,
      filename: task.filename,
      module: task.module,
      status: task.status,
      totalSize: task.totalSize,
      downloadedSize: task.downloadedSize,
      duration:
        task.completedAt && task.createdAt
          ? Math.round((task.completedAt - task.createdAt) / 1000)
          : undefined,
      averageSpeed:
        task.completedAt && task.createdAt && task.downloadedSize
          ? Math.round(task.downloadedSize / ((task.completedAt - task.createdAt) / 1000))
          : undefined,
      createdAt: task.createdAt,
      completedAt: task.completedAt
    }

    await this.db.insert(downloadHistorySchema).values(history)
  }

  // 清理过期数据
  async cleanupExpiredData(days: number = 30): Promise<void> {
    const cutoffDate = Date.now() - days * 24 * 60 * 60 * 1000

    // 删除过期的历史记录
    await this.db
      .delete(downloadHistorySchema)
      .where(lt(downloadHistorySchema.createdAt, cutoffDate))

    // 删除已完成的旧任务（保留最近30天）
    const completedTasks = await this.db
      .select({ id: downloadTasksSchema.id })
      .from(downloadTasksSchema)
      .where(
        and(
          eq(downloadTasksSchema.status, DownloadStatus.COMPLETED),
          lt(downloadTasksSchema.completedAt, cutoffDate)
        )
      )

    for (const task of completedTasks) {
      // 删除相关切片
      await this.db.delete(downloadChunksSchema).where(eq(downloadChunksSchema.taskId, task.id))

      // 删除任务
      await this.db.delete(downloadTasksSchema).where(eq(downloadTasksSchema.id, task.id))
    }
  }

  // 删除任务及其相关数据
  async deleteTask(taskId: string): Promise<void> {
    // 删除切片
    await this.db.delete(downloadChunksSchema).where(eq(downloadChunksSchema.taskId, taskId))

    // 删除任务
    await this.db.delete(downloadTasksSchema).where(eq(downloadTasksSchema.id, taskId))
  }

  // 删除单个历史记录
  async deleteHistoryItem(historyId: string): Promise<void> {
    await this.db.delete(downloadHistorySchema).where(eq(downloadHistorySchema.id, historyId))
  }

  // 清理失败的切片文件
  async cleanupFailedChunks(taskId: string): Promise<void> {
    const chunks = await this.getTaskChunks(taskId)

    for (const chunk of chunks) {
      try {
        if (chunk.status === ChunkStatus.FAILED && chunk.filePath) {
          await fs.promises.unlink(chunk.filePath)
        }
      } catch (error: unknown) {
        // 忽略文件不存在错误
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
          console.error(`Failed to cleanup chunk file ${chunk.filePath}:`, error)
        }
      }
    }
  }

  // 获取下载统计
  async getDownloadStats(): Promise<{
    totalTasks: number
    completedTasks: number
    failedTasks: number
    totalDownloaded: number
    averageSpeed: number
  }> {
    const tasks = await this.getAllTasks()
    const completedTasks = tasks.filter((t) => t.status === DownloadStatus.COMPLETED)
    const failedTasks = tasks.filter((t) => t.status === DownloadStatus.FAILED)

    const totalDownloaded = completedTasks.reduce(
      (sum, task) => sum + (task.downloadedSize || 0),
      0
    )

    const speeds = completedTasks
      .filter((task) => task.createdAt && task.completedAt && task.downloadedSize)
      .map((task) => {
        const duration = (task.completedAt! - task.createdAt) / 1000
        return task.downloadedSize! / duration
      })

    const averageSpeed =
      speeds.length > 0 ? speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length : 0

    return {
      totalTasks: tasks.length,
      completedTasks: completedTasks.length,
      failedTasks: failedTasks.length,
      totalDownloaded,
      averageSpeed: Math.round(averageSpeed)
    }
  }
}
