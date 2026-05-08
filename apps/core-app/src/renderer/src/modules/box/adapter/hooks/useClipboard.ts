import type { IBoxOptions } from '..'
import type { IClipboardHook, IClipboardItem, IClipboardOptions } from './types'
import { ref } from 'vue'
import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { appSetting } from '~/modules/storage/app-storage'
import { BoxMode } from '..'
import { isUrlLikeClipboardText } from './clipboard-text-utils'
import { getLatestClipboard, useClipboardChannel } from './useClipboardChannel'

const AUTOFILL_INPUT_TEXT_LIMIT = 80
const AUTOFILL_TIMESTAMP_TTL = 60 * 60 * 1000
const AUTOFILL_CLEANUP_PROBABILITY = 0.1
const autoPastedClipboardIdentities = new Map<string, number>()

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

function resolveFreshnessBaseTimestamp(item: IClipboardItem): number | null {
  const freshnessBaseAt =
    typeof item.freshnessBaseAt === 'number' && Number.isFinite(item.freshnessBaseAt)
      ? item.freshnessBaseAt
      : null
  if (freshnessBaseAt !== null) return freshnessBaseAt

  return typeof item.observedAt === 'number' && Number.isFinite(item.observedAt)
    ? item.observedAt
    : null
}

function resolveContentIdentity(item: IClipboardItem): string | null {
  const type = item.type ?? 'unknown'
  const content = item.content ?? ''
  if (!content) {
    const timestamp = resolveFreshnessBaseTimestamp(item)
    return timestamp === null ? null : `seen:${timestamp}`
  }

  const edgeLength = 64
  const head = content.slice(0, edgeLength)
  const tail = content.length > edgeLength ? content.slice(-edgeLength) : ''
  const observedAt = resolveFreshnessBaseTimestamp(item)
  return `content:${type}:${content.length}:${head}:${tail}:${observedAt ?? 'unknown'}`
}

function extractIdentityTimestamp(identity: string): number | null {
  if (identity.startsWith('seen:')) {
    const value = Number(identity.slice('seen:'.length))
    return Number.isFinite(value) ? value : null
  }
  const tail = identity.split(':').at(-1)
  if (!tail || tail === 'unknown') return null
  const value = Number(tail)
  return Number.isFinite(value) ? value : null
}

function markIdentityAsAutoPasted(item: IClipboardItem): void {
  const identity = typeof item.id === 'number' ? `id:${item.id}` : resolveContentIdentity(item)
  if (identity) {
    autoPastedClipboardIdentities.set(identity, Date.now())
  }
}

function cleanupAutoPastedRecords(): void {
  const expiredAt = Date.now() - AUTOFILL_TIMESTAMP_TTL
  for (const [identity, markedAt] of autoPastedClipboardIdentities) {
    const identityTimestamp = extractIdentityTimestamp(identity)
    const timestamp = identityTimestamp ?? markedAt
    if (timestamp < expiredAt) {
      autoPastedClipboardIdentities.delete(identity)
    }
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
  let startupClipboardIdentity: string | null = null

  function resolveClipboardIdentity(item: IClipboardItem | null | undefined): string | null {
    if (!item) return null
    if (typeof item.id === 'number') return `id:${item.id}`
    return resolveContentIdentity(item)
  }

  function rememberStartupClipboard(item: IClipboardItem | null | undefined): void {
    if (startupClipboardIdentity !== null) return
    startupClipboardIdentity = resolveClipboardIdentity(item)
  }

  function isStartupClipboard(item: IClipboardItem | null | undefined): boolean {
    if (startupClipboardIdentity === null) return false
    const identity = resolveClipboardIdentity(item)
    return identity !== null && identity === startupClipboardIdentity
  }

  function resetAutoPasteStateForSession(): void {
    resetAutoPasteState()
    autoPasteActive.value = false
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
    const item = clipboardOptions.last
    if (!item?.timestamp) return false
    if (!appSetting.tools.autoPaste.enable) return false
    if (appSetting.tools.autoPaste.time === -1) return false
    if (item.autoPasteEligible !== true) return false

    const identity = resolveClipboardIdentity(item)
    if (!identity) return false
    if (autoPastedClipboardIdentities.has(identity)) return false

    const baseTimestamp = resolveFreshnessBaseTimestamp(item)
    if (baseTimestamp === null) return false
    const clipboardAge = Date.now() - baseTimestamp
    const limit = appSetting.tools.autoPaste.time
    const effectiveLimit = limit === 0 ? Number.POSITIVE_INFINITY : limit * 1000
    return clipboardAge <= effectiveLimit
  }

  function markAsAutoPasted(item: IClipboardItem, clear = true): void {
    const identity = resolveClipboardIdentity(item)
    if (identity) {
      autoPastedClipboardIdentities.set(identity, Date.now())
    }
    if (clear) clearClipboard({ remember: true })
    if (Math.random() < AUTOFILL_CLEANUP_PROBABILITY) cleanupAutoPastedRecords()
  }

  function autoFillFiles(data: IClipboardItem): boolean {
    if (data.type !== 'files') return false

    try {
      const pathList = JSON.parse(data.content)
      if (!pathList[0]) return false

      boxOptions.file = { iconPath: pathList[0], paths: pathList }
      boxOptions.mode = BoxMode.FILE
      markAsAutoPasted(data)
      return true
    } catch {
      return false
    }
  }

  function isTextType(data: IClipboardItem): boolean {
    return data.type === 'text' || (data.type as string) === 'html'
  }

  function autoFillText(data: IClipboardItem): boolean {
    if (!isTextType(data)) return false
    if (!searchVal) return false

    const content = data.content || ''
    const length = content.length
    if (length === 0) return false

    // Text layout is format-first: short URL still stays in suffix tag.
    const shouldFillInput = length <= AUTOFILL_INPUT_TEXT_LIMIT && !isUrlLikeClipboardText(data)
    if (shouldFillInput) {
      searchVal.value = content
      clipboardOptions.pendingAutoFillItem = { ...data }
      markIdentityAsAutoPasted(data)
      clearClipboard({ remember: true, preservePendingAutoFill: true })
      if (Math.random() < AUTOFILL_CLEANUP_PROBABILITY) cleanupAutoPastedRecords()
      return true
    }

    // Long/plain URL text: show as tag only
    markIdentityAsAutoPasted(data)
    return true
  }

  function autoFillImage(data: IClipboardItem): boolean {
    if (data.type !== 'image') return false
    markIdentityAsAutoPasted(data)
    return true
  }

  function autoFillClipboard(data: IClipboardItem): boolean {
    return autoFillFiles(data) || autoFillText(data) || autoFillImage(data)
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

    if (attemptAutoFill && !overrideDismissed && startupClipboardIdentity === null) {
      rememberStartupClipboard(clipboard)
    }

    if (
      attemptAutoFill &&
      !overrideDismissed &&
      clipboard.autoPasteEligible !== true &&
      isStartupClipboard(clipboard)
    ) {
      clipboardOptions.last = null
      clipboardOptions.pendingAutoFillItem = null
      clipboardOptions.detectedAt = null
      autoPasteActive.value = false
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
      clipboardOptions.pendingAutoFillItem = null
      clipboardOptions.detectedAt = Date.now()
      clipboardOptions.lastClearedTimestamp = null

      const identity = resolveClipboardIdentity(clipboard)
      const alreadyPasted = identity && autoPastedClipboardIdentities.has(identity)
      const shouldAutoPaste = !overrideDismissed && !alreadyPasted && canAutoPaste()
      let didAutoPaste = false

      if (identity && (overrideDismissed || shouldAutoPaste)) {
        didAutoPaste = autoFillClipboard(clipboard)

        if (shouldAutoPaste) autoPasteActive.value = didAutoPaste
      }

      if (!didAutoPaste || clipboardOptions.last) {
        onPasteCallback?.()
      }
      return
    }

    if (attemptAutoFill && !overrideDismissed) {
      const identity = resolveClipboardIdentity(clipboard)
      const alreadyPasted = identity && autoPastedClipboardIdentities.has(identity)
      const shouldAutoPaste = !alreadyPasted && canAutoPaste()

      if (identity && shouldAutoPaste) {
        const didAutoPaste = autoFillClipboard(clipboard)
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

  function clearClipboard(options?: {
    remember?: boolean
    preservePendingAutoFill?: boolean
  }): void {
    const remember = options?.remember ?? false
    const preservePendingAutoFill = options?.preservePendingAutoFill ?? false

    if (remember && clipboardOptions.last?.timestamp) {
      clipboardOptions.lastClearedTimestamp = clipboardOptions.last.timestamp
      markIdentityAsAutoPasted(clipboardOptions.last)
    } else if (!remember) {
      clipboardOptions.lastClearedTimestamp = null
    }

    clipboardOptions.last = null
    if (!preservePendingAutoFill) {
      clipboardOptions.pendingAutoFillItem = null
    }
    clipboardOptions.detectedAt = null
    autoPasteActive.value = false
    onPasteCallback?.()
  }

  // Delay clipboard channel initialization to ensure TouchChannel is available
  let cleanup: (() => void) | null = null
  let initAttempted = false

  // Capture startup baseline clipboard to avoid auto-pasting stale content on first show.
  void getLatestClipboard()
    .then((item) => {
      rememberStartupClipboard(item)
    })
    .catch(() => {})

  // Initialize clipboard channel on next tick to ensure TouchChannel is ready
  const initClipboardChannel = () => {
    if (initAttempted) return
    initAttempted = true

    try {
      cleanup = useClipboardChannel({
        onNewItem: (item) => {
          if (!item?.type) return

          rememberStartupClipboard(item)

          const dismissedTimestamp = normalizeTimestamp(clipboardOptions.lastClearedTimestamp)

          const incomingTimestamp = normalizeTimestamp(item.timestamp)
          if (incomingTimestamp && dismissedTimestamp && incomingTimestamp === dismissedTimestamp) {
            return
          }

          const changed = !isSameClipboardItem(clipboardOptions.last, item)
          if (changed) {
            autoPasteActive.value = false
          }
          clipboardOptions.last = item
          clipboardOptions.pendingAutoFillItem = null
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
      initAttempted = false
      setTimeout(initClipboardChannel, 100)
    }
  }

  // Initialize after component is mounted
  if (hasWindow()) {
    initClipboardChannel()
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
