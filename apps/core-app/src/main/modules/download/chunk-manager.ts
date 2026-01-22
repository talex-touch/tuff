import type { ChunkInfo, DownloadTask } from '@talex-touch/utils'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ChunkStatus } from '@talex-touch/utils'

export class ChunkManager {
  private readonly chunkSize: number = 1024 * 1024 // 1MB per chunk
  private baseTempDir?: string

  constructor(chunkSize?: number, baseTempDir?: string) {
    if (chunkSize) {
      this.chunkSize = chunkSize
    }
    this.baseTempDir = baseTempDir
  }

  // 设置基础临时目录
  setBaseTempDir(baseTempDir: string): void {
    this.baseTempDir = baseTempDir
  }

  // 创建下载切片
  createChunks(task: DownloadTask, totalSize: number): ChunkInfo[] {
    const chunks: ChunkInfo[] = []
    const chunkCount = Math.ceil(totalSize / this.chunkSize)

    for (let i = 0; i < chunkCount; i++) {
      const start = i * this.chunkSize
      const end = Math.min(start + this.chunkSize - 1, totalSize - 1)
      const size = end - start + 1

      const chunkId = `${task.id}_chunk_${i}`
      const chunkPath = path.join(this.getTempDir(task, this.baseTempDir), `${chunkId}.tmp`)

      chunks.push({
        index: i,
        start,
        end,
        size,
        downloaded: 0,
        status: ChunkStatus.PENDING,
        filePath: chunkPath
      })
    }

    return chunks
  }

  // 合并切片文件
  async mergeChunks(task: DownloadTask, chunks: ChunkInfo[]): Promise<void> {
    const outputPath = path.join(task.destination, task.filename)

    // 确保输出目录存在
    await fs.mkdir(path.dirname(outputPath), { recursive: true })

    // 按顺序合并切片
    const writeStream = await fs.open(outputPath, 'w')

    try {
      for (const chunk of chunks) {
        if (chunk.status === ChunkStatus.COMPLETED) {
          const chunkData = await fs.readFile(chunk.filePath)
          await writeStream.write(chunkData)
        } else {
          throw new Error(`Chunk ${chunk.index} is not completed`)
        }
      }
    } finally {
      await writeStream.close()
    }

    // 清理临时切片文件和任务临时目录
    await this.cleanupChunks(chunks)
    await this.cleanupTaskTempDir(task, this.baseTempDir)
  }

  // 验证切片完整性
  async validateChunks(chunks: ChunkInfo[]): Promise<boolean> {
    for (const chunk of chunks) {
      if (chunk.status !== ChunkStatus.COMPLETED) {
        return false
      }

      try {
        const stats = await fs.stat(chunk.filePath)
        if (stats.size !== chunk.size) {
          console.warn(
            `Chunk ${chunk.index} size mismatch: expected ${chunk.size}, got ${stats.size}`
          )
          return false
        }
      } catch (error) {
        console.error(`Chunk ${chunk.index} file not found:`, error)
        return false
      }
    }

    return true
  }

  // 清理失败的切片
  async cleanupChunks(chunks: ChunkInfo[]): Promise<void> {
    for (const chunk of chunks) {
      try {
        await fs.unlink(chunk.filePath)
      } catch (error: unknown) {
        // 忽略文件不存在错误
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
          console.error(`Failed to cleanup chunk file ${chunk.filePath}:`, error)
        }
      }
    }
  }

  // 获取切片下载进度
  getChunkProgress(chunks: ChunkInfo[]): {
    totalSize: number
    downloadedSize: number
    completedChunks: number
    totalChunks: number
  } {
    let totalSize = 0
    let downloadedSize = 0
    let completedChunks = 0

    for (const chunk of chunks) {
      totalSize += chunk.size
      downloadedSize += chunk.downloaded

      if (chunk.status === ChunkStatus.COMPLETED) {
        completedChunks++
      }
    }

    return {
      totalSize,
      downloadedSize,
      completedChunks,
      totalChunks: chunks.length
    }
  }

  // 检查切片是否可以断点续传
  canResume(chunks: ChunkInfo[]): boolean {
    return chunks.some(
      (chunk) =>
        chunk.status === ChunkStatus.COMPLETED ||
        (chunk.status === ChunkStatus.DOWNLOADING && chunk.downloaded > 0)
    )
  }

  // 获取需要重新下载的切片
  getChunksToRetry(chunks: ChunkInfo[]): ChunkInfo[] {
    return chunks.filter(
      (chunk) => chunk.status === ChunkStatus.FAILED || chunk.status === ChunkStatus.PENDING
    )
  }

  // 获取临时目录 - 使用配置的临时目录而不是目标目录
  getTempDir(task: DownloadTask, baseTempDir?: string): string {
    // 如果提供了基础临时目录，使用它；否则使用任务目标目录下的 .tmp
    if (baseTempDir) {
      return path.join(baseTempDir, task.id)
    }
    return path.join(task.destination, '.tmp', task.id)
  }

  // 确保临时目录存在
  async ensureTempDir(task: DownloadTask, baseTempDir?: string): Promise<string> {
    const tempDir = this.getTempDir(task, baseTempDir)
    await fs.mkdir(tempDir, { recursive: true })
    return tempDir
  }

  // 清理任务的临时目录（包括所有切片文件）
  async cleanupTaskTempDir(task: DownloadTask, baseTempDir?: string): Promise<void> {
    const tempDir = this.getTempDir(task, baseTempDir)
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
      console.log(`Cleaned up temp directory for task ${task.id}: ${tempDir}`)
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        console.error(`Failed to cleanup temp directory ${tempDir}:`, error)
      }
    }
  }

  /**
   * Calculate download speed based on active chunks
   * Note: This is a simplified calculation. For accurate speed tracking,
   * use ProgressTracker which maintains time-series data with timestamps.
   * @param chunks - Array of chunk information
   * @param timeWindowMs - Time window for speed calculation (unused in current implementation)
   * @returns Estimated speed in bytes per second
   */
  calculateSpeed(chunks: ChunkInfo[], timeWindowMs: number = 5000): number {
    // Filter for currently downloading chunks
    const recentChunks = chunks.filter((chunk) => {
      return chunk.status === ChunkStatus.DOWNLOADING
    })

    if (recentChunks.length === 0) {
      return 0
    }

    // 简化计算：假设所有下载中的切片都在最近的时间窗口内
    const totalDownloaded = recentChunks.reduce((sum, chunk) => sum + chunk.downloaded, 0)
    return totalDownloaded / (timeWindowMs / 1000) // bytes per second
  }

  // 估算剩余时间
  estimateRemainingTime(chunks: ChunkInfo[], currentSpeed: number): number | undefined {
    if (currentSpeed <= 0) {
      return undefined
    }

    const progress = this.getChunkProgress(chunks)
    const remainingBytes = progress.totalSize - progress.downloadedSize

    return Math.ceil(remainingBytes / currentSpeed) // seconds
  }
}
