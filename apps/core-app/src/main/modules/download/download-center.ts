import type {
  DownloadConfig,
  DownloadRequest,
  DownloadTask,
  ModuleDestroyContext,
  ModuleInitContext,
  ModuleKey
} from '@talex-touch/utils'
import type { NotificationConfig } from './notification-service'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { defaultDownloadConfig, DownloadStatus } from '@talex-touch/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { getTuffTransportMain } from '@talex-touch/utils/transport'
import { DownloadEvents } from '@talex-touch/utils/transport/events'
import { desc, eq } from 'drizzle-orm'
import { app, shell } from 'electron'
import { downloadChunks, downloadHistory, downloadTasks } from '../../db/schema'
import { BaseModule } from '../abstract-base-module'
import { databaseModule } from '../database'
import { ChunkManager } from './chunk-manager'
import { ConcurrencyAdjuster } from './concurrency-adjuster'
import { DownloadWorker } from './download-worker'
import { ErrorLogger } from './error-logger'
import { DownloadErrorClass } from './error-types'
import { NetworkMonitor } from './network-monitor'
import { NotificationService } from './notification-service'
import { PriorityCalculator } from './priority-calculator'
import { RetryStrategy } from './retry-strategy'
import { TaskQueue } from './task-queue'

/**
 * DownloadCenterModule - Unified download management system
 *
 * This module provides centralized download management for all download tasks
 * including application updates, plugin installations, and user downloads.
 *
 * Key Features:
 * - Priority-based task queue
 * - Chunk-based downloading with resume support
 * - Real-time progress tracking
 * - Automatic retry with exponential backoff
 * - Database persistence
 * - Network monitoring and adaptive concurrency
 * - Error logging and recovery
 * - Data migration from old systems
 *
 * @see API.md for complete API documentation
 * @see MIGRATION_GUIDE.md for migration details
 * @see PERFORMANCE_OPTIMIZATIONS.md for performance details
 */
export class DownloadCenterModule extends BaseModule {
  static key: symbol = Symbol.for('DownloadCenter')
  name: ModuleKey = DownloadCenterModule.key

  constructor() {
    super(DownloadCenterModule.key, {
      create: true,
      dirName: 'download-center'
    })
  }

  // Core components
  private taskQueue!: TaskQueue
  private downloadWorkers!: DownloadWorker[]
  private chunkManager!: ChunkManager
  private networkMonitor!: NetworkMonitor
  private priorityCalculator!: PriorityCalculator
  private concurrencyAdjuster!: ConcurrencyAdjuster
  private notificationService!: NotificationService
  private errorLogger!: ErrorLogger
  private retryStrategy!: RetryStrategy

  // Configuration and state
  private config!: DownloadConfig // Download configuration
  private isRunning = false // Module running state
  private readonly pollingService = PollingService.getInstance()
  private readonly networkMonitorTaskId = 'download-center.network-monitor'
  private readonly progressUpdateTaskId = 'download-center.progress-update'

  private transport: ReturnType<typeof getTuffTransportMain> | null = null
  private transportDisposers: Array<() => void> = []

  // Performance optimizations
  private taskCache: Map<string, DownloadTask> = new Map() // In-memory task cache
  private lastProgressBroadcast: Map<string, number> = new Map() // Progress throttling
  private progressThrottleMs = 1000 // Throttle to 1 update/second

  async onInit(ctx: ModuleInitContext<any>): Promise<void> {
    const moduleDir = ctx.file.dirPath
    if (!moduleDir) {
      throw new Error('DownloadCenterModule requires a module directory but none was provided')
    }

    // 初始化配置
    this.config = {
      ...defaultDownloadConfig,
      storage: {
        ...defaultDownloadConfig.storage,
        tempDir: path.join(moduleDir, 'temp')
      }
    }

    // 初始化组件
    this.taskQueue = new TaskQueue()
    this.networkMonitor = new NetworkMonitor()
    this.chunkManager = new ChunkManager(this.config.chunk.size, this.config.storage.tempDir)
    this.priorityCalculator = new PriorityCalculator()
    this.concurrencyAdjuster = new ConcurrencyAdjuster(this.config, this.networkMonitor)
    this.notificationService = new NotificationService()
    this.errorLogger = new ErrorLogger(path.join(moduleDir, 'logs'))
    this.retryStrategy = new RetryStrategy(
      {
        maxRetries: this.config.network.maxRetries,
        initialDelay: this.config.network.retryDelay
      },
      this.errorLogger
    )

    // 初始化错误日志记录器
    await this.errorLogger.initialize()

    // Set up notification click handler
    this.notificationService.setNotificationClickCallback((taskId, action) => {
      this.handleNotificationClick(taskId, action)
    })

    // 初始化下载工作器
    this.downloadWorkers = []
    this.initializeWorkers()

    const channel = ($app as any).channel as any
    this.transport = getTuffTransportMain(channel, (channel as any)?.keyManager ?? channel)

    // 注册Transport通道
    this.registerTransportHandlers()

    // 启动网络监控
    this.startNetworkMonitoring()

    // 启动任务调度器
    this.startTaskScheduler()

    // 清理孤立的临时文件
    await this.cleanupTempFiles()

    console.log('DownloadCenterModule initialized')
  }

  async onDestroy(_ctx: ModuleDestroyContext<any>): Promise<void> {
    this.isRunning = false

    this.pollingService.unregister(this.networkMonitorTaskId)
    this.pollingService.unregister(this.progressUpdateTaskId)

    for (const dispose of this.transportDisposers) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.transportDisposers = []
    this.transport = null

    // Stop all download workers
    // Workers will naturally stop when isRunning is false and task scheduler exits
    for (const worker of this.downloadWorkers) {
      // Workers are stateless and will be garbage collected
      console.log('Stopping worker:', worker)
    }

    // Destroy error logger
    await this.errorLogger.destroy()

    console.log('DownloadCenterModule destroyed')
  }

  // 获取主数据库连接
  private getDb() {
    return databaseModule.getDb()
  }

  // 添加下载任务
  async addTask(request: DownloadRequest): Promise<string> {
    const taskId = request.id || randomUUID()
    const now = new Date()

    // 计算优先级
    const priority = this.priorityCalculator.calculatePriority(request)

    // 创建任务对象
    const task: DownloadTask = {
      id: taskId,
      url: request.url,
      destination: request.destination,
      filename: request.filename || path.basename(request.url),
      priority,
      module: request.module,
      status: DownloadStatus.PENDING,
      progress: {
        totalSize: undefined,
        downloadedSize: 0,
        speed: 0,
        percentage: 0
      },
      chunks: [],
      metadata: request.metadata || {},
      createdAt: now,
      updatedAt: now
    }

    // 保存到数据库
    await this.getDb()
      .insert(downloadTasks)
      .values({
        id: taskId,
        url: request.url,
        destination: request.destination,
        filename: task.filename,
        priority,
        module: request.module,
        status: DownloadStatus.PENDING,
        metadata: JSON.stringify(request.metadata || {}),
        createdAt: now.getTime(),
        updatedAt: now.getTime()
      })

    // 添加到队列
    this.taskQueue.enqueue(task)

    // 添加到缓存
    this.taskCache.set(taskId, task)

    // 广播任务添加事件
    this.broadcastTaskAdded(task)

    return taskId
  }

  // 暂停任务
  async pauseTask(taskId: string): Promise<void> {
    const task = this.taskQueue.getTask(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    task.status = DownloadStatus.PAUSED
    await this.getDb()
      .update(downloadTasks)
      .set({
        status: DownloadStatus.PAUSED,
        updatedAt: Date.now()
      })
      .where(eq(downloadTasks.id, taskId))

    this.broadcastTaskUpdated(task)
  }

  // 恢复任务
  async resumeTask(taskId: string): Promise<void> {
    const task = this.taskQueue.getTask(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    task.status = DownloadStatus.PENDING
    await this.getDb()
      .update(downloadTasks)
      .set({
        status: DownloadStatus.PENDING,
        updatedAt: Date.now()
      })
      .where(eq(downloadTasks.id, taskId))

    this.broadcastTaskUpdated(task)
  }

  // 取消任务
  async cancelTask(taskId: string): Promise<void> {
    const task = this.taskQueue.remove(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    task.status = DownloadStatus.CANCELLED
    await this.updateTaskStatusInDb(taskId, DownloadStatus.CANCELLED)

    // 立即清理切片文件和任务临时目录
    await this.chunkManager.cleanupChunks(task.chunks)
    await this.chunkManager.cleanupTaskTempDir(task, this.config.storage.tempDir)

    // Clear from cache
    this.clearTaskCache(taskId)

    this.broadcastTaskUpdated(task)
  }

  // 重试任务
  async retryTask(taskId: string): Promise<void> {
    const task = this.taskQueue.getTask(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    // 只有失败的任务才能重试
    if (task.status !== DownloadStatus.FAILED) {
      throw new Error(`Task ${taskId} is not in failed state`)
    }

    // 重置任务状态
    task.status = DownloadStatus.PENDING
    task.error = undefined
    task.progress = {
      totalSize: task.progress.totalSize,
      downloadedSize: 0,
      speed: 0,
      percentage: 0
    }
    task.updatedAt = new Date()

    // 更新数据库
    await this.updateTaskStatusInDb(taskId, DownloadStatus.PENDING)
    await this.updateTaskErrorInDb(taskId, '')

    // 清理旧的切片和临时目录
    await this.chunkManager.cleanupChunks(task.chunks)
    await this.chunkManager.cleanupTaskTempDir(task, this.config.storage.tempDir)
    task.chunks = []

    this.broadcastTaskUpdated(task)
  }

  // 批量暂停所有任务
  async pauseAllTasks(): Promise<void> {
    const activeTasks = this.taskQueue.getActiveTasks()
    const pendingTasks = this.taskQueue.getPendingTasks()
    const allTasks = [...activeTasks, ...pendingTasks]

    for (const task of allTasks) {
      try {
        await this.pauseTask(task.id)
      } catch (error) {
        console.error(`Failed to pause task ${task.id}:`, error)
      }
    }
  }

  // 批量恢复所有任务
  async resumeAllTasks(): Promise<void> {
    const pausedTasks = this.getAllTasks().filter((task) => task.status === DownloadStatus.PAUSED)

    for (const task of pausedTasks) {
      try {
        await this.resumeTask(task.id)
      } catch (error) {
        console.error(`Failed to resume task ${task.id}:`, error)
      }
    }
  }

  // 批量取消所有任务
  async cancelAllTasks(): Promise<void> {
    const allTasks = this.getAllTasks().filter(
      (task) => task.status !== DownloadStatus.COMPLETED && task.status !== DownloadStatus.CANCELLED
    )

    for (const task of allTasks) {
      try {
        await this.cancelTask(task.id)
      } catch (error) {
        console.error(`Failed to cancel task ${task.id}:`, error)
      }
    }
  }

  // 获取按状态筛选的任务
  getTasksByStatus(status: DownloadStatus): DownloadTask[] {
    return this.getAllTasks().filter((task) => task.status === status)
  }

  // 更新任务优先级
  async updateTaskPriority(taskId: string, priority: number): Promise<void> {
    const task = this.taskQueue.getTask(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    // Update in queue (handles heap reordering)
    this.taskQueue.updatePriority(taskId, priority)
    task.updatedAt = new Date()

    await this.getDb()
      .update(downloadTasks)
      .set({
        priority,
        updatedAt: Date.now()
      })
      .where(eq(downloadTasks.id, taskId))

    this.broadcastTaskUpdated(task)
  }

  // 移除任务（不删除文件）
  async removeTask(taskId: string): Promise<void> {
    const task = this.taskQueue.remove(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    // 清理切片文件和临时目录
    await this.chunkManager.cleanupChunks(task.chunks)
    await this.chunkManager.cleanupTaskTempDir(task, this.config.storage.tempDir)

    // 从数据库删除
    await this.deleteTaskFromDb(taskId)

    // 清除缓存
    this.clearTaskCache(taskId)

    this.broadcastTaskUpdated({ ...task, status: DownloadStatus.CANCELLED })
  }

  // 获取下载历史
  async getTaskHistory(limit?: number): Promise<any[]> {
    return await this.getDb()
      .select()
      .from(downloadHistory)
      .orderBy(desc(downloadHistory.createdAt))
      .limit(limit || 50)
  }

  // 清除历史记录
  async clearHistory(): Promise<void> {
    await this.getDb().delete(downloadHistory)
  }

  // 清除单个历史记录
  async clearHistoryItem(historyId: string): Promise<void> {
    await this.getDb().delete(downloadHistory).where(eq(downloadHistory.id, historyId))
  }

  // 打开文件
  async openFile(taskId: string): Promise<void> {
    const task = this.taskQueue.getTask(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    if (task.status !== DownloadStatus.COMPLETED) {
      throw new Error(`Task ${taskId} is not completed`)
    }

    const filePath = path.join(task.destination, task.filename)
    await shell.openPath(filePath)
  }

  // 在文件夹中显示文件
  async showInFolder(taskId: string): Promise<void> {
    const task = this.taskQueue.getTask(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    if (task.status !== DownloadStatus.COMPLETED) {
      throw new Error(`Task ${taskId} is not completed`)
    }

    const filePath = path.join(task.destination, task.filename)
    shell.showItemInFolder(filePath)
  }

  // 删除文件
  async deleteFile(taskId: string): Promise<void> {
    const task = this.taskQueue.getTask(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    if (task.status !== DownloadStatus.COMPLETED) {
      throw new Error(`Task ${taskId} is not completed`)
    }

    const filePath = path.join(task.destination, task.filename)
    await fs.unlink(filePath)

    await this.deleteTaskFromDb(taskId)
    this.taskQueue.remove(taskId)
    this.broadcastTaskUpdated(task)
  }

  // 清理临时文件
  async cleanupTempFiles(): Promise<void> {
    const tempDir = this.config.storage.tempDir

    try {
      await fs.mkdir(tempDir, { recursive: true })

      const allTasks = this.getAllTasks()
      const activeTaskIds = new Set(
        allTasks
          .filter(
            (task) =>
              task.status === DownloadStatus.DOWNLOADING ||
              task.status === DownloadStatus.PENDING ||
              task.status === DownloadStatus.PAUSED
          )
          .map((task) => task.id)
      )

      const entries = await fs.readdir(tempDir, { withFileTypes: true })
      let cleanedCount = 0
      let cleanedSize = 0

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!activeTaskIds.has(entry.name)) {
            const dirPath = path.join(tempDir, entry.name)

            try {
              const size = await this.getDirectorySize(dirPath)
              cleanedSize += size
            } catch (error) {
              // Ignore size calculation errors
            }

            await fs.rm(dirPath, { recursive: true, force: true })
            cleanedCount++
            console.log(`Cleaned up orphaned temp directory: ${dirPath}`)
          }
        } else if (entry.isFile()) {
          const filePath = path.join(tempDir, entry.name)
          try {
            const stats = await fs.stat(filePath)
            cleanedSize += stats.size
            await fs.unlink(filePath)
            cleanedCount++
            console.log(`Cleaned up orphaned temp file: ${filePath}`)
          } catch (error) {
            console.error(`Failed to cleanup temp file ${filePath}:`, error)
          }
        }
      }

      if (cleanedCount > 0) {
        console.log(
          `Temp cleanup completed: ${cleanedCount} items removed, ${this.formatBytes(cleanedSize)} freed`
        )
      }
    } catch (error) {
      console.error('Failed to cleanup temp files:', error)
    }
  }

  // 计算目录大小
  private async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)

        if (entry.isDirectory()) {
          totalSize += await this.getDirectorySize(fullPath)
        } else if (entry.isFile()) {
          const stats = await fs.stat(fullPath)
          totalSize += stats.size
        }
      }
    } catch (error) {
      // Ignore errors, return current size
    }

    return totalSize
  }

  // 格式化字节大小
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`
  }

  // 获取配置
  getConfig(): DownloadConfig {
    return this.config
  }

  // 更新配置
  updateConfig(config: Partial<DownloadConfig>): void {
    this.config = { ...this.config, ...config }
    if (config.concurrency?.maxConcurrent) {
      this.concurrencyAdjuster.setMaxConcurrency(config.concurrency.maxConcurrent)
    }
    // 如果临时目录配置改变，更新 ChunkManager
    if (config.storage?.tempDir) {
      this.chunkManager.setBaseTempDir(config.storage.tempDir)
    }
  }

  // 获取临时文件统计信息
  async getTempFileStats(): Promise<{
    totalSize: number
    fileCount: number
    directoryCount: number
    orphanedCount: number
  }> {
    const fs = await import('node:fs/promises')
    const tempDir = this.config.storage.tempDir

    let totalSize = 0
    let fileCount = 0
    let directoryCount = 0
    let orphanedCount = 0

    try {
      // 确保临时目录存在
      await fs.mkdir(tempDir, { recursive: true })

      // 获取所有活跃任务ID
      const allTasks = this.getAllTasks()
      const activeTaskIds = new Set(
        allTasks
          .filter(
            (task) =>
              task.status === DownloadStatus.DOWNLOADING ||
              task.status === DownloadStatus.PENDING ||
              task.status === DownloadStatus.PAUSED
          )
          .map((task) => task.id)
      )

      // 读取临时目录
      const entries = await fs.readdir(tempDir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(tempDir, entry.name)

        if (entry.isDirectory()) {
          directoryCount++
          if (!activeTaskIds.has(entry.name)) {
            orphanedCount++
          }
          const size = await this.getDirectorySize(fullPath)
          totalSize += size
        } else if (entry.isFile()) {
          fileCount++
          orphanedCount++ // 顶层文件都是孤立的
          const stats = await fs.stat(fullPath)
          totalSize += stats.size
        }
      }
    } catch (error) {
      console.error('Failed to get temp file stats:', error)
    }

    return {
      totalSize,
      fileCount,
      directoryCount,
      orphanedCount
    }
  }

  // 更新通知配置
  updateNotificationConfig(config: Partial<NotificationConfig>): void {
    this.notificationService.updateConfig(config)
  }

  // 获取通知配置
  getNotificationConfig(): NotificationConfig {
    return this.notificationService.getConfig()
  }

  // 获取通知服务实例（供UpdateSystem使用）
  getNotificationService(): NotificationService {
    return this.notificationService
  }

  // 获取任务状态
  getTaskStatus(taskId: string): DownloadTask | null {
    // Try cache first
    if (this.taskCache.has(taskId)) {
      return this.taskCache.get(taskId)!
    }
    const task = this.taskQueue.getTask(taskId)
    if (task) {
      this.taskCache.set(taskId, task)
    }
    return task
  }

  // 获取所有任务
  getAllTasks(): DownloadTask[] {
    return this.taskQueue.getAllTasks()
  }

  // 清除任务缓存
  private clearTaskCache(taskId: string): void {
    this.taskCache.delete(taskId)
    this.lastProgressBroadcast.delete(taskId)
  }

  // 更新任务缓存
  private updateTaskCache(task: DownloadTask): void {
    this.taskCache.set(task.id, task)
  }

  // 更新任务状态到数据库
  private async updateTaskStatusInDb(taskId: string, status: DownloadStatus): Promise<void> {
    await this.getDb()
      .update(downloadTasks)
      .set({
        status,
        updatedAt: Date.now(),
        completedAt: status === DownloadStatus.COMPLETED ? Date.now() : undefined
      })
      .where(eq(downloadTasks.id, taskId))
  }

  // 更新任务错误信息到数据库
  private async updateTaskErrorInDb(taskId: string, error: string): Promise<void> {
    await this.getDb()
      .update(downloadTasks)
      .set({
        error,
        updatedAt: Date.now()
      })
      .where(eq(downloadTasks.id, taskId))
  }

  // 更新下载进度到数据库
  private async updateProgressInDb(
    taskId: string,
    downloadedSize: number,
    totalSize?: number
  ): Promise<void> {
    await this.getDb()
      .update(downloadTasks)
      .set({
        downloadedSize,
        totalSize,
        updatedAt: Date.now()
      })
      .where(eq(downloadTasks.id, taskId))
  }

  // 删除任务及其相关数据
  private async deleteTaskFromDb(taskId: string): Promise<void> {
    await this.getDb().delete(downloadChunks).where(eq(downloadChunks.taskId, taskId))
    await this.getDb().delete(downloadTasks).where(eq(downloadTasks.id, taskId))
  }

  // 保存任务到历史记录
  private async saveToHistoryDb(task: DownloadTask): Promise<void> {
    const now = Date.now()
    const createdAtMs = task.createdAt instanceof Date ? task.createdAt.getTime() : now
    const completedAtMs = now
    const duration = Math.round((completedAtMs - createdAtMs) / 1000)
    const avgSpeed =
      task.progress.downloadedSize && duration > 0
        ? Math.round(task.progress.downloadedSize / duration)
        : undefined

    await this.getDb()
      .insert(downloadHistory)
      .values({
        id: `${task.id}_history_${now}`,
        taskId: task.id,
        url: task.url,
        filename: task.filename,
        module: task.module,
        status: task.status,
        totalSize: task.progress.totalSize,
        downloadedSize: task.progress.downloadedSize,
        duration,
        averageSpeed: avgSpeed,
        createdAt: createdAtMs,
        completedAt: completedAtMs
      })
  }

  private shouldSuppressHistory(task: DownloadTask): boolean {
    return app.isPackaged && Boolean(task.metadata?.hidden)
  }

  // 初始化下载工作器
  private initializeWorkers(): void {
    const workerCount = this.config.concurrency.maxConcurrent

    for (let i = 0; i < workerCount; i++) {
      const worker = new DownloadWorker(
        workerCount,
        this.networkMonitor,
        this.chunkManager,
        this.config
      )
      this.downloadWorkers.push(worker)
    }
  }

  private registerTransportHandlers(): void {
    if (!this.transport) {
      return
    }

    const tx = this.transport

    this.transportDisposers.push(
      tx.on(DownloadEvents.task.add, async (request) => {
        try {
          const taskId = await this.addTask(request)
          return { success: true, taskId }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.task.pause, async (payload) => {
        try {
          await this.pauseTask(payload.taskId)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.task.resume, async (payload) => {
        try {
          await this.resumeTask(payload.taskId)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.task.cancel, async (payload) => {
        try {
          await this.cancelTask(payload.taskId)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.list.getAll, async () => {
        try {
          const tasks = this.getAllTasks()
          return { success: true, tasks }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.task.getStatus, async (payload) => {
        try {
          const task = this.getTaskStatus(payload.taskId)
          return { success: true, task }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.config.update, async (payload) => {
        try {
          this.updateConfig(payload.config)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.task.retry, async (payload) => {
        try {
          await this.retryTask(payload.taskId)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.task.pauseAll, async () => {
        try {
          await this.pauseAllTasks()
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.task.resumeAll, async () => {
        try {
          await this.resumeAllTasks()
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.task.cancelAll, async () => {
        try {
          await this.cancelAllTasks()
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.list.getByStatus, async (payload) => {
        try {
          const tasks = this.getTasksByStatus(payload.status)
          return { success: true, tasks }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.task.updatePriority, async (payload) => {
        try {
          await this.updateTaskPriority(payload.taskId, payload.priority)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.task.remove, async (payload) => {
        try {
          await this.removeTask(payload.taskId)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.history.get, async (payload) => {
        try {
          const history = await this.getTaskHistory(payload?.limit)
          return { success: true, history }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.history.clear, async () => {
        try {
          await this.clearHistory()
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.history.clearItem, async (payload) => {
        try {
          await this.clearHistoryItem(payload.historyId)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.file.open, async (payload) => {
        try {
          await this.openFile(payload.taskId)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.file.showInFolder, async (payload) => {
        try {
          await this.showInFolder(payload.taskId)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.file.delete, async (payload) => {
        try {
          await this.deleteFile(payload.taskId)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.maintenance.cleanupTemp, async () => {
        try {
          await this.cleanupTempFiles()
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.config.get, async () => {
        try {
          const config = this.getConfig()
          return { success: true, config }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.config.updateNotification, async (payload) => {
        try {
          this.updateNotificationConfig(payload.config as Partial<NotificationConfig>)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.config.getNotification, async () => {
        try {
          const config = this.getNotificationConfig()
          return { success: true, config }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.logs.get, async (payload) => {
        try {
          const logs = await this.errorLogger.readLogs(payload?.limit)
          return { success: true, logs }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.logs.getErrorStats, async () => {
        try {
          const stats = await this.errorLogger.getErrorStats()
          return { success: true, stats }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.logs.clear, async () => {
        try {
          await this.errorLogger.clearLogs()
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.temp.getStats, async () => {
        try {
          const stats = await this.getTempFileStats()
          return { success: true, stats }
        } catch (error: any) {
          return { success: false, error: error?.message ?? String(error) }
        }
      }),

      tx.on(DownloadEvents.migration.checkNeeded, async () => {
        return { success: true, needed: false }
      }),

      tx.on(DownloadEvents.migration.start, async () => {
        return { success: true, result: { migrated: true } }
      }),

      tx.on(DownloadEvents.migration.retry, async () => {
        return { success: true, result: { migrated: true } }
      }),

      tx.on(DownloadEvents.migration.status, async () => {
        return { success: true, currentVersion: 1, appliedMigrations: [] }
      })
    )
  }

  // 启动网络监控
  private startNetworkMonitoring(): void {
    // 初始网络状态检查
    this.networkMonitor.monitorNetwork().then((status) => {
      this.priorityCalculator.setNetworkStatus(status)
    })

    // 定期更新网络状态
    if (this.pollingService.isRegistered(this.networkMonitorTaskId)) {
      this.pollingService.unregister(this.networkMonitorTaskId)
    }
    this.pollingService.register(
      this.networkMonitorTaskId,
      async () => {
        const status = await this.networkMonitor.monitorNetwork()
        this.priorityCalculator.setNetworkStatus(status)

        // 根据网络状况调整并发数
        if (this.config.concurrency.autoAdjust) {
          this.concurrencyAdjuster.adjustConcurrency()
        }
      },
      { interval: 30, unit: 'seconds' }
    )
    this.pollingService.start()
  }

  // 启动任务调度器
  private startTaskScheduler(): void {
    this.isRunning = true

    // 启动进度更新定时器
    if (this.pollingService.isRegistered(this.progressUpdateTaskId)) {
      this.pollingService.unregister(this.progressUpdateTaskId)
    }
    this.pollingService.register(this.progressUpdateTaskId, () => this.updateProgress(), {
      interval: 1,
      unit: 'seconds'
    })
    this.pollingService.start()

    // 启动任务调度循环
    this.scheduleTasks()
  }

  // 任务调度循环
  private async scheduleTasks(): Promise<void> {
    while (this.isRunning) {
      try {
        // 获取等待中的任务
        const pendingTasks = this.taskQueue.getPendingTasks()

        // 分配任务给可用的工作器
        for (const task of pendingTasks) {
          const availableWorker = this.findAvailableWorker()
          if (availableWorker) {
            // 启动下载任务
            this.startDownloadTask(task, availableWorker)
          }
        }

        // 等待一段时间再检查
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error) {
        console.error('Task scheduler error:', error)
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }
  }

  // 查找可用的工作器
  private findAvailableWorker(): DownloadWorker | null {
    return this.downloadWorkers.find((worker) => worker.canAcceptTask()) || null
  }

  // 启动下载任务
  private async startDownloadTask(task: DownloadTask, worker: DownloadWorker): Promise<void> {
    try {
      task.status = DownloadStatus.DOWNLOADING
      await this.updateTaskStatusInDb(task.id, DownloadStatus.DOWNLOADING)

      // 使用重试策略启动下载
      const result = await this.retryStrategy.executeWithRetry(
        () =>
          worker.startTask(task, (taskId, progress) => {
            this.handleTaskProgress(taskId, progress)
          }),
        {
          taskId: task.id,
          url: task.url,
          filename: task.filename,
          module: task.module
        },
        (attempt, error, delay) => {
          // 重试回调
          this.errorLogger.logWarn(`Retrying download task ${task.id} (attempt ${attempt})`, {
            error: error.toErrorObject(),
            delay
          })

          // 广播重试事件
          this.transport?.broadcast(DownloadEvents.push.taskRetrying, {
            taskId: task.id,
            attempt,
            error: error.userMessage,
            delay
          })
        }
      )

      if (result.success) {
        // 下载完成
        task.status = DownloadStatus.COMPLETED
        await this.updateTaskStatusInDb(task.id, DownloadStatus.COMPLETED)
        if (!this.shouldSuppressHistory(task)) {
          await this.saveToHistoryDb(task)
        }

        this.broadcastTaskCompleted(task)
      } else {
        throw result.error || new Error('Download failed')
      }
    } catch (error: any) {
      // 转换为 DownloadErrorClass
      const downloadError =
        error instanceof DownloadErrorClass
          ? error
          : DownloadErrorClass.fromError(error, {
              taskId: task.id,
              url: task.url,
              filename: task.filename,
              module: task.module,
              timestamp: Date.now()
            })

      // 记录错误
      await this.errorLogger.logError(downloadError.toErrorObject())

      // 更新任务状态
      task.status = DownloadStatus.FAILED
      task.error = downloadError.userMessage
      await this.updateTaskStatusInDb(task.id, DownloadStatus.FAILED)
      await this.updateTaskErrorInDb(task.id, downloadError.userMessage)

      this.broadcastTaskFailed(task)
    }
  }

  private handleTaskProgress(taskId: string, progress: any): void {
    const task = this.taskQueue.getTask(taskId)
    if (!task) return

    task.progress = {
      totalSize: progress.totalSize,
      downloadedSize: progress.downloadedSize,
      speed: progress.speed || 0,
      remainingTime: progress.remainingTime,
      percentage: progress.percentage
    }

    task.updatedAt = new Date()

    // Update cache
    this.updateTaskCache(task)

    this.updateProgressInDb(taskId, progress.downloadedSize, progress.totalSize)

    // Throttle progress broadcasts
    this.broadcastTaskProgressThrottled(task)
  }

  private broadcastTaskProgressThrottled(task: DownloadTask): void {
    const now = Date.now()
    const lastBroadcast = this.lastProgressBroadcast.get(task.id) || 0

    // Only broadcast if enough time has passed since last broadcast
    if (now - lastBroadcast >= this.progressThrottleMs) {
      this.lastProgressBroadcast.set(task.id, now)
      this.broadcastTaskProgress(task)
    }
  }

  private updateProgress(): void {
    const activeTasks = this.taskQueue.getActiveTasks()

    for (const task of activeTasks) {
      // 这里可以实现更复杂的进度计算逻辑
      this.broadcastTaskProgress(task)
    }
  }

  private broadcastTaskAdded(task: DownloadTask): void {
    this.transport?.broadcast(DownloadEvents.push.taskAdded, task)
  }

  private broadcastTaskProgress(task: DownloadTask): void {
    this.transport?.broadcast(DownloadEvents.push.taskProgress, task)
  }

  private broadcastTaskCompleted(task: DownloadTask): void {
    this.transport?.broadcast(DownloadEvents.push.taskCompleted, task)

    // Show notification for completed download
    this.notificationService.showDownloadCompleteNotification(task)
  }

  private broadcastTaskFailed(task: DownloadTask): void {
    this.transport?.broadcast(DownloadEvents.push.taskFailed, task)

    // Show notification for failed download
    this.notificationService.showDownloadFailedNotification(task)
  }

  private broadcastTaskUpdated(task: DownloadTask): void {
    this.transport?.broadcast(DownloadEvents.push.taskUpdated, task)
  }

  /**
   * Handle notification click events
   */
  private handleNotificationClick(taskId: string, action: string): void {
    console.log(`[DownloadCenter] Notification clicked: ${taskId}, action: ${action}`)

    // Broadcast notification click event to renderer
    this.transport?.broadcast(DownloadEvents.push.notificationClicked, {
      taskId,
      action
    })
  }
}

export const downloadCenterModule = new DownloadCenterModule()
