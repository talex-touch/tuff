import type { ChunkInfo, DownloadConfig, DownloadProgress, DownloadTask } from '@talex-touch/utils'
import type { AxiosRequestConfig } from 'axios'
import type { ChunkManager } from './chunk-manager'
import type { NetworkMonitor } from './network-monitor'
import { createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { ChunkStatus, DownloadModule } from '@talex-touch/utils'
import axios from 'axios'
import { DownloadErrorClass } from './error-types'
import { ProgressTracker } from './progress-tracker'

export class DownloadWorker {
  private readonly maxConcurrent: number
  private activeTasks: Set<string> = new Set()
  private cancelledTasks: Set<string> = new Set()
  private networkMonitor: NetworkMonitor
  private chunkManager: ChunkManager
  private config: DownloadConfig
  private progressTrackers: Map<string, ProgressTracker> = new Map()
  private taskAbortControllers: Map<string, AbortController> = new Map()

  constructor(
    maxConcurrent: number,
    networkMonitor: NetworkMonitor,
    chunkManager: ChunkManager,
    config: DownloadConfig
  ) {
    this.maxConcurrent = maxConcurrent
    this.networkMonitor = networkMonitor
    this.chunkManager = chunkManager
    this.config = config
  }

  // 启动下载任务
  async startTask(
    task: DownloadTask,
    onProgress?: (taskId: string, progress: DownloadProgress) => void
  ): Promise<void> {
    if (this.activeTasks.has(task.id)) {
      throw new Error(`Task ${task.id} is already active`)
    }

    if (this.activeTasks.size >= this.maxConcurrent) {
      throw new Error('Maximum concurrent downloads reached')
    }

    // Check if task was cancelled before starting
    if (this.cancelledTasks.has(task.id)) {
      this.cancelledTasks.delete(task.id)
      throw new Error(`Task ${task.id} was cancelled`)
    }

    this.activeTasks.add(task.id)

    // Create abort controller for cancellation
    const abortController = new AbortController()
    this.taskAbortControllers.set(task.id, abortController)

    // 创建进度跟踪器
    const progressTracker = new ProgressTracker(task.id, {
      windowSize: 10,
      updateInterval: 1000, // 每秒更新一次
      minSpeedSamples: 2
    })

    // 设置节流回调
    if (onProgress) {
      progressTracker.setThrottledCallback((progress) => {
        onProgress(task.id, progress)
      })
    }

    this.progressTrackers.set(task.id, progressTracker)

    try {
      await this.downloadTask(task, progressTracker, onProgress, abortController.signal)
    } catch (error) {
      // Check if error is due to cancellation
      if (this.cancelledTasks.has(task.id) || abortController.signal.aborted) {
        throw new Error(`Task ${task.id} was cancelled`)
      }
      throw error
    } finally {
      this.activeTasks.delete(task.id)
      this.progressTrackers.delete(task.id)
      this.taskAbortControllers.delete(task.id)
      this.cancelledTasks.delete(task.id)
    }
  }

  // 暂停下载任务
  async pauseTask(taskId: string): Promise<void> {
    await this.cancelTask(taskId)
  }

  // 恢复下载任务
  async resumeTask(taskId: string): Promise<void> {
    this.cancelledTasks.delete(taskId)
  }

  // 取消下载任务
  async cancelTask(taskId: string): Promise<void> {
    this.cancelledTasks.add(taskId)

    // Abort the task if it's active
    const abortController = this.taskAbortControllers.get(taskId)
    if (abortController) {
      abortController.abort()
    }

    // Remove from active tasks
    this.activeTasks.delete(taskId)
    this.progressTrackers.delete(taskId)
    this.taskAbortControllers.delete(taskId)
  }

  // 下载单个任务
  private async downloadTask(
    task: DownloadTask,
    progressTracker: ProgressTracker,
    onProgress?: (taskId: string, progress: DownloadProgress) => void,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const errorContext = {
      taskId: task.id,
      url: task.url,
      filename: task.filename,
      module: task.module,
      timestamp: Date.now()
    }

    try {
      // 获取文件大小 - headers 可能来自 metadata
      const headers = (task.metadata?.headers as Record<string, string>) || undefined
      const totalSize = await this.getFileSize(task.url, headers)

      if (!totalSize) {
        const allowUnknownSize =
          task.module === DownloadModule.RESOURCE_DOWNLOAD ||
          task.metadata?.allowUnknownSize === true
        if (!allowUnknownSize) {
          throw DownloadErrorClass.networkError('Unable to determine file size', errorContext)
        }

        const directResult = await this.downloadWithoutChunks(task, progressTracker, headers)
        const finalTotalSize = directResult.totalSize ?? directResult.downloadedSize
        progressTracker.updateProgress(directResult.downloadedSize, finalTotalSize)
        progressTracker.forceUpdate()

        if (onProgress) {
          onProgress(task.id, {
            percentage: 100,
            totalSize: finalTotalSize,
            downloadedSize: directResult.downloadedSize,
            speed: 0,
            remainingTime: 0
          })
        }

        return
      }

      // 确保临时目录存在（使用配置的临时目录）
      await this.chunkManager.ensureTempDir(task, this.config.storage.tempDir)

      // 创建或复用切片
      const chunks = this.resolveTaskChunks(task, totalSize)
      task.chunks = chunks

      // 从已有临时文件恢复切片进度
      await this.restoreChunkProgress(chunks)

      const resumedDownloaded = chunks.reduce((sum, chunk) => sum + chunk.downloaded, 0)
      progressTracker.updateProgress(resumedDownloaded, totalSize)

      if (onProgress && resumedDownloaded > 0) {
        onProgress(task.id, {
          percentage: totalSize > 0 ? (resumedDownloaded / totalSize) * 100 : 0,
          totalSize,
          downloadedSize: resumedDownloaded,
          speed: 0,
          remainingTime: undefined
        })
      }

      // Check for cancellation before starting chunk downloads
      if (abortSignal?.aborted) {
        throw new Error('Task was cancelled')
      }

      // 并发下载切片
      await this.downloadChunksConcurrently(task, chunks, progressTracker, onProgress, abortSignal)

      // 验证切片完整性
      const isValid = await this.chunkManager.validateChunks(chunks)
      if (!isValid) {
        throw DownloadErrorClass.checksumError('File validation failed', errorContext)
      }

      // 合并切片
      await this.chunkManager.mergeChunks(task, chunks)

      // 更新进度为100%
      progressTracker.updateProgress(totalSize, totalSize)
      progressTracker.forceUpdate()

      // 通知完成
      if (onProgress) {
        onProgress(task.id, {
          percentage: 100,
          totalSize,
          downloadedSize: totalSize,
          speed: 0,
          remainingTime: 0
        })
      }
    } catch (error: unknown) {
      const normalizedError = error instanceof Error ? error : new Error(String(error))
      // 转换为 DownloadErrorClass
      const downloadError =
        error instanceof DownloadErrorClass
          ? error
          : DownloadErrorClass.fromError(normalizedError, errorContext)

      console.error(`Download failed for task ${task.id}:`, downloadError.userMessage)

      throw downloadError
    }
  }

  private resolveTaskChunks(task: DownloadTask, totalSize: number): ChunkInfo[] {
    const existingChunks = Array.isArray(task.chunks)
      ? [...task.chunks].sort((left, right) => left.index - right.index)
      : []

    if (this.hasCompatibleChunkLayout(existingChunks, totalSize)) {
      return existingChunks
    }

    return this.chunkManager.createChunks(task, totalSize)
  }

  private hasCompatibleChunkLayout(chunks: ChunkInfo[], totalSize: number): boolean {
    if (!chunks.length) {
      return false
    }

    let expectedStart = 0
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index]
      if (chunk.index !== index) {
        return false
      }
      if (chunk.start !== expectedStart) {
        return false
      }
      if (chunk.end < chunk.start) {
        return false
      }
      if (chunk.size !== chunk.end - chunk.start + 1) {
        return false
      }
      if (chunk.downloaded < 0 || chunk.downloaded > chunk.size) {
        return false
      }
      if (!chunk.filePath) {
        return false
      }

      expectedStart = chunk.end + 1
    }

    return expectedStart === totalSize
  }

  private async restoreChunkProgress(chunks: ChunkInfo[]): Promise<void> {
    for (const chunk of chunks) {
      if (chunk.status === ChunkStatus.DOWNLOADING) {
        chunk.status = ChunkStatus.PENDING
      }

      try {
        const stats = await fs.stat(chunk.filePath)
        const fileSize = Number.isFinite(stats.size) ? stats.size : 0

        if (fileSize <= 0) {
          chunk.downloaded = 0
          chunk.status = ChunkStatus.PENDING
          continue
        }

        if (fileSize >= chunk.size) {
          chunk.downloaded = chunk.size
          chunk.status = ChunkStatus.COMPLETED
          continue
        }

        chunk.downloaded = fileSize
        chunk.status = ChunkStatus.PENDING
      } catch (error: unknown) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: string }).code
            : undefined

        if (code && code !== 'ENOENT') {
          throw error
        }

        chunk.downloaded = 0
        chunk.status = ChunkStatus.PENDING
      }
    }
  }

  private async downloadWithoutChunks(
    task: DownloadTask,
    progressTracker: ProgressTracker,
    headers?: Record<string, string>
  ): Promise<{ totalSize?: number; downloadedSize: number }> {
    const outputPath = path.join(task.destination, task.filename)
    await fs.mkdir(path.dirname(outputPath), { recursive: true })

    const response = await axios({
      method: 'GET',
      url: task.url,
      headers,
      responseType: 'stream',
      timeout: this.config.network.timeout,
      validateStatus: (status) => status >= 200 && status < 300
    })

    const normalizedHeaders: Record<string, string | number | string[] | undefined | null> = {}
    for (const [key, value] of Object.entries(response.headers ?? {})) {
      if (typeof value === 'boolean') continue
      normalizedHeaders[key] = value as string | number | string[] | null | undefined
    }

    const totalSize = this.resolveTotalSize(normalizedHeaders)
    let downloadedSize = 0

    if (totalSize && totalSize > 0) {
      progressTracker.updateProgress(0, totalSize)
    }

    response.data.on('data', (data: Buffer) => {
      downloadedSize += data.length
      progressTracker.updateProgress(downloadedSize, totalSize)
    })

    const writeStream = createWriteStream(outputPath, { flags: 'w' })

    try {
      await pipeline(response.data, writeStream)
    } catch (error) {
      writeStream.destroy()
      try {
        await fs.unlink(outputPath)
      } catch (cleanupError: unknown) {
        const code =
          typeof cleanupError === 'object' && cleanupError !== null && 'code' in cleanupError
            ? (cleanupError as { code?: string }).code
            : undefined
        if (code !== 'ENOENT') {
          console.warn('Failed to cleanup partial download file:', cleanupError)
        }
      }
      throw error
    }

    return { totalSize, downloadedSize }
  }

  // 并发下载切片
  private async downloadChunksConcurrently(
    task: DownloadTask,
    chunks: ChunkInfo[],
    progressTracker: ProgressTracker,
    _onProgress?: (taskId: string, progress: DownloadProgress) => void,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const runnableChunks = chunks.filter(
      (chunk) => chunk.status !== ChunkStatus.COMPLETED && chunk.downloaded < chunk.size
    )

    if (!runnableChunks.length) {
      const progress = this.chunkManager.getChunkProgress(chunks)
      progressTracker.updateProgress(progress.downloadedSize, progress.totalSize)
      progressTracker.forceUpdate()
      return
    }

    const concurrentLimit = Math.min(this.maxConcurrent, runnableChunks.length)
    const lanes: Promise<void>[] = Array.from({ length: concurrentLimit }, () => Promise.resolve())
    let completedChunks = chunks.filter(
      (chunk) => chunk.status === ChunkStatus.COMPLETED || chunk.downloaded >= chunk.size
    ).length
    const completionCheckpoint = Math.max(1, Math.floor(chunks.length / 10))

    const downloadPromises = runnableChunks.map(async (chunk, index) => {
      if (abortSignal?.aborted) {
        throw new Error('Task was cancelled')
      }

      const laneIndex = index % concurrentLimit
      await lanes[laneIndex]

      const downloadPromise = this.downloadChunk(chunk, task, progressTracker, abortSignal)
      lanes[laneIndex] = downloadPromise

      try {
        await downloadPromise

        if (abortSignal?.aborted) {
          throw new Error('Task was cancelled')
        }

        completedChunks += 1

        const progress = this.chunkManager.getChunkProgress(chunks)
        progressTracker.updateProgress(progress.downloadedSize, progress.totalSize)

        if (completedChunks % completionCheckpoint === 0 || completedChunks === chunks.length) {
          progressTracker.forceUpdate()
        }
      } catch (error) {
        if (abortSignal?.aborted) {
          return
        }
        console.error(`Chunk ${chunk.index} download failed:`, error)
        throw error
      }
    })

    await Promise.all(downloadPromises)
  }

  // 下载单个切片
  private async downloadChunk(
    chunk: ChunkInfo,
    task: DownloadTask,
    _progressTracker: ProgressTracker,
    abortSignal?: AbortSignal
  ): Promise<void> {
    if (chunk.downloaded >= chunk.size) {
      chunk.downloaded = chunk.size
      chunk.status = ChunkStatus.COMPLETED
      return
    }

    const maxRetries = this.config.chunk.maxRetries
    let retryCount = 0

    const errorContext = {
      taskId: task.id,
      url: task.url,
      filename: task.filename,
      module: task.module,
      timestamp: Date.now(),
      additionalInfo: {
        chunkIndex: chunk.index,
        chunkStart: chunk.start,
        chunkEnd: chunk.end
      }
    }

    while (retryCount <= maxRetries) {
      if (abortSignal?.aborted) {
        chunk.status = chunk.downloaded > 0 ? ChunkStatus.PENDING : ChunkStatus.FAILED
        throw new Error('Task was cancelled')
      }

      try {
        chunk.status = ChunkStatus.DOWNLOADING

        const headers = (task.metadata?.headers as Record<string, string>) || {}
        const rangeStart = chunk.start + chunk.downloaded

        if (rangeStart > chunk.end) {
          chunk.downloaded = chunk.size
          chunk.status = ChunkStatus.COMPLETED
          return
        }

        const requiresPartialContent = rangeStart > chunk.start
        const config: AxiosRequestConfig = {
          method: 'GET',
          url: task.url,
          headers: {
            ...headers,
            Range: `bytes=${rangeStart}-${chunk.end}`
          },
          responseType: 'stream',
          timeout: this.config.network.timeout,
          validateStatus: (status) =>
            requiresPartialContent ? status === 206 : status === 206 || status === 200,
          signal: abortSignal
        }

        const response = await axios(config)
        const writeStream = createWriteStream(chunk.filePath, {
          flags: chunk.downloaded > 0 ? 'a' : 'w'
        })

        const onData = (data: Buffer) => {
          chunk.downloaded += data.length
        }
        response.data.on('data', onData)

        try {
          await pipeline(response.data, writeStream)
        } finally {
          response.data.off('data', onData)
        }

        if (chunk.downloaded < chunk.size) {
          throw new Error(`Chunk ${chunk.index} incomplete: ${chunk.downloaded}/${chunk.size}`)
        }

        chunk.downloaded = chunk.size
        chunk.status = ChunkStatus.COMPLETED

        return
      } catch (error) {
        if (abortSignal?.aborted) {
          chunk.status = chunk.downloaded > 0 ? ChunkStatus.PENDING : ChunkStatus.FAILED
          throw new Error('Task was cancelled')
        }

        const isRangeIgnored =
          axios.isAxiosError(error) && error.response?.status === 200 && chunk.downloaded > 0

        if (isRangeIgnored) {
          chunk.downloaded = 0
          chunk.status = ChunkStatus.PENDING
          continue
        }

        retryCount++

        const downloadError =
          error instanceof DownloadErrorClass
            ? error
            : DownloadErrorClass.fromError(error as Error, errorContext)

        console.warn(
          `Chunk ${chunk.index} download failed (attempt ${retryCount}):`,
          downloadError.userMessage
        )

        if (retryCount > maxRetries) {
          chunk.status = ChunkStatus.FAILED
          throw downloadError
        }

        await new Promise((resolve) => setTimeout(resolve, this.config.network.retryDelay))
      }
    }
  }

  // 获取文件大小
  private async getFileSize(url: string, headers?: Record<string, string>): Promise<number | null> {
    try {
      const config: AxiosRequestConfig = {
        method: 'HEAD',
        url,
        headers,
        timeout: this.config.network.timeout
      }

      const response = await axios(config)
      const contentLengthHeader = response.headers['content-length']
      const contentLengthValue = Array.isArray(contentLengthHeader)
        ? contentLengthHeader[0]
        : contentLengthHeader

      if (typeof contentLengthValue === 'number') {
        return Math.floor(contentLengthValue)
      }
      return typeof contentLengthValue === 'string' ? Number.parseInt(contentLengthValue, 10) : null
    } catch (error) {
      const downloadError =
        error instanceof DownloadErrorClass ? error : DownloadErrorClass.fromError(error as Error)

      console.warn('Failed to get file size:', downloadError.userMessage)
      return null
    }
  }

  private resolveTotalSize(
    headers: Record<string, string | number | string[] | undefined | null>
  ): number | undefined {
    const contentLengthHeader = headers?.['content-length']
    const contentLengthValue = Array.isArray(contentLengthHeader)
      ? contentLengthHeader[0]
      : contentLengthHeader

    if (typeof contentLengthValue === 'number') {
      const parsed = Math.floor(contentLengthValue)
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed
      }
    }

    if (typeof contentLengthValue === 'string') {
      const parsed = Number.parseInt(contentLengthValue, 10)
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed
      }
    }

    const contentRangeHeader = headers?.['content-range']
    const contentRange = Array.isArray(contentRangeHeader)
      ? contentRangeHeader[0]
      : contentRangeHeader

    if (typeof contentRange === 'string') {
      const match = contentRange.match(/\/(\d+)$/)
      if (match) {
        const parsed = Number.parseInt(match[1], 10)
        if (!Number.isNaN(parsed) && parsed > 0) {
          return parsed
        }
      }
    }

    return undefined
  }

  // 获取当前活跃任务数量
  getActiveTaskCount(): number {
    return this.activeTasks.size
  }

  // 获取活跃任务列表
  getActiveTasks(): string[] {
    return Array.from(this.activeTasks)
  }

  // 检查是否可以接受新任务
  canAcceptTask(): boolean {
    return this.activeTasks.size < this.maxConcurrent
  }

  // 更新最大并发数 - 注意：maxConcurrent 是 readonly，此方法需要重构
  // updateMaxConcurrent(newMax: number): void {
  //   this.maxConcurrent = Math.max(1, Math.min(10, newMax))
  // }

  // 获取下载统计
  getDownloadStats(): {
    activeTasks: number
    maxConcurrent: number
    networkQuality: string
    recommendedConcurrency: number
  } {
    const networkStatus = this.networkMonitor.getCurrentStatus()

    return {
      activeTasks: this.activeTasks.size,
      maxConcurrent: this.maxConcurrent,
      networkQuality: this.networkMonitor.getNetworkQuality(),
      recommendedConcurrency: networkStatus.recommendedConcurrency
    }
  }

  // 获取任务的进度跟踪器
  getProgressTracker(taskId: string): ProgressTracker | undefined {
    return this.progressTrackers.get(taskId)
  }

  // 获取任务的格式化进度
  getFormattedProgress(taskId: string) {
    const tracker = this.progressTrackers.get(taskId)
    return tracker ? tracker.getFormattedProgress() : null
  }
}
