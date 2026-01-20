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
import { getLatestClipboardSync } from './useClipboardChannel'

interface UseVisibilityOptions {
  boxOptions: IBoxOptions
  searchVal: Ref<string>
  clipboardOptions: IClipboardOptions
  handleAutoFill: () => void
  handlePaste: (options?: { overrideDismissed?: boolean; triggerSearch?: boolean }) => void
  boxInputRef: Ref<any>
  deactivateAllProviders: () => Promise<void>
}

const MAX_CLIPBOARD_AGE_MS = 5 * 60 * 1000

export function useVisibility(options: UseVisibilityOptions) {
  const {
    boxOptions,
    searchVal,
    clipboardOptions,
    handleAutoFill,
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
      onShow()
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

  function checkAutoClear(): void {
    if (appSetting.tools.autoClear === -1 || boxOptions.lastHidden <= 0) return

    const timeSinceHidden = Date.now() - boxOptions.lastHidden
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

  function isClipboardFreshForAutoPaste(): boolean {
    if (!appSetting.tools.autoPaste.enable) return false

    const limit = appSetting.tools.autoPaste.time
    if (limit === -1) return false

    const clipboard = getLatestClipboardSync()
    if (!clipboard?.timestamp) return false

    const copiedTime = new Date(clipboard.timestamp).getTime()
    const clipboardAge = Date.now() - copiedTime
    const effectiveLimit = limit === 0 ? MAX_CLIPBOARD_AGE_MS : limit * 1000
    return clipboardAge <= effectiveLimit
  }

  function onShow(): void {
    checkAutoClear()

    if (wasTriggeredByShortcut.value && isClipboardFreshForAutoPaste()) {
      handlePaste({ triggerSearch: true })
      handleAutoFill()
    }
    wasTriggeredByShortcut.value = false

    setTimeout(() => {
      nextTick(() => boxInputRef.value?.focus())
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
    cleanup: () => {
      unregisterShortcutTrigger()
      unregisterCoreBoxTrigger()
    }
  }
}
