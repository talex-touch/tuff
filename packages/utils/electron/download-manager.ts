import path from 'node:path'
import { net } from 'electron'
import fse from 'fs-extra'
import { getLogger } from '../common/logger'

const downloadLog = getLogger('download-manager')

interface DownloadItem {
  url: string
  filename: string
  apply?: (filePath: string) => void
}

export class DownloadManager {
  private basePath: string
  private downloadQueue: DownloadItem[] = []
  private isDownloading = false

  constructor(basePath: string = '') {
    this.basePath = basePath
  }

  /**
   * Add a download item to the queue
   * @param item The download item object
   */
  addDownload(item: DownloadItem): void {
    this.downloadQueue.push(item)
    if (!this.isDownloading) {
      this.processQueue()
    }
  }

  /**
   * Add multiple download items to the queue
   * @param items Array of download items
   */
  addDownloads(items: DownloadItem[]): void {
    this.downloadQueue.push(...items)
    if (!this.isDownloading) {
      this.processQueue()
    }
  }

  /**
   * Process the download queue
   */
  private async processQueue(): Promise<void> {
    if (this.downloadQueue.length === 0) {
      this.isDownloading = false
      return
    }

    this.isDownloading = true
    const item = this.downloadQueue.shift()!

    try {
      downloadLog.info(`Starting to download ${item.filename} from ${item.url}`)
      const filePath = await this.downloadFile(item.url, item.filename)
      downloadLog.info(`Download ${item.filename} completed`)

      if (item.apply) {
        item.apply(filePath)
      }
    }
    catch (error) {
      downloadLog.error(`Download ${item.filename} failed`, { error })
    }

    this.processQueue()
  }

  /**
   * Download a single file
   * @param url The download URL
   * @param filename The filename to save as
   * @returns The file path where the file is saved
   */
  private downloadFile(url: string, filename: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const request = net.request(url)
      const filePath = this.basePath ? path.join(this.basePath, filename) : filename

      downloadLog.info(`File download request sent for ${filename}.`)

      request.addListener('error', (error) => {
        downloadLog.error(`Download request error for ${filename}`, { error })
        reject(error)
      })

      request.addListener('response', (response) => {
        fse.createFileSync(filePath)

        response.addListener('data', (chunk: any) => {
          downloadLog.debug(`Downloading ${filename}...`)
          fse.appendFile(filePath, chunk, 'utf8')
        })

        response.addListener('end', () => {
          downloadLog.info(`Download ${filename} finished.`)
          resolve(filePath)
        })
      })

      request.end()
    })
  }

  /**
   * Clear the download queue
   */
  clearQueue(): void {
    this.downloadQueue = []
  }

  /**
   * Get the number of items in the download queue
   */
  getQueueLength(): number {
    return this.downloadQueue.length
  }
}
