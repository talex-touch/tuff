import { clipboard } from 'electron'
// import { touchChannel } from '../core/bridge/touch-channel'
// import { IClipboardItem } from '@talex-touch/utils/types/clipboard'
import { clipboardHistory } from '../db/schema'
import { desc, gt, sql, eq } from 'drizzle-orm'
// import { pluginManager } from './plugin-manager/plugin-manager'
import * as macWindows from 'mac-windows'
import { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from '../db/schema'
import { DataCode } from '@talex-touch/utils'
import { databaseManager } from './database'
import { genTouchChannel } from '../core/channel-core'
import { windowManager } from './box-tool/core-box/window'
// import { genPluginManager } from '../plugins'
import { ChannelType } from '@talex-touch/utils/channel'

export interface IClipboardItem {
  id?: number
  type: 'text' | 'image' | 'files'
  content: string
  thumbnail?: string | null
  rawContent?: string | null
  sourceApp?: string | null
  timestamp?: Date
  isFavorite?: boolean | null
}

const PAGE_SIZE = 20
const CACHE_MAX_COUNT = 20
const CACHE_MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

class ClipboardHelper {
  private lastText: string = clipboard.readText()
  private lastImage: string = clipboard.readImage().toDataURL()
  private lastFiles: string[] = this.getClipboardFiles()

  private getClipboardFiles(): string[] {
    const rawFilePath = clipboard.read('public.file-url').toString()
    if (!rawFilePath) return []
    // Decode file URLs (e.g., file:///Users/...) and split by newlines
    return rawFilePath
      .split(/\r\n|\n|\r/)
      .filter(Boolean)
      .map((url) => {
        try {
          return decodeURI(new URL(url).pathname)
        } catch {
          return ''
        }
      })
      .filter(Boolean)
  }

  isFilesChanged(): boolean {
    const currentFiles = this.getClipboardFiles()
    if (currentFiles.length === 0) return false
    if (
      currentFiles.length === this.lastFiles.length &&
      currentFiles.every((file, index) => file === this.lastFiles[index])
    ) {
      return false
    }
    this.lastFiles = currentFiles
    return true
  }

  isImageChanged(): boolean {
    const currentImage = clipboard.readImage()
    if (currentImage.isEmpty()) return false
    const currentImageHash = currentImage.toDataURL()
    if (this.lastImage === currentImageHash) return false
    this.lastImage = currentImageHash
    return true
  }

  isTextChanged(): boolean {
    const currentText = clipboard.readText()
    if (!currentText || currentText === this.lastText) return false
    this.lastText = currentText
    return true
  }

}

export class ClipboardManager {
  private memoryCache: IClipboardItem[] = []
  private intervalId: NodeJS.Timeout | null = null
  private isDestroyed = false
  private clipboardHelper: ClipboardHelper
  private db: LibSQLDatabase<typeof schema>

  constructor() {
    this.db = databaseManager.getDb()
    this.clipboardHelper = new ClipboardHelper()
    this.startClipboardMonitoring()
    this.loadInitialCache()
  }

  private async loadInitialCache() {
    this.memoryCache = await this.db
      .select()
      .from(clipboardHistory)
      .orderBy(desc(clipboardHistory.timestamp))
      .limit(CACHE_MAX_COUNT)
  }

  private updateMemoryCache(item: IClipboardItem) {
    this.memoryCache.unshift(item)
    if (this.memoryCache.length > CACHE_MAX_COUNT) {
      this.memoryCache.pop()
    }
    const oneHourAgo = Date.now() - CACHE_MAX_AGE_MS
    this.memoryCache = this.memoryCache.filter((i) => (i.timestamp as Date).getTime() > oneHourAgo)
  }

  private startClipboardMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
    this.intervalId = setInterval(this.checkClipboard.bind(this), 1000)
    this.registerIpcHandlers()
  }

  private async checkClipboard(): Promise<void> {
    if (this.isDestroyed) return

    let item: Omit<IClipboardItem, 'timestamp' | 'id'> | null = null

    if (this.clipboardHelper.isFilesChanged()) {
      const files = this.clipboardHelper['lastFiles'] // Access private member for efficiency
      item = {
        type: 'files',
        content: JSON.stringify(files)
      }
    } else if (this.clipboardHelper.isImageChanged()) {
      const image = clipboard.readImage()
      const thumbnail = image.resize({ width: 128 }).toDataURL()
      item = {
        type: 'image',
        content: image.toDataURL(),
        thumbnail
      }
      // When copying images, text might also be present (e.g., from web), clear it.
      this.clipboardHelper['lastText'] = ''
    } else if (this.clipboardHelper.isTextChanged()) {
      const text = clipboard.readText()
      const html = clipboard.readHTML()
      item = {
        type: 'text',
        content: text,
        rawContent: html
      }
    }

    if (item) {
      if (process.platform === 'darwin') {
        try {
          // The first window in the list is the active one
          const windows = await macWindows.getWindows({ onScreenOnly: true })
          if (windows && windows.length > 0) {
            item.sourceApp = windows[0].owner?.bundleId
          }
        } catch (error) {
          console.error('Failed to get active window info:', error)
        }
      }

      const newItem = {
        ...item,
        timestamp: new Date()
      }

      const inserted = await this.db.insert(clipboardHistory).values(newItem).returning()
      if (inserted.length > 0) {
        const newItem = inserted[0]
        this.updateMemoryCache(newItem)

        // Broadcast to all renderer processes
        const touchChannel = genTouchChannel()
        for (const win of windowManager.windows) {
          if (!win.window.isDestroyed()) {
            touchChannel.sendToMain(win.window, 'clipboard:new-item', newItem)
          }
        }

        // Broadcast to plugins is handled by the renderer process via IPC
      }
    }
  }

  private registerIpcHandlers(): void {
    const touchChannel = genTouchChannel()

    touchChannel.regChannel(ChannelType.MAIN, 'clipboard:get-latest', async ({ reply }) => {
      const latest = this.memoryCache.length > 0 ? this.memoryCache[0] : null
      reply(DataCode.SUCCESS, latest)
    })

    touchChannel.regChannel(
      ChannelType.MAIN,
      'clipboard:get-history',
      async ({ data: payload, reply }) => {
        const { page = 1 } = payload ?? {}
        const offset = (page - 1) * PAGE_SIZE
        const history = await this.db
          .select()
          .from(clipboardHistory)
          .orderBy(desc(clipboardHistory.timestamp))
          .limit(PAGE_SIZE)
          .offset(offset)
        const totalResult = await this.db
          .select({ count: sql<number>`count(*)` })
          .from(clipboardHistory)
        const total = totalResult[0].count
        reply(DataCode.SUCCESS, { history, total, page, pageSize: PAGE_SIZE })
      }
    )

    touchChannel.regChannel(
      ChannelType.MAIN,
      'clipboard:set-favorite',
      async ({ data, reply }) => {
        const { id, isFavorite } = data
        await this.db.update(clipboardHistory).set({ isFavorite }).where(eq(clipboardHistory.id, id))
        reply(DataCode.SUCCESS, null)
      }
    )

    touchChannel.regChannel(
      ChannelType.MAIN,
      'clipboard:delete-item',
      async ({ data, reply }) => {
        const { id } = data
        await this.db.delete(clipboardHistory).where(eq(clipboardHistory.id, id))
        this.memoryCache = this.memoryCache.filter((item) => item.id !== id)
        reply(DataCode.SUCCESS, null)
      }
    )

    touchChannel.regChannel(ChannelType.MAIN, 'clipboard:clear-history', async ({ reply }) => {
      const oneHourAgo = new Date(Date.now() - CACHE_MAX_AGE_MS)
      await this.db.delete(clipboardHistory).where(gt(clipboardHistory.timestamp, oneHourAgo))
      this.memoryCache = []
      reply(DataCode.SUCCESS, null)
    })
  }

  public destroy(): void {
    this.isDestroyed = true
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }
}

let clipboardManager: ClipboardManager | null

function initClipboardManager() {
  if (!clipboardManager) {
    clipboardManager = new ClipboardManager()
    console.log('[Clipboard] ClipboardManager initialized.')
  }
}

export default {
  name: Symbol('Clipboard'),
  filePath: 'clipboard',
  async init() {
    initClipboardManager()
  },
  destroy() {
    clipboardManager?.destroy()
    clipboardManager = null
    console.log('[Clipboard] ClipboardManager destroyed.')
  }
}

export function getClipboardManager(): ClipboardManager | null {
  return clipboardManager
}
