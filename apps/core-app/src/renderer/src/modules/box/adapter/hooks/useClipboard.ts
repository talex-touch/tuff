import type { IBoxOptions } from '..'
import type { IClipboardHook, IClipboardItem, IClipboardOptions } from './types'
import { getLatestClipboardSync, useClipboardChannel } from './useClipboardChannel'
import { appSetting } from '~/modules/channel/storage'
import { BoxMode } from '..'

const AUTOFILL_SHORT_TEXT_LIMIT = 80
const AUTOFILL_TIMESTAMP_TTL = 60 * 60 * 1000
const AUTOFILL_CLEANUP_PROBABILITY = 0.1
const AUTOFILL_LOG_PREVIEW_LENGTH = 30

/**
 * Normalize timestamp to milliseconds
 * @param value - Timestamp in various formats
 * @returns Normalized timestamp in milliseconds or null
 */
function normalizeTimestamp(value?: string | number | Date | null): number | null {
  if (value === null || value === undefined) {
    return null
  }

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

const autoPastedTimestamps = new Set<number>()

/**
 * Clean up expired autopaste records to prevent memory leaks
 */
function cleanupAutoPastedRecords(): void {
  const expiredAt = Date.now() - AUTOFILL_TIMESTAMP_TTL
  for (const ts of autoPastedTimestamps) {
    if (ts < expiredAt) {
      autoPastedTimestamps.delete(ts)
    }
  }
}

/**
 * Reset autopaste state for new CoreBox session
 */
function resetAutoPasteState(): void {
  cleanupAutoPastedRecords()
}

export function useClipboard(
  boxOptions: IBoxOptions,
  clipboardOptions: IClipboardOptions,
  onPasteCallback?: () => void,
  searchVal?: import('vue').Ref<string>
): Omit<IClipboardHook, 'clipboardOptions'> & { cleanup: () => void } {
  function canAutoPaste(): boolean {
    if (!clipboardOptions.last || !clipboardOptions.last.timestamp) {
      return false
    }

    if (!appSetting.tools.autoPaste.enable) {
      return false
    }

    const limit = appSetting.tools.autoPaste.time
    if (limit === -1) {
      return false
    }

    if (limit === 0) {
      return true
    }

    const copiedTime = new Date(clipboardOptions.last.timestamp).getTime()
    const now = Date.now()
    const elapsed = now - copiedTime

    console.warn('[Clipboard] AutoPaste time check', {
      copiedAt: new Date(copiedTime).toISOString(),
      now: new Date(now).toISOString(),
      elapsed,
      limit: limit * 1000,
      canPaste: elapsed <= limit * 1000
    })

    return elapsed <= limit * 1000
  }

  /**
   * Auto-fill clipboard data to CoreBox UI when conditions are met
   * Handles files, short text, long text, and images
   */
  function handleAutoFill(): void {
    if (!clipboardOptions.last) {
      return
    }
    if (!canAutoPaste()) {
      return
    }

    const timestamp = new Date(clipboardOptions.last.timestamp).getTime()

    if (autoPastedTimestamps.has(timestamp)) {
      console.warn('[Clipboard] Already auto-filled, skipping', {
        timestamp: new Date(timestamp).toISOString()
      })
      return
    }

    const data = clipboardOptions.last

    if (Math.random() < AUTOFILL_CLEANUP_PROBABILITY) {
      cleanupAutoPastedRecords()
    }

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

          autoPastedTimestamps.add(timestamp)
          clearClipboard({ remember: true })

          console.warn('[Clipboard] Files auto-filled to FILE mode', {
            fileCount: pathList.length
          })
        }
      }
      catch (error) {
        console.error('[Clipboard] Failed to parse file paths:', error)
      }
      return
    }

    if (data.type === 'text') {
      const textContent = data.content || ''
      const textLength = textContent.length

      if (textLength > 0 && textLength <= AUTOFILL_SHORT_TEXT_LIMIT && searchVal) {
        searchVal.value = textContent
        autoPastedTimestamps.add(timestamp)
        clearClipboard({ remember: true })

        console.warn('[Clipboard] Short text auto-filled to input', {
          length: textLength,
          limit: AUTOFILL_SHORT_TEXT_LIMIT,
          content: textContent.substring(0, AUTOFILL_LOG_PREVIEW_LENGTH)
        })

        if (onPasteCallback) {
          onPasteCallback()
        }
        return
      }

      console.warn('[Clipboard] Long text shown as tag', {
        type: data.type,
        length: textLength
      })

      autoPastedTimestamps.add(timestamp)

      if (onPasteCallback) {
        onPasteCallback()
      }
      return
    }

    if (data.type === 'image') {
      console.warn('[Clipboard] Image shown as tag')
      autoPastedTimestamps.add(timestamp)

      if (onPasteCallback) {
        onPasteCallback()
      }
    }
  }

  /**
   * Fetch and process latest clipboard data from main process
   * @param options - Configuration options
   * @param options.overrideDismissed - If true, re-fetch dismissed clipboard items
   */
  function handlePaste(options?: { overrideDismissed?: boolean }): void {
    const overrideDismissed = options?.overrideDismissed ?? false
    const clipboard = getLatestClipboardSync()

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

    const isSameClipboard = currentTimestamp !== null && currentTimestamp === clipboardTimestamp
    const isDismissed =
      !overrideDismissed && dismissedTimestamp !== null && dismissedTimestamp === clipboardTimestamp

    if (isDismissed) {
      console.warn('[Clipboard] Skipping dismissed clipboard item')
      return
    }

    const shouldRefresh = !isSameClipboard || overrideDismissed

    if (shouldRefresh) {
      clipboardOptions.last = clipboard
      clipboardOptions.detectedAt = Date.now()
      clipboardOptions.lastClearedTimestamp = null

      console.warn('[Clipboard] New content detected', {
        type: clipboard.type,
        timestamp: new Date(clipboard.timestamp).toISOString()
      })

      if (onPasteCallback) {
        onPasteCallback()
      }
    }

    // Note: handleAutoFill is called separately by useVisibility after handlePaste
    // Don't call it here to avoid duplicate execution
  }

  /**
   * Apply clipboard item to the active application window
   * @param item - Clipboard item to apply, defaults to current clipboard
   * @returns True if successfully applied
   */
  async function applyToActiveApp(item?: IClipboardItem): Promise<boolean> {
    const target = item ?? clipboardOptions.last
    if (!target) {
      return false
    }

    try {
      const { applyClipboardToActiveApp } = await import('./useClipboardChannel')
      return await applyClipboardToActiveApp(target)
    }
    catch (error) {
      console.error('[Clipboard] Failed to apply to active app:', error)
      return false
    }
  }

  /**
   * Clear clipboard UI state
   * @param options - Configuration options
   * @param options.remember - If true, prevent this clipboard item from auto-pasting in the future
   */
  function clearClipboard(options?: { remember?: boolean }): void {
    const remember = options?.remember ?? false

    if (remember && clipboardOptions.last?.timestamp) {
      clipboardOptions.lastClearedTimestamp = clipboardOptions.last.timestamp

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

  // Register clipboard channel listeners using centralized hook
  const cleanup = useClipboardChannel({
    onNewItem: (item) => {
      if (!item?.type) {
        return
      }

      const incomingTimestamp = normalizeTimestamp(item.timestamp)
      const dismissedTimestamp = normalizeTimestamp(clipboardOptions.lastClearedTimestamp)

      if (incomingTimestamp && dismissedTimestamp && incomingTimestamp === dismissedTimestamp) {
        console.warn('[Clipboard] Ignoring dismissed clipboard item from system event')
        return
      }

      clipboardOptions.last = item
      clipboardOptions.detectedAt = Date.now()
      clipboardOptions.lastClearedTimestamp = null

      console.warn('[Clipboard] System clipboard changed', {
        type: item.type,
        timestamp: new Date(item.timestamp).toISOString()
      })

      if (onPasteCallback) {
        onPasteCallback()
      }
    },
    // Note: onMetaUpdated is intentionally NOT handled here
    // CoreBox doesn't need real-time OCR updates in the UI
    // Metadata updates are handled in main process and persisted to DB
  })

  return {
    handlePaste,
    handleAutoFill,
    applyToActiveApp,
    clearClipboard,
    resetAutoPasteState,
    cleanup
  }
}
