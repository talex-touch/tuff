import { promises as fs } from 'fs'
import path from 'path'
import { ChunkInfo, ChunkStatus, DownloadTask } from '@talex-touch/utils'

export class ChunkManager {
  private readonly chunkSize: number = 1024 * 1024 // 1MB per chunk

  constructor(chunkSize?: number) {
    if (chunkSize) {
      this.chunkSize = chunkSize
    }
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
      const chunkPath = path.join(this.getTempDir(task), `${chunkId}.tmp`)

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

    // 清理临时切片文件
    await this.cleanupChunks(chunks)
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
          console.warn(`Chunk ${chunk.index} size mismatch: expected ${chunk.size}, got ${stats.size}`)
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
      } catch (error) {
        // 忽略文件不存在错误
        if (error.code !== 'ENOENT') {
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
    return chunks.some(chunk =>
      chunk.status === ChunkStatus.COMPLETED ||
      (chunk.status === ChunkStatus.DOWNLOADING && chunk.downloaded > 0)
    )
  }

  // 获取需要重新下载的切片
  getChunksToRetry(chunks: ChunkInfo[]): ChunkInfo[] {
    return chunks.filter(chunk =>
      chunk.status === ChunkStatus.FAILED ||
      chunk.status === ChunkStatus.PENDING
    )
  }

  // 获取临时目录
  private getTempDir(task: DownloadTask): string {
    return path.join(task.destination, '.tmp', task.id)
  }

  // 确保临时目录存在
  async ensureTempDir(task: DownloadTask): Promise<string> {
    const tempDir = this.getTempDir(task)
    await fs.mkdir(tempDir, { recursive: true })
    return tempDir
  }

  // 计算下载速度
  calculateSpeed(chunks: ChunkInfo[], timeWindowMs: number = 5000): number {
    const now = Date.now()
    const recentChunks = chunks.filter(chunk => {
      // 这里需要在实际下载时记录时间戳
      // 暂时返回所有下载中的切片
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
