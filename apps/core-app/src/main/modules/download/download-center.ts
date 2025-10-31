import { BaseModule } from '../abstract-base-module'
import { ModuleInitContext, ModuleDestroyContext, ModuleKey } from '@talex-touch/utils'
import { ChannelType } from '@talex-touch/utils/channel'
import { DatabaseService } from './database-service'
import { TaskQueue } from './task-queue'
import { DownloadWorker } from './download-worker'
import { ChunkManager } from './chunk-manager'
import { NetworkMonitor } from './network-monitor'
import { PriorityCalculator } from './priority-calculator'
import { ConcurrencyAdjuster } from './concurrency-adjuster'
import {
  DownloadRequest,
  DownloadTask,
  DownloadStatus,
  DownloadConfig,
  defaultDownloadConfig
} from '@talex-touch/utils'
import path from 'path'
import { randomUUID } from 'crypto'

export class DownloadCenterModule extends BaseModule {
  static key: symbol = Symbol.for('DownloadCenter')
  name: ModuleKey = DownloadCenterModule.key

  constructor() {
    super(DownloadCenterModule.key, {
      create: true,
      dirName: 'download-center'
    })
  }
  private taskQueue!: TaskQueue
  private downloadWorkers!: DownloadWorker[]
  private chunkManager!: ChunkManager
  private databaseService!: DatabaseService
  private networkMonitor!: NetworkMonitor
  private priorityCalculator!: PriorityCalculator
  private concurrencyAdjuster!: ConcurrencyAdjuster
  private config!: DownloadConfig
  private isRunning = false
  private progressUpdateInterval: NodeJS.Timeout | null = null

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
    this.databaseService = new DatabaseService(path.join(moduleDir, 'download.db'))
    this.taskQueue = new TaskQueue()
    this.networkMonitor = new NetworkMonitor()
    this.chunkManager = new ChunkManager(this.config.chunk.size)
    this.priorityCalculator = new PriorityCalculator()
    this.concurrencyAdjuster = new ConcurrencyAdjuster(this.config, this.networkMonitor)

    // 初始化下载工作器
    this.downloadWorkers = []
    this.initializeWorkers()

    // 注册IPC通道
    this.registerChannels()

    // 启动网络监控
    this.startNetworkMonitoring()

    // 启动任务调度器
    this.startTaskScheduler()

    console.log('DownloadCenterModule initialized')
  }

  async onDestroy(_ctx: ModuleDestroyContext<any>): Promise<void> {
    this.isRunning = false

    // 停止进度更新
    if (this.progressUpdateInterval) {
      clearInterval(this.progressUpdateInterval)
    }

    // 停止所有下载工作器
    for (const worker of this.downloadWorkers) {
      // 这里需要实现停止工作器的逻辑
      // TODO: 实现工作器停止逻辑
      console.log('Stopping worker:', worker)
    }

    console.log('DownloadCenterModule destroyed')
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
    await this.databaseService.saveTask({
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
    await this.databaseService.updateTaskStatus(taskId, DownloadStatus.PAUSED)

    this.broadcastTaskUpdated(task)
  }

  // 恢复任务
  async resumeTask(taskId: string): Promise<void> {
    const task = this.taskQueue.getTask(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    task.status = DownloadStatus.PENDING
    await this.databaseService.updateTaskStatus(taskId, DownloadStatus.PENDING)

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

    // 清理切片文件
    await this.chunkManager.cleanupChunks(task.chunks)

    this.broadcastTaskUpdated(task)
  }

  // 获取任务状态
  getTaskStatus(taskId: string): DownloadTask | null {
    return this.taskQueue.getTask(taskId)
  }

  // 获取所有任务
  getAllTasks(): DownloadTask[] {
    return this.taskQueue.getAllTasks()
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
          this.config = { ...this.config, ...config }
          this.concurrencyAdjuster.setMaxConcurrency(this.config.concurrency.maxConcurrent)
          return { success: true }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      }
    )
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

      // 启动下载
      await worker.startTask(task, (taskId, progress) => {
        this.handleTaskProgress(taskId, progress)
      })

      // 下载完成
      task.status = DownloadStatus.COMPLETED
      await this.databaseService.updateTaskStatus(task.id, DownloadStatus.COMPLETED)
      await this.databaseService.saveToHistory(task as any)

      this.broadcastTaskCompleted(task)
    } catch (error: any) {
      console.error(`Download task ${task.id} failed:`, error)

      task.status = DownloadStatus.FAILED
      task.error = error.message
      await this.databaseService.updateTaskStatus(task.id, DownloadStatus.FAILED)
      await this.databaseService.updateTaskError(task.id, error.message)

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

    this.databaseService.updateProgress(taskId, progress.downloadedSize, progress.totalSize)

    this.broadcastTaskProgress(task)
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
  }

  private broadcastTaskFailed(task: DownloadTask): void {
    $app.channel.send(ChannelType.MAIN, 'download:task-failed', task)
  }

  private broadcastTaskUpdated(task: DownloadTask): void {
    $app.channel.send(ChannelType.MAIN, 'download:task-updated', task)
  }
}

export const downloadCenterModule = new DownloadCenterModule()
