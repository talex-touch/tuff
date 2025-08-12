import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { genTouchChannel } from '../core/channel-core'
import { TalexTouch } from '../types'
import { clipboard } from 'electron'
import { ClipboardHelper, type ClipboardFileResult } from '@talex-touch/utils/electron'

/**
 * Interface representing the clipboard stash data structure
 */
export interface IClipboardStash {
  /** Array of file paths or file objects, or null if no files */
  file: (string | ClipboardFileResult)[] | null
  /** Base64 encoded image data or null if no image */
  image: string | null
  /** Buffer data as base64 string or null if no buffer */
  buffer: string | null
  /** Plain text content or null if no text */
  text: string | null
  /** Timestamp of when the data was stashed */
  time: number
}

const MAX_HISTORY_LENGTH = 50
const PAGE_SIZE = 20

/**
 * ClipboardManager handles clipboard monitoring and local storage
 */
export class ClipboardManager {
  private registeredWindows: Set<TalexTouch.ITouchWindow> = new Set()
  private clipboardHistory: IClipboardStash[] = []
  private lastStash: Partial<IClipboardStash> = {}
  private intervalId: NodeJS.Timeout | null = null
  private isDestroyed = false
  private clipboardHelper: ClipboardHelper

  constructor() {
    this.clipboardHelper = new ClipboardHelper()
    this.startClipboardMonitoring()
  }

  /**
   * Start monitoring clipboard changes with periodic checks
   */
  private startClipboardMonitoring(): void {
    const intervalRead = (): void => {
      if (this.isDestroyed) return
      try {
        this.updateClipboardHistory()
      } catch (error) {
        console.error('[Clipboard] Error in updateClipboardHistory:', error)
      }
      if (!this.isDestroyed) {
        this.intervalId = setTimeout(intervalRead, 1000)
      }
    }
    intervalRead()
  }

  /**
   * Register a window for clipboard updates (only for 'register' type windows)
   * @param window - The window to register
   */
  registerWindow(window: TalexTouch.ITouchWindow): void {
    this.registeredWindows.add(window)
    window.window.addListener('focus', () => this.sendClipboardUpdate(window))
    console.log(`[Clipboard] Register window ${window.window.id} success.`)
  }

  /**
   * Unregister a window from clipboard updates
   * @param window - The window to unregister
   */
  unregisterWindow(window: TalexTouch.ITouchWindow): void {
    this.registeredWindows.delete(window)
    try {
      window.window.removeListener('focus', () => this.sendClipboardUpdate(window))
    } catch (error) {
      console.warn('[Clipboard] Error removing focus listener:', error)
    }
    console.log(`[Clipboard] Unregister window ${window.window.id} success.`)
  }

  /**
   * Destroy the clipboard manager and clean up resources
   */
  destroy(): void {
    this.isDestroyed = true
    if (this.intervalId) {
      clearTimeout(this.intervalId)
      this.intervalId = null
    }
    this.registeredWindows.forEach((window) => {
      try {
        window.window.removeListener('focus', () => this.sendClipboardUpdate(window))
      } catch (error) {
        console.warn('[Clipboard] Error removing focus listener during cleanup:', error)
      }
    })
    this.registeredWindows.clear()
    console.log('[Clipboard] ClipboardManager destroyed')
  }

  private hasChanged<T extends keyof Omit<IClipboardStash, 'time'>>(
    type: T,
    data: IClipboardStash[T]
  ): boolean {
    const changed = JSON.stringify(this.lastStash[type]) !== JSON.stringify(data)
    if (changed) {
      this.lastStash[type] = data
    }
    return changed
  }

  /**
   * Update clipboard history with new data if changed
   */
  private updateClipboardHistory(): void {
    const files = this.clipboardHelper.getClipboardFiles()
    const image = clipboard.readImage()
    const imageData = image.isEmpty() ? null : image.toDataURL()
    const text = clipboard.readText() || null
    let bufferData: string | null = null
    try {
      bufferData = clipboard.readBuffer('public/utf8-plain-text').toString('base64')
    } catch {
      /* ignore */
    }

    const stash: Omit<IClipboardStash, 'time'> = {
      file: files.length > 0 ? files : null,
      image: imageData,
      buffer: bufferData,
      text
    }

    const changed = Object.keys(stash).some((key) =>
      this.hasChanged(key as keyof typeof stash, stash[key as keyof typeof stash])
    )

    if (changed) {
      const newStash: IClipboardStash = { ...stash, time: Date.now() }
      this.clipboardHistory.unshift(newStash)
      // TODO: Later, this will be replaced with database storage.
      if (this.clipboardHistory.length > MAX_HISTORY_LENGTH) {
        this.clipboardHistory.pop()
      }
      this.registeredWindows.forEach((win) => this.sendClipboardUpdate(win, newStash))
    }
  }

  /**
   * Send clipboard update to a specific window
   * @param window - The window to send the update to
   * @param data - The clipboard data to send
   */
  private sendClipboardUpdate(window: TalexTouch.ITouchWindow, data?: IClipboardStash): void {
    if (window.window.isDestroyed() || window.window.webContents.isDestroyed()) {
      this.unregisterWindow(window)
      return
    }
    const payload = data || this.clipboardHistory[0]
    if (!payload) return

    genTouchChannel()
      .sendTo(window.window, ChannelType.MAIN, 'clipboard:trigger', {
        action: 'read',
        ...payload
      })
      .catch((error) => {
        console.error('[Clipboard] Error sending to window:', error)
        this.unregisterWindow(window)
      })
  }

  /**
   * Setup IPC channel for renderer to get clipboard history
   */
  public setupChannel(): void {
    genTouchChannel().regChannel(
      ChannelType.MAIN,
      'clipboard:get-history',
      ({ data: payload, reply }) => {
        const { page = 1 } = payload ?? {}
        const start = (page - 1) * PAGE_SIZE
        const end = start + PAGE_SIZE
        const pagedHistory = this.clipboardHistory.slice(start, end)
        reply(DataCode.SUCCESS, {
          history: pagedHistory,
          total: this.clipboardHistory.length,
          page,
          pageSize: PAGE_SIZE
        })
      }
    )
  }

  /**
   * Get the latest clipboard data
   * @returns The latest clipboard stash
   */
  public getLatest(): IClipboardStash | undefined {
    return this.clipboardHistory[0]
  }
}

export const clipboardManager = new ClipboardManager()

export default {
  name: Symbol('Clipboard'),
  filePath: 'clipboard',
  init(touchApp: TalexTouch.TouchApp): void {
    const win = touchApp.window
    // Default is not to register, registration is done on demand.
    // e.g. if(win.name === 'register') clipboardManager.registerWindow(win)

    win.window.on('closed', () => {
      clipboardManager.unregisterWindow(win)
    })

    clipboardManager.setupChannel()
  },
  destroy(): void {
    clipboardManager.destroy()
  }
}
