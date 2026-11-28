import type { Ref } from 'vue'
import type { IBoxOptions } from '..'
import type { IClipboardOptions } from './types'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { MetaOverlayEvents } from '@talex-touch/utils/transport/events/meta-overlay'
import { useDocumentVisibility } from '@vueuse/core'
import { nextTick, ref, watch } from 'vue'
import { appSetting } from '~/modules/storage/app-storage'
import { BoxMode } from '..'
import { getLatestClipboard } from './useClipboardChannel'
import { setRendererActivity } from '~/modules/telemetry/renderer-activity'
import {
  clearImplicitClipboardState,
  isClipboardDismissed,
  isClipboardFreshForAutoPaste
} from './clipboard-autopaste'

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
  let hasNativeVisibilitySignal = false
  let nativeVisibilityVersion = 0
  let visibilityGeneration = 0
  let disposed = false
  let focusTimer: ReturnType<typeof setTimeout> | null = null

  function clearFocusTimer(): void {
    if (focusTimer === null) return
    clearTimeout(focusTimer)
    focusTimer = null
  }

  const applyVisibility = (visible: boolean): void => {
    if (disposed || lastVisibleState === visible) return
    lastVisibleState = visible
    setRendererActivity(visible)
    if (visible) {
      void onShow()
    } else {
      onHide()
    }
  }

  const unregisterShortcutTrigger = transport.on(CoreBoxEvents.ui.shortcutTriggered, () => {
    if (disposed) return
    wasTriggeredByShortcut.value = true
  })
  const unregisterCoreBoxTrigger = transport.on(CoreBoxEvents.ui.trigger, (payload) => {
    if (disposed || !payload || typeof payload !== 'object' || !('show' in payload)) return
    const show = payload.show
    if (typeof show !== 'boolean') return
    hasNativeVisibilitySignal = true
    nativeVisibilityVersion += 1
    applyVisibility(show)
  })

  setRendererActivity(visibility.value === 'visible')
  const visibilityRequestVersion = nativeVisibilityVersion
  void transport
    .send(CoreBoxEvents.ui.getVisibility)
    .then((response) => {
      if (disposed || nativeVisibilityVersion !== visibilityRequestVersion) return
      if (typeof response?.visible !== 'boolean') return
      hasNativeVisibilitySignal = true
      applyVisibility(response.visible)
    })
    .catch(() => {})

  function onHide(): void {
    visibilityGeneration += 1
    clearFocusTimer()
    boxOptions.lastHidden = Date.now()
    wasTriggeredByShortcut.value = false
    clearImplicitClipboardState(clipboardOptions)
  }

  function checkAutoClear(lastHiddenOverride?: number): void {
    const lastHiddenAt =
      typeof lastHiddenOverride === 'number' ? lastHiddenOverride : boxOptions.lastHidden
    const autoClearSeconds = Number(appSetting.tools.autoClear)
    if (!Number.isFinite(autoClearSeconds) || autoClearSeconds <= 0 || lastHiddenAt <= 0) return

    const timeSinceHidden = Date.now() - lastHiddenAt
    const autoClearMs = autoClearSeconds * 1000

    if (timeSinceHidden > autoClearMs) {
      searchVal.value = ''
      boxOptions.mode = BoxMode.INPUT
      boxOptions.data = {}
      boxOptions.file = { buffer: null, paths: [] }
      boxOptions.layout = undefined
      clipboardOptions.last = null
      clipboardOptions.pendingAutoFillItem = null
      clipboardOptions.detectedAt = null
      clipboardOptions.lastClearedTimestamp = null
      clipboardOptions.activeClipboardSource = null
      clipboardOptions.lastTextAttachmentIdentity = null
      clipboardOptions.lastTextAttachmentSource = null
      void transport.send(MetaOverlayEvents.ui.hide).catch(() => {})
      deactivateAllProviders().catch(() => {})
    }
  }

  async function onShow(): Promise<void> {
    const showGeneration = ++visibilityGeneration
    const triggeredByShortcut = wasTriggeredByShortcut.value
    wasTriggeredByShortcut.value = false
    clearFocusTimer()
    checkAutoClear()

    if (clipboardOptions.activeClipboardSource !== 'manual') {
      const clipboard = await getLatestClipboard({ refresh: true })
      if (disposed || showGeneration !== visibilityGeneration || lastVisibleState !== true) return
      if (clipboard?.content || clipboard?.thumbnail || clipboard?.type === 'files') {
        const canAutoPaste =
          !isClipboardDismissed(clipboard, clipboardOptions) &&
          triggeredByShortcut &&
          isClipboardFreshForAutoPaste(clipboard, appSetting.tools.autoPaste)

        if (canAutoPaste) {
          handlePaste({ triggerSearch: true, attemptAutoFill: true })
        } else {
          clearImplicitClipboardState(clipboardOptions)
        }
      } else {
        clearImplicitClipboardState(clipboardOptions)
      }
    }

    if (disposed || showGeneration !== visibilityGeneration || lastVisibleState !== true) return
    clearFocusTimer()
    focusTimer = setTimeout(() => {
      focusTimer = null
      if (disposed || showGeneration !== visibilityGeneration || lastVisibleState !== true) return
      void nextTick(() => {
        if (disposed || showGeneration !== visibilityGeneration || lastVisibleState !== true) return
        boxInputRef.value?.focus?.()
      })
    }, 120)
  }

  watch(
    () => visibility.value,
    (visible) => {
      if (!disposed && !hasNativeVisibilitySignal) applyVisibility(visible === 'visible')
    }
  )

  return {
    visibility,
    checkAutoClear,
    cleanup: () => {
      disposed = true
      visibilityGeneration += 1
      clearFocusTimer()
      unregisterShortcutTrigger?.()
      unregisterCoreBoxTrigger?.()
    }
  }
}
