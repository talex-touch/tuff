import type { Ref } from 'vue'
import type { IBoxOptions } from '..'
import type { IClipboardOptions } from './types'
import { useDocumentVisibility } from '@vueuse/core'
import { nextTick, ref, watch } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'
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

  const visibility = useDocumentVisibility()
  const wasTriggeredByShortcut = ref(false)

  const unregisterShortcutTrigger = touchChannel.regChannel('core-box:shortcut-triggered', () => {
    wasTriggeredByShortcut.value = true
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
      if (visible) {
        onShow()
      } else {
        onHide()
      }
    }
  )

  return {
    visibility,
    cleanup: () => unregisterShortcutTrigger()
  }
}
