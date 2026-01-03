import type { IBoxOptions } from '..'
import type { IClipboardHook, IClipboardItem, IClipboardOptions } from './types'
import { getLatestClipboardSync, useClipboardChannel } from './useClipboardChannel'
import { appSetting } from '~/modules/channel/storage'
import { BoxMode } from '..'

const AUTOFILL_INPUT_TEXT_LIMIT = 80
const AUTOFILL_TIMESTAMP_TTL = 60 * 60 * 1000
const AUTOFILL_CLEANUP_PROBABILITY = 0.1
const MAX_CLIPBOARD_AGE_MS = 5 * 60 * 1000
const autoPastedTimestamps = new Set<number>()

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

function cleanupAutoPastedRecords(): void {
  const expiredAt = Date.now() - AUTOFILL_TIMESTAMP_TTL
  for (const ts of autoPastedTimestamps) {
    if (ts < expiredAt) autoPastedTimestamps.delete(ts)
  }
}

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
    if (!clipboardOptions.last?.timestamp) return false
    if (!appSetting.tools.autoPaste.enable) return false
    if (appSetting.tools.autoPaste.time === -1) return false

    const timestamp = normalizeTimestamp(clipboardOptions.last.timestamp)
    if (!timestamp) return false
    if (autoPastedTimestamps.has(timestamp)) return false

    // Check clipboard freshness
    const clipboardAge = Date.now() - timestamp
    const limit = appSetting.tools.autoPaste.time
    const effectiveLimit = limit === 0 ? MAX_CLIPBOARD_AGE_MS : limit * 1000
    return clipboardAge <= effectiveLimit
  }

  function markAsAutoPasted(timestamp: number, clear = true): void {
    autoPastedTimestamps.add(timestamp)
    if (clear) clearClipboard({ remember: true })
    if (Math.random() < AUTOFILL_CLEANUP_PROBABILITY) cleanupAutoPastedRecords()
  }

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

  function isTextType(data: IClipboardItem): boolean {
    return data.type === 'text' || (data.type as string) === 'html'
  }

  function autoFillText(data: IClipboardItem, timestamp: number, forceFill = false): boolean {
    if (!isTextType(data)) return false
    if (!searchVal) return false

    const content = data.content || ''
    const length = content.length
    if (length === 0) return false

    // Explicit paste (Cmd+V) or short text: fill into input
    if (forceFill || length <= AUTOFILL_INPUT_TEXT_LIMIT) {
      searchVal.value = content
      markAsAutoPasted(timestamp)
      return true
    }

    // Long text: show as tag only
    autoPastedTimestamps.add(timestamp)
    return true
  }

  function autoFillImage(data: IClipboardItem, timestamp: number): boolean {
    if (data.type !== 'image') return false
    autoPastedTimestamps.add(timestamp)
    return true
  }

  function handleAutoFill(): void {
    if (!clipboardOptions.last || !canAutoPaste()) return

    const timestamp = normalizeTimestamp(clipboardOptions.last.timestamp)
    if (!timestamp || autoPastedTimestamps.has(timestamp)) return

    const data = clipboardOptions.last
    autoFillFiles(data, timestamp) ||
      autoFillText(data, timestamp) ||
      autoFillImage(data, timestamp)
  }

  function handlePaste(options?: { overrideDismissed?: boolean; triggerSearch?: boolean }): void {
    const overrideDismissed = options?.overrideDismissed ?? false
    const triggerSearch = options?.triggerSearch ?? false
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
      const alreadyPasted = timestamp && autoPastedTimestamps.has(timestamp)

      if (overrideDismissed || (!alreadyPasted && canAutoPaste())) {
        if (timestamp) {
          autoFillFiles(clipboard, timestamp) ||
            autoFillText(clipboard, timestamp, overrideDismissed) ||
            autoFillImage(clipboard, timestamp)
        }
      }

      onPasteCallback?.()
    } else if (triggerSearch && clipboardOptions.last) {
      onPasteCallback?.()
    }
  }

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

  // Delay clipboard channel initialization to ensure TouchChannel is available
  let cleanup: (() => void) | null = null
  let initAttempted = false

  // Initialize clipboard channel on next tick to ensure TouchChannel is ready
  const initClipboardChannel = () => {
    if (initAttempted) return
    initAttempted = true

    try {
      cleanup = useClipboardChannel({
        onNewItem: (item) => {
          if (!item?.type) return

          const incomingTimestamp = normalizeTimestamp(item.timestamp)
          const dismissedTimestamp = normalizeTimestamp(clipboardOptions.lastClearedTimestamp)

          if (incomingTimestamp && dismissedTimestamp && incomingTimestamp === dismissedTimestamp) {
            return
          }

          const changed = clipboardOptions.last?.timestamp !== item.timestamp
          clipboardOptions.last = item
          clipboardOptions.detectedAt = Date.now()
          clipboardOptions.lastClearedTimestamp = null

          // Only trigger search if CoreBox is visible (document is visible)
          if (changed && document.visibilityState === 'visible') {
            onPasteCallback?.()
          }
        }
      })
    } catch (error) {
      // TouchChannel not available yet, retry on next tick
      console.warn('[useClipboard] TouchChannel not available, retrying...', error)
      setTimeout(initClipboardChannel, 100)
    }
  }

  // Initialize after component is mounted
  if (typeof window !== 'undefined') {
    // Check if TouchChannel is available
    if (window.$channel || window.touchChannel) {
      initClipboardChannel()
    } else {
      // Wait for TouchChannel to be injected
      const checkChannel = setInterval(() => {
        if (window.$channel || window.touchChannel) {
          clearInterval(checkChannel)
          initClipboardChannel()
        }
      }, 50)
      // Cleanup interval after 5 seconds
      setTimeout(() => clearInterval(checkChannel), 5000)
    }
  }

  return {
    handlePaste,
    handleAutoFill,
    applyToActiveApp,
    clearClipboard,
    resetAutoPasteState,
    cleanup: () => {
      cleanup?.()
    }
  }
}
