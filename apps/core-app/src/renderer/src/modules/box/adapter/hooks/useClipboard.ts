import type { IBoxOptions } from '..'
import type { IClipboardHook, IClipboardItem, IClipboardOptions } from './types'
import { ref } from 'vue'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { tryUseChannel } from '@talex-touch/utils/renderer'
import { appSetting } from '~/modules/channel/storage'
import { BoxMode } from '..'
import { getLatestClipboard, useClipboardChannel } from './useClipboardChannel'

const AUTOFILL_INPUT_TEXT_LIMIT = 80
const AUTOFILL_TIMESTAMP_TTL = 60 * 60 * 1000
const AUTOFILL_CLEANUP_PROBABILITY = 0.1
const autoPastedTimestamps = new Set<number>()
const pollingService = PollingService.getInstance()

type HandlePasteOptions = {
  overrideDismissed?: boolean
  triggerSearch?: boolean
  attemptAutoFill?: boolean
}

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
  const autoPasteActive = ref(false)

  function resetAutoPasteStateForSession(): void {
    resetAutoPasteState()
    autoPasteActive.value = false
  }

  function resolveAutoPasteBaseTimestamp(timestamp: number): number {
    const detectedAt = clipboardOptions.detectedAt
    if (typeof detectedAt === 'number' && Number.isFinite(detectedAt)) {
      return Math.min(timestamp, detectedAt)
    }
    return timestamp
  }

  function isSameClipboardItem(
    prev: IClipboardItem | null | undefined,
    next: IClipboardItem | null | undefined
  ): boolean {
    if (!prev || !next) return false

    if (typeof prev.id === 'number' && typeof next.id === 'number') {
      return prev.id === next.id
    }

    const prevTimestamp = normalizeTimestamp(prev.timestamp)
    const nextTimestamp = normalizeTimestamp(next.timestamp)
    return prevTimestamp !== null && nextTimestamp !== null && prevTimestamp === nextTimestamp
  }

  function canAutoPaste(): boolean {
    if (!clipboardOptions.last?.timestamp) return false
    if (!appSetting.tools.autoPaste.enable) return false
    if (appSetting.tools.autoPaste.time === -1) return false

    const timestamp = normalizeTimestamp(clipboardOptions.last.timestamp)
    if (!timestamp) return false
    if (autoPastedTimestamps.has(timestamp)) return false

    // Check clipboard freshness
    const baseTimestamp = resolveAutoPasteBaseTimestamp(timestamp)
    const clipboardAge = Date.now() - baseTimestamp
    const limit = appSetting.tools.autoPaste.time
    const effectiveLimit = limit === 0 ? Number.POSITIVE_INFINITY : limit * 1000
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

  function autoFillText(data: IClipboardItem, timestamp: number): boolean {
    if (!isTextType(data)) return false
    if (!searchVal) return false

    const content = data.content || ''
    const length = content.length
    if (length === 0) return false

    // Short text: fill into input
    if (length <= AUTOFILL_INPUT_TEXT_LIMIT) {
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

  function autoFillClipboard(data: IClipboardItem, timestamp: number): boolean {
    return (
      autoFillFiles(data, timestamp) ||
      autoFillText(data, timestamp) ||
      autoFillImage(data, timestamp)
    )
  }

  async function resolveLatestClipboard(): Promise<IClipboardItem | null> {
    const latest = await getLatestClipboard()
    return latest ?? clipboardOptions.last
  }

  async function handlePasteAsync(options?: HandlePasteOptions): Promise<void> {
    const overrideDismissed = options?.overrideDismissed ?? false
    const triggerSearch = options?.triggerSearch ?? false
    const attemptAutoFill = options?.attemptAutoFill ?? false

    if (attemptAutoFill) {
      autoPasteActive.value = false
    }

    const clipboard = await resolveLatestClipboard()

    if (!clipboard?.timestamp) {
      clearClipboard()
      return
    }

    const clipboardTimestamp = normalizeTimestamp(clipboard.timestamp)
    if (!clipboardTimestamp) {
      clearClipboard()
      return
    }

    const dismissedTimestamp = normalizeTimestamp(clipboardOptions.lastClearedTimestamp)
    const isSameClipboard = isSameClipboardItem(clipboardOptions.last, clipboard)
    const isDismissed = !overrideDismissed && dismissedTimestamp === clipboardTimestamp

    if (isDismissed) {
      autoPasteActive.value = false
      return
    }

    if (!isSameClipboard || overrideDismissed) {
      autoPasteActive.value = false
      clipboardOptions.last = clipboard
      clipboardOptions.detectedAt = Date.now()
      clipboardOptions.lastClearedTimestamp = null

      const timestamp = normalizeTimestamp(clipboard.timestamp)
      const alreadyPasted = timestamp && autoPastedTimestamps.has(timestamp)
      const shouldAutoPaste = !overrideDismissed && !alreadyPasted && canAutoPaste()
      let didAutoPaste = false

      if (timestamp && (overrideDismissed || shouldAutoPaste)) {
        didAutoPaste = autoFillClipboard(clipboard, timestamp)

        if (shouldAutoPaste) autoPasteActive.value = didAutoPaste
      }

      if (!didAutoPaste || clipboardOptions.last) {
        onPasteCallback?.()
      }
      return
    }

    if (attemptAutoFill && !overrideDismissed) {
      const timestamp = normalizeTimestamp(clipboard.timestamp)
      const alreadyPasted = timestamp && autoPastedTimestamps.has(timestamp)
      const shouldAutoPaste = !alreadyPasted && canAutoPaste()

      if (timestamp && shouldAutoPaste) {
        const didAutoPaste = autoFillClipboard(clipboard, timestamp)
        autoPasteActive.value = didAutoPaste
      }
    }

    if (triggerSearch && clipboardOptions.last) {
      onPasteCallback?.()
    }
  }

  function handlePaste(options?: HandlePasteOptions): void {
    void handlePasteAsync(options)
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
    autoPasteActive.value = false
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

          const changed = !isSameClipboardItem(clipboardOptions.last, item)
          if (changed) {
            autoPasteActive.value = false
          }
          clipboardOptions.last = item
          clipboardOptions.detectedAt = Date.now()
          clipboardOptions.lastClearedTimestamp = null

          // Only trigger search if CoreBox is visible (document is visible)
          if (changed && hasDocument() && document.visibilityState === 'visible') {
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
  if (hasWindow()) {
    // Check if TouchChannel is available
    if (tryUseChannel()) {
      initClipboardChannel()
    } else {
      // Wait for channel to be injected
      const checkTaskId = `clipboard.channel-check.${Date.now()}`
      pollingService.register(
        checkTaskId,
        () => {
          if (tryUseChannel()) {
            pollingService.unregister(checkTaskId)
            initClipboardChannel()
          }
        },
        { interval: 50, unit: 'milliseconds' }
      )
      pollingService.start()
      // Cleanup poller after 5 seconds
      setTimeout(() => pollingService.unregister(checkTaskId), 5000)
    }
  }

  return {
    handlePaste,
    applyToActiveApp,
    clearClipboard,
    resetAutoPasteState: resetAutoPasteStateForSession,
    autoPasteActive,
    cleanup: () => {
      cleanup?.()
    }
  }
}
