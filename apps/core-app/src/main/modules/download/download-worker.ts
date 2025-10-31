import axios, { AxiosRequestConfig } from 'axios'
import { createWriteStream } from 'fs'
import {
  DownloadTask,
  ChunkInfo,
  ChunkStatus,
  DownloadStatus,
  DownloadConfig
} from '@talex-touch/utils'
import { ChunkManager } from './chunk-manager'
import { NetworkMonitor } from './network-monitor'

export class DownloadWorker {
  private readonly maxConcurrent: number
  private activeTasks: Set<string> = new Set()
  private networkMonitor: NetworkMonitor
  private chunkManager: ChunkManager
  private config: DownloadConfig

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
    onProgress?: (taskId: string, progress: any) => void
  ): Promise<void> {
    if (this.activeTasks.has(task.id)) {
      throw new Error(`Task ${task.id} is already active`)
    }

    if (this.activeTasks.size >= this.maxConcurrent) {
      throw new Error('Maximum concurrent downloads reached')
    }

    this.activeTasks.add(task.id)

    try {
      await this.downloadTask(task, onProgress)
    } finally {
      this.activeTasks.delete(task.id)
    }
  }

  // 暂停下载任务
  async pauseTask(taskId: string): Promise<void> {
    // 实现暂停逻辑
    // 这里需要与具体的下载实现配合
    console.log(`Pausing task ${taskId}`)
  }

  // 恢复下载任务
  async resumeTask(taskId: string): Promise<void> {
    // 实现恢复逻辑
    console.log(`Resuming task ${taskId}`)
  }

  // 取消下载任务
  async cancelTask(taskId: string): Promise<void> {
    // 实现取消逻辑
    this.activeTasks.delete(taskId)
    console.log(`Cancelling task ${taskId}`)
  }

  // 下载单个任务
  private async downloadTask(
    task: DownloadTask,
    onProgress?: (taskId: string, progress: any) => void
  ): Promise<void> {
    try {
      // 获取文件大小 - headers 可能来自 metadata
      const headers = (task.metadata?.headers as Record<string, string>) || undefined
      const totalSize = await this.getFileSize(task.url, headers)

      if (!totalSize) {
        throw new Error('Unable to determine file size')
      }

      // 创建切片
      const chunks = this.chunkManager.createChunks(task, totalSize)

      // 确保临时目录存在
      await this.chunkManager.ensureTempDir(task)

      // 并发下载切片
      await this.downloadChunksConcurrently(task, chunks, onProgress)

      // 验证切片完整性
      const isValid = await this.chunkManager.validateChunks(chunks)
      if (!isValid) {
        throw new Error('File validation failed')
      }

      // 合并切片
      await this.chunkManager.mergeChunks(task, chunks)

      // 通知完成
      if (onProgress) {
        onProgress(task.id, {
          status: DownloadStatus.COMPLETED,
          percentage: 100,
          totalSize,
          downloadedSize: totalSize
        })
      }
    } catch (error: unknown) {
      console.error(`Download failed for task ${task.id}:`, error)

      if (onProgress) {
        onProgress(task.id, {
          status: DownloadStatus.FAILED,
          error: error instanceof Error ? error.message : String(error)
        })
      }

      throw error
    }
  }

  // 并发下载切片
  private async downloadChunksConcurrently(
    task: DownloadTask,
    chunks: ChunkInfo[],
    onProgress?: (taskId: string, progress: any) => void
  ): Promise<void> {
    const concurrentLimit = Math.min(this.maxConcurrent, chunks.length)
    const semaphore = new Array(concurrentLimit).fill(null)
    let completedChunks = 0

    const downloadPromises = chunks.map(async (chunk, index) => {
      await semaphore[index % concurrentLimit]
      semaphore[index % concurrentLimit] = this.downloadChunk(chunk, task)

      try {
        await semaphore[index % concurrentLimit]
        completedChunks++

        // 更新进度
        if (onProgress) {
          const progress = this.chunkManager.getChunkProgress(chunks)
          const percentage =
            progress.totalSize > 0
              ? Math.round((progress.downloadedSize / progress.totalSize) * 100)
              : 0

          onProgress(task.id, {
            status: DownloadStatus.DOWNLOADING,
            percentage,
            totalSize: progress.totalSize,
            downloadedSize: progress.downloadedSize,
            completedChunks: progress.completedChunks,
            totalChunks: progress.totalChunks
          })
        }
      } catch (error) {
        console.error(`Chunk ${chunk.index} download failed:`, error)
        throw error
      }
    })

    await Promise.all(downloadPromises)
  }

  // 下载单个切片
  private async downloadChunk(chunk: ChunkInfo, task: DownloadTask): Promise<void> {
    const maxRetries = this.config.chunk.maxRetries
    let retryCount = 0

    while (retryCount <= maxRetries) {
      try {
        chunk.status = ChunkStatus.DOWNLOADING

        const headers = (task.metadata?.headers as Record<string, string>) || {}
        const config: AxiosRequestConfig = {
          method: 'GET',
          url: task.url,
          headers: {
            ...headers,
            Range: `bytes=${chunk.start + chunk.downloaded}-${chunk.end}`
          },
          responseType: 'stream',
          timeout: this.config.network.timeout,
          validateStatus: (status) => status === 206 || status === 200 // Accept partial content
        }

        const response = await axios(config)
        const writeStream = createWriteStream(chunk.filePath, {
          flags: chunk.downloaded > 0 ? 'a' : 'w'
        })

        try {
          // 流式写入
          await new Promise<void>((resolve, reject) => {
            response.data.pipe(writeStream)

            response.data.on('data', (data: Buffer) => {
              chunk.downloaded += data.length
            })

            response.data.on('end', () => {
              chunk.status = ChunkStatus.COMPLETED
              writeStream.end()
              resolve()
            })

            response.data.on('error', reject)
            writeStream.on('error', reject)
            writeStream.on('finish', resolve)
          })
        } finally {
          writeStream.destroy()
        }

        // 下载成功
        return
      } catch (error) {
        retryCount++
        console.warn(`Chunk ${chunk.index} download failed (attempt ${retryCount}):`, error)

        if (retryCount > maxRetries) {
          chunk.status = ChunkStatus.FAILED
          throw error
        }

        // 等待重试
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
      const contentLength = response.headers['content-length']

      return contentLength ? parseInt(contentLength, 10) : null
    } catch (error) {
      console.warn('Failed to get file size:', error)
      return null
    }
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
}
