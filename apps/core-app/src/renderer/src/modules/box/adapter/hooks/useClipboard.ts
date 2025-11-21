import type { IBoxOptions } from '..'
import type { IClipboardHook, IClipboardItem, IClipboardOptions } from './types'
import { touchChannel } from '~/modules/channel/channel-core'
import { appSetting } from '~/modules/channel/storage'
import { BoxMode } from '..'

// Utility function to normalize various timestamp formats
function normalizeTimestamp(value?: string | number | Date | null): number | null {
  if (value === null || value === undefined)
    return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isFinite(time) ? time : null
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

// Track auto-pasted timestamps to prevent duplicate auto-paste
const autoPastedTimestamps = new Set<number>()

/**
 * Cleans up old autopaste records (older than 1 hour)
 *
 * @remarks
 * This function is called periodically to prevent memory leaks
 * from accumulating old timestamps in the Set.
 */
function cleanupAutoPastedRecords(): void {
  const oneHourAgo = Date.now() - 60 * 60 * 1000
  for (const ts of autoPastedTimestamps) {
    if (ts < oneHourAgo) {
      autoPastedTimestamps.delete(ts)
    }
  }
}

/**
 * Resets the autopaste state for a new CoreBox session
 *
 * @remarks
 * Should be called when CoreBox opens to clear stale autopaste records
 * from previous sessions. This ensures consistent behavior across sessions
 * and prevents dismissed clipboard items from affecting future sessions.
 *
 * Also performs cleanup of old records (>1 hour) to prevent memory leaks.
 */
function resetAutoPasteState(): void {
  // Clear all autopaste records from previous session
  autoPastedTimestamps.clear()

  // Also perform cleanup of any stale records (defensive)
  cleanupAutoPastedRecords()
}

export function useClipboard(
  boxOptions: IBoxOptions,
  clipboardOptions: IClipboardOptions,
  onPasteCallback?: () => void,
  searchVal?: import('vue').Ref<string>,
): Omit<IClipboardHook, 'clipboardOptions'> {
  function canAutoPaste(): boolean {
    if (!clipboardOptions.last || !clipboardOptions.last.timestamp)
      return false
    if (!appSetting.tools.autoPaste.enable)
      return false

    const limit = appSetting.tools.autoPaste.time
    if (limit === -1)
      return false
    if (limit === 0)
      return true

    // Use database timestamp (real copy time) instead of detectedAt
    const copiedTime = new Date(clipboardOptions.last.timestamp).getTime()
    const now = Date.now()
    const elapsed = now - copiedTime

    console.debug('[Clipboard] AutoPaste time check', {
      copiedAt: new Date(copiedTime).toISOString(),
      now: new Date(now).toISOString(),
      elapsed,
      limit: limit * 1000,
      canPaste: elapsed <= limit * 1000,
    })

    return elapsed <= limit * 1000
  }

  /**
   * 自动填充剪贴板内容到 CoreBox UI
   * - 短文本 (≤25字符): 填充到搜索输入框
   * - 长文本: 显示为 Tag
   * - 图片: 显示为 Tag
   * - 文件: 切换到 FILE 模式
   * 
   * 注意: 这不是真正的粘贴操作，只是 UI 状态更新
   * 真正的粘贴功能见主进程的 applyToActiveApp
   */
  function handleAutoFill(): void {
    if (!clipboardOptions.last)
      return
    if (!canAutoPaste())
      return

    const timestamp = new Date(clipboardOptions.last.timestamp).getTime()

    // Check if already auto-pasted (prevent duplicate)
    if (autoPastedTimestamps.has(timestamp)) {
      console.debug('[Clipboard] Already auto-filled, skipping', {
        timestamp: new Date(timestamp).toISOString(),
      })
      return
    }

    const data = clipboardOptions.last

    // Clean up old records periodically
    if (Math.random() < 0.1) {
      cleanupAutoPastedRecords()
    }

    // Handle files: switch to FILE mode
    if (data.type === 'files') {
      try {
        const pathList = JSON.parse(data.content)
        const firstFile = pathList[0]

        if (firstFile) {
          boxOptions.file = {
            iconPath: firstFile,
            paths: pathList,
          }
          boxOptions.mode = BoxMode.FILE

          autoPastedTimestamps.add(timestamp)
          clearClipboard({ remember: true })

          console.debug('[Clipboard] Files auto-filled to FILE mode', {
            fileCount: pathList.length,
          })
        }
      }
      catch (error) {
        console.error('[Clipboard] Failed to parse file paths:', error)
      }
      return
    }

    // Handle text: short text to input query, long text as tag
    if (data.type === 'text') {
      const textContent = data.content || ''
      const textLength = textContent.length

      // Short text (≤25 chars): auto-fill to input query
      if (textLength > 0 && textLength <= 25 && searchVal) {
        searchVal.value = textContent
        autoPastedTimestamps.add(timestamp)
        clearClipboard({ remember: true })

        console.debug('[Clipboard] Short text auto-filled to input', {
          length: textLength,
          content: textContent.substring(0, 30),
        })

        if (onPasteCallback) {
          onPasteCallback()
        }
        return
      }

      // Long text (>25 chars): show as tag
      console.debug('[Clipboard] Long text shown as tag', {
        type: data.type,
        length: textLength,
      })

      autoPastedTimestamps.add(timestamp)

      if (onPasteCallback) {
        onPasteCallback()
      }
      return
    }

    // Handle image: show as tag
    if (data.type === 'image') {
      console.debug('[Clipboard] Image shown as tag')
      autoPastedTimestamps.add(timestamp)

      if (onPasteCallback) {
        onPasteCallback()
      }
    }
  }

  function handlePaste(options?: { overrideDismissed?: boolean }): void {
    const overrideDismissed = options?.overrideDismissed ?? false
    const clipboard = touchChannel.sendSync('clipboard:get-latest') as IClipboardItem | null

    if (!clipboard || !clipboard.timestamp) {
      clearClipboard()
      return
    }

    const clipboardTimestamp = normalizeTimestamp(clipboard.timestamp)

    if (!clipboardTimestamp) {
      clearClipboard()
      return
    }

    const currentTimestamp = normalizeTimestamp(clipboardOptions.last?.timestamp ?? null)
    const dismissedTimestamp = normalizeTimestamp(clipboardOptions.lastClearedTimestamp)

    const isSameClipboard
      = currentTimestamp !== null && currentTimestamp === clipboardTimestamp
    const isDismissed
      = !overrideDismissed && dismissedTimestamp !== null && dismissedTimestamp === clipboardTimestamp

    if (isDismissed) {
      console.debug('[Clipboard] Skipping dismissed clipboard item')
      return
    }

    const shouldRefresh = !isSameClipboard || overrideDismissed

    if (shouldRefresh) {
      clipboardOptions.last = clipboard
      clipboardOptions.detectedAt = Date.now()
      clipboardOptions.lastClearedTimestamp = null

      console.debug('[Clipboard] New content detected', {
        type: clipboard.type,
        timestamp: new Date(clipboard.timestamp).toISOString(),
      })

      if (onPasteCallback) {
        onPasteCallback()
      }
    }

    handleAutoFill()
  }

  async function applyToActiveApp(item?: IClipboardItem): Promise<boolean> {
    const target = item ?? clipboardOptions.last
    if (!target)
      return false

    try {
      const result = await touchChannel.send('clipboard:apply-to-active-app', { item: target })
      if (typeof result === 'object' && result) {
        return Boolean(result.success)
      }
      return true
    }
    catch (error) {
      console.error('[Clipboard] Failed to apply to active app:', error)
      return false
    }
  }

  /**
   * Clears the current clipboard state from UI
   *
   * @param options - Clear options
   * @param options.remember - If true, marks this clipboard item as dismissed
   *                          to prevent it from reappearing on next CoreBox open.
   *                          Also adds to autoPastedTimestamps to prevent auto-fill.
   *
   * @remarks
   * This function manages two separate state synchronization mechanisms:
   * 1. lastClearedTimestamp: Prevents dismissed clipboard from `handlePaste()`
   * 2. autoPastedTimestamps: Prevents dismissed clipboard from `handleAutoFill()`
   *
   * Both must be updated when user explicitly dismisses (ESC key) to ensure
   * consistent behavior across CoreBox sessions.
   */
  function clearClipboard(options?: { remember?: boolean }): void {
    const remember = options?.remember ?? false

    if (remember && clipboardOptions.last?.timestamp) {
      clipboardOptions.lastClearedTimestamp = clipboardOptions.last.timestamp

      // CRITICAL: Also add to autoPastedTimestamps to prevent auto-fill
      // This ensures dismissed clipboard won't auto-fill on next open
      const timestamp = normalizeTimestamp(clipboardOptions.last.timestamp)
      if (timestamp !== null) {
        autoPastedTimestamps.add(timestamp)
      }
    }
    else if (!remember) {
      clipboardOptions.lastClearedTimestamp = null
    }

    clipboardOptions.last = null
    clipboardOptions.detectedAt = null

    if (onPasteCallback) {
      onPasteCallback()
    }
  }

  // Listen for system clipboard changes
  touchChannel.regChannel('clipboard:new-item', (data: any) => {
    if (!data?.type)
      return

    const clipboardData = data as IClipboardItem
    const incomingTimestamp = normalizeTimestamp(clipboardData.timestamp)
    const dismissedTimestamp = normalizeTimestamp(clipboardOptions.lastClearedTimestamp)

    if (incomingTimestamp && dismissedTimestamp && incomingTimestamp === dismissedTimestamp) {
      console.debug('[Clipboard] Ignoring dismissed clipboard item from system event')
      return
    }

    clipboardOptions.last = clipboardData
    clipboardOptions.detectedAt = Date.now()
    clipboardOptions.lastClearedTimestamp = null

    console.debug('[Clipboard] System clipboard changed', {
      type: clipboardData.type,
      timestamp: new Date(clipboardData.timestamp).toISOString(),
    })

    if (onPasteCallback) {
      onPasteCallback()
    }
  })

  return {
    handlePaste,
    handleAutoFill,
    applyToActiveApp,
    clearClipboard,
    resetAutoPasteState,
  }
}
