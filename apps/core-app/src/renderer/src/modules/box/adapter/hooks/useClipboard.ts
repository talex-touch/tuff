import type { IBoxOptions } from '..'
import type { IClipboardHook, IClipboardItem, IClipboardOptions } from './types'
import { touchChannel } from '~/modules/channel/channel-core'
import { appSetting } from '~/modules/channel/storage'
import { BoxMode } from '..'

const AUTOFILL_SHORT_TEXT_LIMIT = 80
const AUTOFILL_TIMESTAMP_TTL = 60 * 60 * 1000
const AUTOFILL_CLEANUP_PROBABILITY = 0.1
const AUTOFILL_LOG_PREVIEW_LENGTH = 30

// Normalize timestamp inputs so autopaste doesn't choke on weird types
function normalizeTimestamp(value?: string | number | Date | null): number | null {
  if (value === null || value === undefined) return null
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

// Trim stale autopaste entries
function cleanupAutoPastedRecords(): void {
  const expiredAt = Date.now() - AUTOFILL_TIMESTAMP_TTL
  for (const ts of autoPastedTimestamps) {
    if (ts < expiredAt) {
      autoPastedTimestamps.delete(ts)
    }
  }
}

// Keep only fresh autopaste cache when CoreBox mounts
function resetAutoPasteState(): void {
  cleanupAutoPastedRecords()
}

export function useClipboard(
  boxOptions: IBoxOptions,
  clipboardOptions: IClipboardOptions,
  onPasteCallback?: () => void,
  searchVal?: import('vue').Ref<string>
): Omit<IClipboardHook, 'clipboardOptions'> {
  function canAutoPaste(): boolean {
    if (!clipboardOptions.last || !clipboardOptions.last.timestamp) return false
    if (!appSetting.tools.autoPaste.enable) return false

    const limit = appSetting.tools.autoPaste.time
    if (limit === -1) return false
    if (limit === 0) return true

    // Use database timestamp (real copy time) instead of detectedAt
    const copiedTime = new Date(clipboardOptions.last.timestamp).getTime()
    const now = Date.now()
    const elapsed = now - copiedTime

    console.debug('[Clipboard] AutoPaste time check', {
      copiedAt: new Date(copiedTime).toISOString(),
      now: new Date(now).toISOString(),
      elapsed,
      limit: limit * 1000,
      canPaste: elapsed <= limit * 1000
    })

    return elapsed <= limit * 1000
  }

  // Mirror clipboard state to CoreBox UI (UI only, no OS paste)
  function handleAutoFill(): void {
    if (!clipboardOptions.last) return
    if (!canAutoPaste()) return

    const timestamp = new Date(clipboardOptions.last.timestamp).getTime()

    // Check if already auto-pasted (prevent duplicate)
    if (autoPastedTimestamps.has(timestamp)) {
      console.debug('[Clipboard] Already auto-filled, skipping', {
        timestamp: new Date(timestamp).toISOString()
      })
      return
    }

    const data = clipboardOptions.last

    // Clean up old records periodically
    if (Math.random() < AUTOFILL_CLEANUP_PROBABILITY) {
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
            paths: pathList
          }
          boxOptions.mode = BoxMode.FILE

          autoPastedTimestamps.add(timestamp)
          clearClipboard({ remember: true })

          console.debug('[Clipboard] Files auto-filled to FILE mode', {
            fileCount: pathList.length
          })
        }
      } catch (error) {
        console.error('[Clipboard] Failed to parse file paths:', error)
      }
      return
    }

    // Handle text: short text to input query, long text just flagged once
    if (data.type === 'text') {
      const textContent = data.content || ''
      const textLength = textContent.length

      // Short text (≤limit): auto-fill to input query
      if (textLength > 0 && textLength <= AUTOFILL_SHORT_TEXT_LIMIT && searchVal) {
        searchVal.value = textContent
        autoPastedTimestamps.add(timestamp)
        clearClipboard({ remember: true })

        console.debug('[Clipboard] Short text auto-filled to input', {
          length: textLength,
          limit: AUTOFILL_SHORT_TEXT_LIMIT,
          content: textContent.substring(0, AUTOFILL_LOG_PREVIEW_LENGTH)
        })

        if (onPasteCallback) {
          onPasteCallback()
        }
        return
      }

      // Long text (>limit): only trigger callback once
      console.debug('[Clipboard] Long text shown as tag', {
        type: data.type,
        length: textLength
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

    const isSameClipboard = currentTimestamp !== null && currentTimestamp === clipboardTimestamp
    const isDismissed =
      !overrideDismissed && dismissedTimestamp !== null && dismissedTimestamp === clipboardTimestamp

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
        timestamp: new Date(clipboard.timestamp).toISOString()
      })

      if (onPasteCallback) {
        onPasteCallback()
      }
    }

    handleAutoFill()
  }

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

  // Clear clipboard UI state, optional remember prevents future auto-paste
  function clearClipboard(options?: { remember?: boolean }): void {
    const remember = options?.remember ?? false

    if (remember && clipboardOptions.last?.timestamp) {
      clipboardOptions.lastClearedTimestamp = clipboardOptions.last.timestamp

      // Mirror dismissal to autoPastedTimestamps so the item never autoloads again
      const timestamp = normalizeTimestamp(clipboardOptions.last.timestamp)
      if (timestamp !== null) {
        autoPastedTimestamps.add(timestamp)
      }
    } else if (!remember) {
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
    if (!data?.type) return

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
      timestamp: new Date(clipboardData.timestamp).toISOString()
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
    resetAutoPasteState
  }
}
