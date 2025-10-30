import { touchChannel } from '~/modules/channel/channel-core'
import { appSetting } from '~/modules/channel/storage'
import { BoxMode, IBoxOptions } from '..'
import type { IClipboardHook, IClipboardOptions, IClipboardItem } from './types'

/**
 * Clipboard management hook
 *
 * Uses timestamp comparison instead of timers for expiration checking.
 * Clipboard state is preserved when CoreBox is hidden, allowing expiration
 * check on next open.
 *
 * @param boxOptions - Box options for managing file mode
 * @returns Clipboard hook interface
 */
export function useClipboard(
  boxOptions: IBoxOptions,
  clipboardOptions: IClipboardOptions,
  onPasteCallback?: () => void
): Omit<IClipboardHook, 'clipboardOptions'> {

  /**
   * Check if current clipboard content has expired based on settings
   *
   * @returns true if clipboard is expired, false otherwise
   */
  function isClipboardExpired(): boolean {
    if (!clipboardOptions.last || !clipboardOptions.detectedAt) {
      return false
    }

    const time = appSetting.tools.autoPaste.time

    // -1: never expire
    if (time === -1) return false

    // 0: not handled here (cleared after execute)
    if (time === 0) return false

    // Check elapsed time since first detection
    const elapsed = Date.now() - clipboardOptions.detectedAt
    return elapsed >= time * 1000
  }

  /**
   * Auto-paste logic: switch to FILE mode for file clipboard
   */
  function handleAutoPaste(): void {
    if (!clipboardOptions.last) return

    const data = clipboardOptions.last

    // Only auto-switch to FILE mode for files
    if (data.type === 'files' && appSetting.tools.autoPaste.enable) {
      try {
        const pathList = JSON.parse(data.content)
        const firstFile = pathList[0]

        if (firstFile) {
          boxOptions.file = {
            iconPath: firstFile,
            paths: pathList
          }
          boxOptions.mode = BoxMode.FILE

          // Clear clipboard after switching to FILE mode
          clearClipboard()
        }
      } catch (error) {
        console.error('[Clipboard] Failed to parse file paths:', error)
      }
    }
    // For text/image/html: keep in clipboardOptions.last for display in tag
  }

  /**
   * Refresh clipboard content from system
   * Checks expiration and manages detection timestamp
   */
  function handlePaste(): void {
    const clipboard = touchChannel.sendSync('clipboard:get-latest') as IClipboardItem | null

    if (!clipboard || !clipboard.timestamp) {
      clearClipboard()
      return
    }

    // Check if it's the same clipboard content
    const isSameClipboard =
      clipboardOptions.last &&
      clipboardOptions.last.timestamp === clipboard.timestamp

    if (isSameClipboard) {
      // Same clipboard, check if expired
      if (isClipboardExpired()) {
        const elapsed = clipboardOptions.detectedAt
          ? Math.round((Date.now() - clipboardOptions.detectedAt) / 1000)
          : 0

        console.debug('[Clipboard] Content expired, clearing', {
          elapsed: elapsed + 's',
          maxAge: appSetting.tools.autoPaste.time + 's'
        })
        clearClipboard()
        return
      }
      // Not expired, keep displaying
    } else {
      // New clipboard content, record first detection time
      clipboardOptions.last = clipboard
      clipboardOptions.detectedAt = Date.now()

      console.debug('[Clipboard] New content detected', {
        type: clipboard.type,
        timestamp: new Date(clipboard.timestamp).toISOString()
      })

      // Trigger search when new clipboard content is pasted
      if (onPasteCallback) {
        onPasteCallback()
      }
    }

    handleAutoPaste()
  }

  /**
   * Apply clipboard item to active application
   *
   * @param item - Optional clipboard item, defaults to current
   * @returns Promise<boolean> success status
   */
  async function applyToActiveApp(item?: IClipboardItem): Promise<boolean> {
    const target = item ?? clipboardOptions.last
    if (!target) return false

    try {
      const result = await touchChannel.send('clipboard:apply-to-active-app', { item: target })
      if (typeof result === 'object' && result) {
        return Boolean(result.success)
      }
      return true
    } catch (error) {
      console.error('[Clipboard] Failed to apply to active app:', error)
      return false
    }
  }

  /**
   * Clear clipboard state completely
   */
  function clearClipboard(): void {
    clipboardOptions.last = null
    clipboardOptions.detectedAt = null

    // Trigger search after clearing to refresh results
    if (onPasteCallback) {
      onPasteCallback()
    }
  }

  // Listen for system clipboard changes
  touchChannel.regChannel('clipboard:new-item', (data: any) => {
    if (!data?.type) return

    const clipboardData = data as IClipboardItem

    // New clipboard content, reset detection time
    clipboardOptions.last = clipboardData
    clipboardOptions.detectedAt = Date.now()

    console.debug('[Clipboard] System clipboard changed', {
      type: clipboardData.type,
      timestamp: new Date(clipboardData.timestamp).toISOString()
    })
  })

  return {
    handlePaste,
    handleAutoPaste,
    applyToActiveApp,
    clearClipboard,
    isClipboardExpired
  }
}
