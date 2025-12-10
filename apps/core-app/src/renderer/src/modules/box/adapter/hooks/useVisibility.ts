import type { Ref } from 'vue'
import type { IBoxOptions } from '..'
import type { IClipboardOptions } from './types'
import { useDocumentVisibility } from '@vueuse/core'
import { nextTick, ref, watch } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { appSetting } from '~/modules/channel/storage'
import { BoxMode } from '..'

interface UseVisibilityOptions {
  boxOptions: IBoxOptions
  searchVal: Ref<string>
  clipboardOptions: IClipboardOptions
  handleAutoFill: () => void
  handlePaste: (options?: { overrideDismissed?: boolean; triggerSearch?: boolean }) => void
  boxInputRef: Ref<any>
  deactivateAllProviders: () => Promise<void>
}

/**
 * Manages CoreBox visibility, auto-clear, and autopaste behavior
 */
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

  /**
   * Handles CoreBox hide event
   */
  function onHide(): void {
    boxOptions.lastHidden = Date.now()
    wasTriggeredByShortcut.value = false
    // Don't clear searchVal here - let checkAutoClear handle it based on time threshold
    deactivateAllProviders().catch(() => {})
  }

  /**
   * Checks and applies auto-clear if threshold exceeded.
   * Performs a complete reset of CoreBox state including:
   * - Input text
   * - Box mode and data
   * - File attachments
   * - Layout configuration
   * - Clipboard state
   * - Active providers (triggers detachUIView in main process)
   */
  function checkAutoClear(): void {
    if (appSetting.tools.autoClear === -1 || boxOptions.lastHidden <= 0) return

    const timeSinceHidden = Date.now() - boxOptions.lastHidden
    const autoClearMs = appSetting.tools.autoClear * 1000

    if (timeSinceHidden > autoClearMs) {
      // Reset input
      searchVal.value = ''

      // Reset box mode and state
      boxOptions.mode = BoxMode.INPUT
      boxOptions.data = {}

      // Reset file attachments
      boxOptions.file = { buffer: null, paths: [] }

      // Reset layout configuration
      boxOptions.layout = undefined

      // Reset clipboard state (attachments)
      clipboardOptions.last = null
      clipboardOptions.detectedAt = null
      clipboardOptions.lastClearedTimestamp = null

      // Deactivate all providers - this triggers:
      // 1. Main process exitUIMode()
      // 2. detachUIView() to remove plugin WebContentsView
      // 3. BoxItemManager.clear() for plugin pushed items
      deactivateAllProviders().catch(() => {})
    }
  }

  /**
   * Handles CoreBox show event
   */
  function onShow(): void {
    checkAutoClear()
    // Trigger search with clipboard content when CoreBox opens
    handlePaste({ triggerSearch: true })

    // Auto-fill clipboard content when triggered by shortcut
    if (wasTriggeredByShortcut.value && clipboardOptions.last) {
      handleAutoFill()
      wasTriggeredByShortcut.value = false
    }

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
