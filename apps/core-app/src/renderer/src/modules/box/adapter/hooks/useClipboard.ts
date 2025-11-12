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
 * Note: Auto-paste does NOT paste text to search bar, only displays in tag.
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
   * Note: Text content is NOT pasted to search bar, only displayed in tag
   */
  function handleAutoPaste(): void {
    if (!clipboardOptions.last || !appSetting.tools.autoPaste.enable) return

    // If already auto-pasted and user cleared it (ESC), don't re-paste
    if (clipboardOptions.autoPasted) {
      console.debug('[Clipboard] Already auto-pasted, skipping to avoid re-paste after ESC')
      return
    }

    const data = clipboardOptions.last

    // Auto-switch to FILE mode for files
    if (data.type === 'files') {
      try {
        const pathList = JSON.parse(data.content)
        const firstFile = pathList[0]

        if (firstFile) {
          boxOptions.file = {
            iconPath: firstFile,
            paths: pathList
          }
          boxOptions.mode = BoxMode.FILE

          // Mark as auto-pasted
          clipboardOptions.autoPasted = true

          // Clear clipboard after switching to FILE mode
          clearClipboard()
        }
      } catch (error) {
        console.error('[Clipboard] Failed to parse file paths:', error)
      }
      return
    }

    // For text/image/html: mark as auto-pasted and keep in clipboardOptions.last for display in tag
    // Text is NOT pasted to search bar, only shown in the suffix tag
    if (data.type === 'text' || data.type === 'image' || data.type === 'html') {
      clipboardOptions.autoPasted = true
      console.debug('[Clipboard] Auto-paste detected, content will be shown in tag', {
        type: data.type,
        length: data.type === 'text' ? data.content.length : undefined
      })

      // Trigger search callback to refresh results
      if (onPasteCallback) {
        onPasteCallback()
      }
    }
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

    // Check if it's the same clipboard content (by timestamp)
    const isSameClipboard =
      clipboardOptions.last && clipboardOptions.last.timestamp === clipboard.timestamp

    // Check if this is the same content that was previously cleared (user pressed ESC)
    const isClearedContent =
      clipboardOptions.lastClearedTimestamp &&
      clipboardOptions.lastClearedTimestamp === clipboard.timestamp

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
    } else if (isClearedContent) {
      // This is the same content that was cleared by user (ESC), restore it but mark as auto-pasted
      clipboardOptions.last = clipboard
      clipboardOptions.autoPasted = true
      console.debug('[Clipboard] Restored previously cleared content, marking as auto-pasted to prevent re-paste')
    } else {
      // New clipboard content, record first detection time
      clipboardOptions.last = clipboard
      clipboardOptions.detectedAt = Date.now()
      // Reset auto-pasted flag for new content
      clipboardOptions.autoPasted = false
      // Clear the lastClearedTimestamp since this is new content
      clipboardOptions.lastClearedTimestamp = null

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
    // If clearing after auto-paste, save the timestamp to prevent re-paste of same content
    if (clipboardOptions.last && clipboardOptions.autoPasted) {
      clipboardOptions.lastClearedTimestamp = clipboardOptions.last.timestamp
      console.debug('[Clipboard] Clearing clipboard after auto-paste, saving timestamp to prevent re-paste', {
        timestamp: clipboardOptions.lastClearedTimestamp
      })
    }

    clipboardOptions.last = null
    clipboardOptions.detectedAt = null
    // Keep autoPasted flag when clearing to prevent re-paste after ESC
    // It will be reset when new clipboard content is detected

    // Trigger search after clearing to refresh results
    if (onPasteCallback) {
      onPasteCallback()
    }
  }

  // Listen for system clipboard changes
  touchChannel.regChannel('clipboard:new-item', (data: any) => {
    if (!data?.type) return

    const clipboardData = data as IClipboardItem

    // New clipboard content, reset detection time, auto-pasted flag, and cleared timestamp
    clipboardOptions.last = clipboardData
    clipboardOptions.detectedAt = Date.now()
    clipboardOptions.autoPasted = false
    clipboardOptions.lastClearedTimestamp = null

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
