import type { Ref } from 'vue'
import type { IBoxOptions } from '..'
import type { IClipboardOptions } from './types'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { useDocumentVisibility } from '@vueuse/core'
import { nextTick, ref, watch } from 'vue'
import { appSetting } from '~/modules/channel/storage'
import { BoxMode } from '..'
import { getLatestClipboard } from './useClipboardChannel'

interface UseVisibilityOptions {
  boxOptions: IBoxOptions
  searchVal: Ref<string>
  clipboardOptions: IClipboardOptions
  handlePaste: (options?: {
    overrideDismissed?: boolean
    triggerSearch?: boolean
    attemptAutoFill?: boolean
  }) => void
  boxInputRef: Ref<{ focus?: () => void } | null>
  deactivateAllProviders: () => Promise<void>
}

export function useVisibility(options: UseVisibilityOptions) {
  const {
    boxOptions,
    searchVal,
    clipboardOptions,
    handlePaste,
    boxInputRef,
    deactivateAllProviders
  } = options

  const transport = useTuffTransport()
  const visibility = useDocumentVisibility()
  const wasTriggeredByShortcut = ref(false)
  let lastVisibleState: boolean | null = null

  const coreBoxTrigger = defineRawEvent<Record<string, unknown>, void>('core-box:trigger')

  const applyVisibility = (visible: boolean): void => {
    if (lastVisibleState === visible) return
    lastVisibleState = visible
    if (visible) {
      void onShow()
    } else {
      onHide()
    }
  }

  const unregisterShortcutTrigger = transport.on(CoreBoxEvents.ui.shortcutTriggered, () => {
    wasTriggeredByShortcut.value = true
  })
  const unregisterCoreBoxTrigger = transport.on(coreBoxTrigger, (payload) => {
    if (!payload || typeof payload !== 'object') return
    const show = (payload as { show?: unknown }).show
    if (typeof show === 'boolean') {
      applyVisibility(show)
    }
  })

  function onHide(): void {
    boxOptions.lastHidden = Date.now()
    wasTriggeredByShortcut.value = false
    deactivateAllProviders().catch(() => {})
  }

  function checkAutoClear(lastHiddenOverride?: number): void {
    const lastHiddenAt =
      typeof lastHiddenOverride === 'number' ? lastHiddenOverride : boxOptions.lastHidden
    if (appSetting.tools.autoClear === -1 || lastHiddenAt <= 0) return

    const timeSinceHidden = Date.now() - lastHiddenAt
    const autoClearMs = appSetting.tools.autoClear * 1000

    if (timeSinceHidden > autoClearMs) {
      searchVal.value = ''
      boxOptions.mode = BoxMode.INPUT
      boxOptions.data = {}
      boxOptions.file = { buffer: null, paths: [] }
      boxOptions.layout = undefined
      clipboardOptions.last = null
      clipboardOptions.detectedAt = null
      clipboardOptions.lastClearedTimestamp = null
      deactivateAllProviders().catch(() => {})
    }
  }

  async function isClipboardFreshForAutoPaste(): Promise<boolean> {
    if (!appSetting.tools.autoPaste.enable) return false

    const limit = appSetting.tools.autoPaste.time
    if (limit === -1) return false

    const clipboard = (await getLatestClipboard()) ?? clipboardOptions.last
    if (!clipboard?.timestamp) return false

    const copiedTime = new Date(clipboard.timestamp).getTime()
    if (!Number.isFinite(copiedTime)) return false

    const lastTimestamp = clipboardOptions.last?.timestamp
      ? new Date(clipboardOptions.last.timestamp).getTime()
      : null
    const sameItem =
      Boolean(
        clipboardOptions.last?.id && clipboard.id && clipboardOptions.last.id === clipboard.id
      ) ||
      (typeof lastTimestamp === 'number' && lastTimestamp === copiedTime)
    const detectedAt =
      sameItem && typeof clipboardOptions.detectedAt === 'number'
        ? clipboardOptions.detectedAt
        : null
    const baseTime =
      typeof detectedAt === 'number' && Number.isFinite(detectedAt)
        ? Math.min(copiedTime, detectedAt)
        : copiedTime
    const clipboardAge = Date.now() - baseTime
    const effectiveLimit = limit === 0 ? Number.POSITIVE_INFINITY : limit * 1000
    return clipboardAge <= effectiveLimit
  }

  async function onShow(): Promise<void> {
    checkAutoClear()

    if (wasTriggeredByShortcut.value && (await isClipboardFreshForAutoPaste())) {
      handlePaste({ triggerSearch: true, attemptAutoFill: true })
    }
    wasTriggeredByShortcut.value = false

    setTimeout(() => {
      nextTick(() => boxInputRef.value?.focus?.())
    }, 120)
  }

  watch(
    () => visibility.value,
    (visible) => {
      applyVisibility(visible === 'visible')
    }
  )

  return {
    visibility,
    checkAutoClear,
    cleanup: () => {
      unregisterShortcutTrigger?.()
      unregisterCoreBoxTrigger?.()
    }
  }
}
