import { BaseModule } from '../abstract-base-module'
import { ModuleInitContext, ModuleDestroyContext, ModuleKey } from '@talex-touch/utils'
import { ChannelType } from '@talex-touch/utils/channel'
import { databaseModule } from '../database'
import { downloadTasks, downloadChunks, downloadHistory } from '../../db/schema'
import { eq, desc, and, lt } from 'drizzle-orm'
import { TaskQueue } from './task-queue'
import { DownloadWorker } from './download-worker'
import { ChunkManager } from './chunk-manager'
import { NetworkMonitor } from './network-monitor'
import { PriorityCalculator } from './priority-calculator'
import { ConcurrencyAdjuster } from './concurrency-adjuster'
import { NotificationService, NotificationConfig } from './notification-service'
import { ErrorLogger } from './error-logger'
import { RetryStrategy } from './retry-strategy'
import { DownloadErrorClass } from './error-types'
import {
  DownloadRequest,
  DownloadTask,
  DownloadStatus,
  DownloadConfig,
  defaultDownloadConfig
} from '@talex-touch/utils'
import path from 'path'
import { randomUUID } from 'crypto'

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
  private taskQueue!: TaskQueue                      // Priority-based task queue
  private downloadWorkers!: DownloadWorker[]         // Worker pool for concurrent downloads
  private chunkManager!: ChunkManager                // Manages file chunking and merging
  private networkMonitor!: NetworkMonitor            // Monitors network status
  private priorityCalculator!: PriorityCalculator    // Calculates task priorities
  private concurrencyAdjuster!: ConcurrencyAdjuster  // Adjusts concurrency based on network
  private notificationService!: NotificationService  // System notifications
  private errorLogger!: ErrorLogger                  // Error logging and tracking
  private retryStrategy!: RetryStrategy              // Retry logic with backoff
  
  // Configuration and state
  private config!: DownloadConfig                    // Download configuration
  private isRunning = false                          // Module running state
  private progressUpdateInterval: NodeJS.Timeout | null = null
  
  // Performance optimizations
  private taskCache: Map<string, DownloadTask> = new Map()        // In-memory task cache
  private lastProgressBroadcast: Map<string, number> = new Map()  // Progress throttling
  private progressThrottleMs = 1000                               // Throttle to 1 update/second

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

    // 注册IPC通道
    this.registerChannels()

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

    // Stop progress update interval
    if (this.progressUpdateInterval) {
      clearInterval(this.progressUpdateInterval)
    }

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
    await this.getDb().insert(downloadTasks).values({
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
    await this.databaseService.updateTaskStatus(taskId, DownloadStatus.CANCELLED)

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
    await this.databaseService.updateTaskStatus(taskId, DownloadStatus.PENDING)
    await this.databaseService.updateTaskError(taskId, '')

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
    const pausedTasks = this.getAllTasks().filter(
      (task) => task.status === DownloadStatus.PAUSED
    )

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
      (task) =>
        task.status !== DownloadStatus.COMPLETED && task.status !== DownloadStatus.CANCELLED
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

  // 获取下载历史
  async getTaskHistory(limit?: number): Promise<any[]> {
    return await this.databaseService.getTaskHistory(limit || 50)
  }

  // 清除历史记录
  async clearHistory(): Promise<void> {
    await this.databaseService.cleanupExpiredData(0) // 清除所有历史记录
  }

  // 清除单个历史记录
  async clearHistoryItem(historyId: string): Promise<void> {
    await this.databaseService.deleteHistoryItem(historyId)
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
    const { shell } = await import('electron')
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
    const { shell } = await import('electron')
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
    const fs = await import('fs/promises')
    await fs.unlink(filePath)

    // 从数据库中删除任务
    await this.databaseService.deleteTask(taskId)

    // 从队列中移除
    this.taskQueue.remove(taskId)

    this.broadcastTaskUpdated(task)
  }

  // 清理临时文件
  async cleanupTempFiles(): Promise<void> {
    const fs = await import('fs/promises')
    const tempDir = this.config.storage.tempDir

    try {
      // 确保临时目录存在
      await fs.mkdir(tempDir, { recursive: true })

      // 获取所有任务
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
      let cleanedCount = 0
      let cleanedSize = 0

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // 检查是否是孤立的任务目录
          if (!activeTaskIds.has(entry.name)) {
            const dirPath = path.join(tempDir, entry.name)
            
            // 计算目录大小
            try {
              const size = await this.getDirectorySize(dirPath)
              cleanedSize += size
            } catch (error) {
              // 忽略大小计算错误
            }

            await fs.rm(dirPath, { recursive: true, force: true })
            cleanedCount++
            console.log(`Cleaned up orphaned temp directory: ${dirPath}`)
          }
        } else if (entry.isFile()) {
          // 清理孤立的临时文件（不在任何任务目录中）
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
    const fs = await import('fs/promises')
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
      // 忽略错误，返回当前计算的大小
    }

    return totalSize
  }

  // 格式化字节大小
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
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
    const fs = await import('fs/promises')
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

  // 注册IPC通道
  private registerChannels(): void {
    $app.channel.regChannel(
      ChannelType.MAIN,
      'download:add-task',
      async ({ data: request }: any) => {
        try {
          const taskId = await this.addTask(request)
          return { success: true, taskId }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      }
    )

    $app.channel.regChannel(
      ChannelType.MAIN,
      'download:pause-task',
      async ({ data: taskId }: any) => {
        try {
          await this.pauseTask(taskId)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      }
    )

    $app.channel.regChannel(
      ChannelType.MAIN,
      'download:resume-task',
      async ({ data: taskId }: any) => {
        try {
          await this.resumeTask(taskId)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      }
    )

    $app.channel.regChannel(
      ChannelType.MAIN,
      'download:cancel-task',
      async ({ data: taskId }: any) => {
        try {
          await this.cancelTask(taskId)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      }
    )

    $app.channel.regChannel(ChannelType.MAIN, 'download:get-tasks', async () => {
      try {
        const tasks = this.getAllTasks()
        return { success: true, tasks }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    })

    $app.channel.regChannel(
      ChannelType.MAIN,
      'download:get-task-status',
      async ({ data: taskId }: any) => {
        try {
          const task = this.getTaskStatus(taskId)
          return { success: true, task }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      }
    )

    $app.channel.regChannel(
      ChannelType.MAIN,
      'download:update-config',
      async ({ data: config }: any) => {
        try {
          this.updateConfig(config)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      }
    )

    $app.channel.regChannel(
      ChannelType.MAIN,
      'download:retry-task',
      async ({ data: taskId }: any) => {
        try {
          await this.retryTask(taskId)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      }
    )

    $app.channel.regChannel(ChannelType.MAIN, 'download:pause-all-tasks', async () => {
      try {
        await this.pauseAllTasks()
        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    })

    $app.channel.regChannel(ChannelType.MAIN, 'download:resume-all-tasks', async () => {
      try {
        await this.resumeAllTasks()
        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    })

    $app.channel.regChannel(ChannelType.MAIN, 'download:cancel-all-tasks', async () => {
      try {
        await this.cancelAllTasks()
        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    })

    $app.channel.regChannel(
      ChannelType.MAIN,
      'download:get-tasks-by-status',
      async ({ data: status }: any) => {
        try {
          const tasks = this.getTasksByStatus(status)
          return { success: true, tasks }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      }
    )

    $app.channel.regChannel(
      ChannelType.MAIN,
      'download:get-history',
      async ({ data: limit }: any) => {
        try {
          const history = await this.getTaskHistory(limit)
          return { success: true, history }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      }
    )

    $app.channel.regChannel(ChannelType.MAIN, 'download:clear-history', async () => {
      try {
        await this.clearHistory()
        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    })

    $app.channel.regChannel(
      ChannelType.MAIN,
      'download:clear-history-item',
      async ({ data: historyId }: any) => {
        try {
          await this.clearHistoryItem(historyId)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      }
    )

    $app.channel.regChannel(
      ChannelType.MAIN,
      'download:open-file',
      async ({ data: taskId }: any) => {
        try {
          await this.openFile(taskId)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      }
    )

    $app.channel.regChannel(
      ChannelType.MAIN,
      'download:show-in-folder',
      async ({ data: taskId }: any) => {
        try {
          await this.showInFolder(taskId)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      }
    )

    $app.channel.regChannel(
      ChannelType.MAIN,
      'download:delete-file',
      async ({ data: taskId }: any) => {
        try {
          await this.deleteFile(taskId)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      }
    )

    $app.channel.regChannel(ChannelType.MAIN, 'download:cleanup-temp', async () => {
      try {
        await this.cleanupTempFiles()
        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    })

    $app.channel.regChannel(ChannelType.MAIN, 'download:get-config', async () => {
      try {
        const config = this.getConfig()
        return { success: true, config }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    })

    $app.channel.regChannel(
      ChannelType.MAIN,
      'download:update-notification-config',
      async ({ data: config }: any) => {
        try {
          this.updateNotificationConfig(config)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      }
    )

    $app.channel.regChannel(ChannelType.MAIN, 'download:get-notification-config', async () => {
      try {
        const config = this.getNotificationConfig()
        return { success: true, config }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    })

    // 错误日志相关通道
    $app.channel.regChannel(
      ChannelType.MAIN,
      'download:get-logs',
      async ({ data: limit }: any) => {
        try {
          const logs = await this.errorLogger.readLogs(limit)
          return { success: true, logs }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      }
    )

    $app.channel.regChannel(ChannelType.MAIN, 'download:get-error-stats', async () => {
      try {
        const stats = await this.errorLogger.getErrorStats()
        return { success: true, stats }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    })

    $app.channel.regChannel(ChannelType.MAIN, 'download:clear-logs', async () => {
      try {
        await this.errorLogger.clearLogs()
        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    })

    // 临时文件管理相关通道
    $app.channel.regChannel(ChannelType.MAIN, 'download:get-temp-stats', async () => {
      try {
        const stats = await this.getTempFileStats()
        return { success: true, stats }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    })

    // 迁移相关通道
    $app.channel.regChannel(ChannelType.MAIN, 'download:check-migration-needed', async () => {
      try {
        const needed = await this.migrationManager.needsMigration()
        return { success: true, needed }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    })

    $app.channel.regChannel(ChannelType.MAIN, 'download:start-migration', async () => {
      try {
        const result = await this.migrationManager.migrate()
        return { success: true, result }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    })

    $app.channel.regChannel(ChannelType.MAIN, 'download:retry-migration', async () => {
      try {
        const result = await this.migrationManager.migrate()
        return { success: true, result }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    })

    $app.channel.regChannel(ChannelType.MAIN, 'download:get-migration-status', async () => {
      try {
        const currentVersion = await this.migrationRunner.getCurrentVersion()
        const appliedMigrations = await this.migrationRunner.getAppliedMigrations()
        return { success: true, currentVersion, appliedMigrations }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    })
  }

  // 启动网络监控
  private startNetworkMonitoring(): void {
    // 初始网络状态检查
    this.networkMonitor.monitorNetwork().then((status) => {
      this.priorityCalculator.setNetworkStatus(status)
    })

    // 定期更新网络状态
    setInterval(async () => {
      const status = await this.networkMonitor.monitorNetwork()
      this.priorityCalculator.setNetworkStatus(status)

      // 根据网络状况调整并发数
      if (this.config.concurrency.autoAdjust) {
        this.concurrencyAdjuster.adjustConcurrency()
      }
    }, 30000) // 每30秒检查一次
  }

  // 启动任务调度器
  private startTaskScheduler(): void {
    this.isRunning = true

    // 启动进度更新定时器
    this.progressUpdateInterval = setInterval(() => {
      this.updateProgress()
    }, 1000) // 每秒更新一次进度

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
      await this.databaseService.updateTaskStatus(task.id, DownloadStatus.DOWNLOADING)

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
          this.errorLogger.logWarn(
            `Retrying download task ${task.id} (attempt ${attempt})`,
            {
              error: error.toErrorObject(),
              delay
            }
          )

          // 广播重试事件
          $app.channel.send(ChannelType.MAIN, 'download:task-retrying', {
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
        await this.databaseService.updateTaskStatus(task.id, DownloadStatus.COMPLETED)
        await this.databaseService.saveToHistory(task as any)

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
      await this.databaseService.updateTaskStatus(task.id, DownloadStatus.FAILED)
      await this.databaseService.updateTaskError(task.id, downloadError.userMessage)

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

    this.databaseService.updateProgress(taskId, progress.downloadedSize, progress.totalSize)

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
    $app.channel.send(ChannelType.MAIN, 'download:task-added', task)
  }

  private broadcastTaskProgress(task: DownloadTask): void {
    $app.channel.send(ChannelType.MAIN, 'download:task-progress', task)
  }

  private broadcastTaskCompleted(task: DownloadTask): void {
    $app.channel.send(ChannelType.MAIN, 'download:task-completed', task)
    
    // Show notification for completed download
    this.notificationService.showDownloadCompleteNotification(task)
  }

  private broadcastTaskFailed(task: DownloadTask): void {
    $app.channel.send(ChannelType.MAIN, 'download:task-failed', task)
    
    // Show notification for failed download
    this.notificationService.showDownloadFailedNotification(task)
  }

  private broadcastTaskUpdated(task: DownloadTask): void {
    $app.channel.send(ChannelType.MAIN, 'download:task-updated', task)
  }

  private broadcastMigrationProgress(progress: MigrationProgress): void {
    $app.channel.send(ChannelType.MAIN, 'download:migration-progress', progress)
  }

  private broadcastMigrationResult(result: MigrationResult): void {
    $app.channel.send(ChannelType.MAIN, 'download:migration-result', result)
  }

  /**
   * Handle notification click events
   */
  private handleNotificationClick(taskId: string, action: string): void {
    console.log(`[DownloadCenter] Notification clicked: ${taskId}, action: ${action}`)

    // Broadcast notification click event to renderer
    $app.channel.send(ChannelType.MAIN, 'download:notification-clicked', {
      taskId,
      action
    })
  }
}

export const downloadCenterModule = new DownloadCenterModule()
