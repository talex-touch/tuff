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
}

/**
 * Interface for clipboard data with type and content
 */
interface IClipboardData {
  type: keyof IClipboardStash
  data: (string | ClipboardFileResult)[] | string | null
}

/**
 * ClipboardManager handles clipboard monitoring and distribution across windows
 */
export class ClipboardManager {
  windows: TalexTouch.ITouchWindow[]
  clipboardStash: IClipboardStash
  sendLastFunc: () => unknown
  private intervalId: NodeJS.Timeout | null = null
  private isDestroyed = false
  private clipboardHelper: ClipboardHelper

  constructor() {
    this.windows = []
    this.sendLastFunc = () => void 0
    this.clipboardStash = {
      file: null,
      image: null,
      buffer: null,
      text: null
    }
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
        this.sendClipboardMsg()
      } catch (error) {
        console.error('[Clipboard] Error in sendClipboardMsg:', error)
      }

      if (!this.isDestroyed) {
        this.intervalId = setTimeout(intervalRead, 1000)
      }
    }
    intervalRead()
  }

  /**
   * Register a window for clipboard updates
   * @param window - The window to register
   */
  registerWindow(window: TalexTouch.ITouchWindow): void {
    this.windows.push(window)

    window.window.addListener('focus', () => this.sendClipboardMsg())

    console.log('[Clipboard] Register window ' + window.window.id + ' success.')
  }

  /**
   * Unregister a window from clipboard updates
   * @param window - The window to unregister
   */
  unregisterWindow(window: TalexTouch.ITouchWindow): void {
    this.windows = this.windows.filter((w) => w !== window)

    try {
      window.window.removeListener('focus', this.sendClipboardMsg)
    } catch (error) {
      console.warn('[Clipboard] Error removing focus listener:', error)
    }

    console.log('[Clipboard] Unregister window ' + window.window.id + ' success.')
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

    // Clean up all window listeners
    this.windows.forEach((window) => {
      try {
        window.window.removeListener('focus', this.sendClipboardMsg)
      } catch (error) {
        console.warn('[Clipboard] Error removing focus listener during cleanup:', error)
      }
    })

    this.windows = []
    console.log('[Clipboard] ClipboardManager destroyed')
  }

  /**
   * Format clipboard data and check for changes
   * @param type - The type of clipboard data
   * @param data - The clipboard data
   * @returns The data if changed, null otherwise
   */
  formatClipboard<T extends keyof IClipboardStash>(
    type: T,
    data: IClipboardStash[T]
  ): IClipboardStash[T] | null {
    if (data && this.clipboardStash[type] !== data) {
      this.clipboardStash[type] = data
      return data
    }
    return null
  }

  /**
   * Format multiple clipboard types and return the first changed one
   * @param types - Object containing clipboard data for different types
   * @returns Clipboard data object or undefined if no changes
   */
  formatClipboards(types: IClipboardStash): IClipboardData | undefined {
    for (const [type, value] of Object.entries(types)) {
      const data = this.formatClipboard(type as keyof IClipboardStash, value as any)
      if (data) {
        return {
          type: type as keyof IClipboardStash,
          data
        }
      }
    }
    return undefined
  }

  /**
   * Send clipboard message to all registered windows
   */
  sendClipboardMsg(): void {
    if (this.isDestroyed || this.windows.length === 0) {
      return
    }

    const data: Record<string, unknown> = {
      action: 'read',
      time: Date.now()
    }

    try {
      // Use ClipboardHelper for file operations
      const files = this.clipboardHelper.getClipboardFiles()

      // Get other clipboard data
      const image = clipboard.readImage()
      const imageData = image.isEmpty() ? null : image.toDataURL()

      let bufferData: string | null = null
      try {
        bufferData = clipboard.readBuffer('public/utf8-plain-text').toString('base64')
      } catch {
        // Buffer read failed, ignore
      }

      const res = this.formatClipboards({
        file: files.length > 0 ? files : null,
        image: imageData,
        buffer: bufferData,
        text: clipboard.readText() || null
      })

      if (res) {
        Object.assign(data, res)
      }
    } catch (error) {
      console.error('[Clipboard] Error reading clipboard data:', error)
      return
    }

    // Filter out destroyed/invalid windows
    const validWindows = this.windows.filter((w) => {
      try {
        return (
          !w.window.isDestroyed() && w.window.webContents && !w.window.webContents.isDestroyed()
        )
      } catch (error) {
        console.warn('[Clipboard] Window validation failed:', error)
        return false
      }
    })

    // Update windows list to only include valid ones
    if (validWindows.length !== this.windows.length) {
      this.windows = validWindows
    }

    if (validWindows.length === 0) {
      return
    }

    // send to renderer
    const touchChannel = genTouchChannel()
    validWindows.forEach((w) => {
      touchChannel
        .sendTo(w.window, ChannelType.MAIN, 'clipboard:trigger', data)
        .then(() => {})
        .catch((error) => {
          console.error('[Clipboard] Error sending to window:', error)
          // Remove this window from the list if it's causing persistent errors
          this.windows = this.windows.filter((win) => win !== w)
        })
    })

    this.sendLastFunc = () => data
  }
}

export const clipboardManager = new ClipboardManager()

export default {
  name: Symbol('Clipboard'),
  filePath: 'clipboard',
  init(touchApp: TalexTouch.TouchApp): void {
    const win = touchApp.window

    clipboardManager.registerWindow(win)

    // Register cleanup when window is closed
    win.window.on('closed', () => {
      clipboardManager.unregisterWindow(win)
    })

    genTouchChannel().regChannel(ChannelType.MAIN, 'clipboard:got', ({ reply }) => {
      reply(DataCode.SUCCESS, {
        clipboard: clipboardManager.sendLastFunc?.()
      })
    })
  },
  destroy(): void {
    clipboardManager.destroy()
  }
}
