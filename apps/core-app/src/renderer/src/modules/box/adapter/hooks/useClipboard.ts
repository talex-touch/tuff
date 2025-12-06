import type { IBoxOptions } from '..'
import type { IClipboardHook, IClipboardItem, IClipboardOptions } from './types'
import { getLatestClipboardSync, useClipboardChannel } from './useClipboardChannel'
import { appSetting } from '~/modules/channel/storage'
import { BoxMode } from '..'

/** Max text length to auto-fill into input field */
const AUTOFILL_INPUT_TEXT_LIMIT = 80

/** TTL for autopaste timestamp records (1 hour) */
const AUTOFILL_TIMESTAMP_TTL = 60 * 60 * 1000

/** Probability to trigger cleanup on each autofill */
const AUTOFILL_CLEANUP_PROBABILITY = 0.1

/** Tracks timestamps of already auto-pasted items */
const autoPastedTimestamps = new Set<number>()

/**
 * Normalizes timestamp to milliseconds
 */
function normalizeTimestamp(value?: string | number | Date | null): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isFinite(time) ? time : null
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Cleans up expired autopaste records
 */
function cleanupAutoPastedRecords(): void {
  const expiredAt = Date.now() - AUTOFILL_TIMESTAMP_TTL
  for (const ts of autoPastedTimestamps) {
    if (ts < expiredAt) autoPastedTimestamps.delete(ts)
  }
}

/**
 * Resets autopaste state for new CoreBox session
 */
function resetAutoPasteState(): void {
  cleanupAutoPastedRecords()
}

/**
 * Clipboard management hook for CoreBox
 *
 * @param boxOptions - Box state options
 * @param clipboardOptions - Clipboard state
 * @param onPasteCallback - Callback when clipboard changes
 * @param searchVal - Search input ref for auto-fill
 */
export function useClipboard(
  boxOptions: IBoxOptions,
  clipboardOptions: IClipboardOptions,
  onPasteCallback?: () => void,
  searchVal?: import('vue').Ref<string>
): Omit<IClipboardHook, 'clipboardOptions'> & { cleanup: () => void } {
  /**
   * Checks if auto-paste is allowed based on settings and timing
   */
  function canAutoPaste(): boolean {
    if (!clipboardOptions.last?.timestamp) return false
    if (!appSetting.tools.autoPaste.enable) return false

    const limit = appSetting.tools.autoPaste.time
    if (limit === -1) return false
    if (limit === 0) return true

    const copiedTime = new Date(clipboardOptions.last.timestamp).getTime()
    const elapsed = Date.now() - copiedTime
    return elapsed <= limit * 1000
  }

  /**
   * Marks timestamp as auto-pasted and optionally clears clipboard
   */
  function markAsAutoPasted(timestamp: number, clear = true): void {
    autoPastedTimestamps.add(timestamp)
    if (clear) clearClipboard({ remember: true })
    if (Math.random() < AUTOFILL_CLEANUP_PROBABILITY) cleanupAutoPastedRecords()
  }

  /**
   * Auto-fills file paths to FILE mode
   */
  function autoFillFiles(data: IClipboardItem, timestamp: number): boolean {
    if (data.type !== 'files') return false

    try {
      const pathList = JSON.parse(data.content)
      if (!pathList[0]) return false

      boxOptions.file = { iconPath: pathList[0], paths: pathList }
      boxOptions.mode = BoxMode.FILE
      markAsAutoPasted(timestamp)
      return true
    } catch {
      return false
    }
  }

  /**
   * Checks if data is text type (including HTML with text content)
   */
  function isTextType(data: IClipboardItem): boolean {
    return data.type === 'text' || (data.type as string) === 'html'
  }

  /**
   * Auto-fills text content based on length:
   * - <= 80 chars: fills into input field
   * - > 80 chars: shown as tag (clipboard retained)
   */
  function autoFillText(data: IClipboardItem, timestamp: number): boolean {
    if (!isTextType(data)) return false
    if (!searchVal) return false

    const content = data.content || ''
    const length = content.length

    if (length > 0 && length <= AUTOFILL_INPUT_TEXT_LIMIT) {
      searchVal.value = content
      markAsAutoPasted(timestamp)
      onPasteCallback?.()
      return true
    }

    if (length > AUTOFILL_INPUT_TEXT_LIMIT) {
      autoPastedTimestamps.add(timestamp)
      onPasteCallback?.()
      return true
    }

    return false
  }

  /**
   * Auto-fills image (shown as tag)
   */
  function autoFillImage(data: IClipboardItem, timestamp: number): boolean {
    if (data.type !== 'image') return false
    autoPastedTimestamps.add(timestamp)
    onPasteCallback?.()
    return true
  }

  /**
   * Auto-fills clipboard data to CoreBox UI when conditions are met
   */
  function handleAutoFill(): void {
    if (!clipboardOptions.last || !canAutoPaste()) return

    const timestamp = normalizeTimestamp(clipboardOptions.last.timestamp)
    if (!timestamp || autoPastedTimestamps.has(timestamp)) return

    const data = clipboardOptions.last
    autoFillFiles(data, timestamp) ||
      autoFillText(data, timestamp) ||
      autoFillImage(data, timestamp)
  }

  /**
   * Fetches and processes latest clipboard data from main process
   * @param options.overrideDismissed - Re-fetch dismissed clipboard items
   */
  function handlePaste(options?: { overrideDismissed?: boolean }): void {
    const overrideDismissed = options?.overrideDismissed ?? false
    const clipboard = getLatestClipboardSync()

    if (!clipboard?.timestamp) {
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
    const isSameClipboard = currentTimestamp === clipboardTimestamp
    const isDismissed = !overrideDismissed && dismissedTimestamp === clipboardTimestamp

    if (isDismissed) return

    if (!isSameClipboard || overrideDismissed) {
      clipboardOptions.last = clipboard
      clipboardOptions.detectedAt = Date.now()
      clipboardOptions.lastClearedTimestamp = null

      const timestamp = normalizeTimestamp(clipboard.timestamp)
      if (timestamp && !autoPastedTimestamps.has(timestamp)) {
        autoFillFiles(clipboard, timestamp) ||
          autoFillText(clipboard, timestamp) ||
          autoFillImage(clipboard, timestamp)
      }

      onPasteCallback?.()
    }
  }

  /**
   * Applies clipboard item to the active application window
   */
  async function applyToActiveApp(item?: IClipboardItem): Promise<boolean> {
    const target = item ?? clipboardOptions.last
    if (!target) return false

    try {
      const { applyClipboardToActiveApp } = await import('./useClipboardChannel')
      return await applyClipboardToActiveApp(target)
    } catch {
      return false
    }
  }

  /**
   * Clears clipboard UI state
   * @param options.remember - Prevent this item from auto-pasting in the future
   */
  function clearClipboard(options?: { remember?: boolean }): void {
    const remember = options?.remember ?? false

    if (remember && clipboardOptions.last?.timestamp) {
      clipboardOptions.lastClearedTimestamp = clipboardOptions.last.timestamp
      const timestamp = normalizeTimestamp(clipboardOptions.last.timestamp)
      if (timestamp !== null) autoPastedTimestamps.add(timestamp)
    } else if (!remember) {
      clipboardOptions.lastClearedTimestamp = null
    }

    clipboardOptions.last = null
    clipboardOptions.detectedAt = null
    onPasteCallback?.()
  }

  const cleanup = useClipboardChannel({
    onNewItem: (item) => {
      if (!item?.type) return

      const incomingTimestamp = normalizeTimestamp(item.timestamp)
      const dismissedTimestamp = normalizeTimestamp(clipboardOptions.lastClearedTimestamp)

      if (incomingTimestamp && dismissedTimestamp && incomingTimestamp === dismissedTimestamp) {
        return
      }

      clipboardOptions.last = item
      clipboardOptions.detectedAt = Date.now()
      clipboardOptions.lastClearedTimestamp = null

      if (incomingTimestamp && !autoPastedTimestamps.has(incomingTimestamp)) {
        autoFillFiles(item, incomingTimestamp) ||
          autoFillText(item, incomingTimestamp) ||
          autoFillImage(item, incomingTimestamp)
      }

      onPasteCallback?.()
    }
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
