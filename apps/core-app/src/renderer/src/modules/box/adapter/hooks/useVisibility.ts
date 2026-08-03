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
import { clearImplicitClipboardState, isClipboardFreshForAutoPaste } from './clipboard-autopaste'

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

  const applyVisibility = (visible: boolean): void => {
    if (lastVisibleState === visible) return
    lastVisibleState = visible
    setRendererActivity(visible)
    if (visible) {
      void onShow()
    } else {
      onHide()
    }
  }

  const unregisterShortcutTrigger = transport.on(CoreBoxEvents.ui.shortcutTriggered, () => {
    wasTriggeredByShortcut.value = true
  })
  const unregisterCoreBoxTrigger = transport.on(CoreBoxEvents.ui.trigger, (payload) => {
    if (!payload || typeof payload !== 'object' || !('show' in payload)) return
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
      if (nativeVisibilityVersion !== visibilityRequestVersion) return
      if (typeof response?.visible !== 'boolean') return
      hasNativeVisibilitySignal = true
      applyVisibility(response.visible)
    })
    .catch(() => {})

  function onHide(): void {
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
    checkAutoClear()

    if (wasTriggeredByShortcut.value && clipboardOptions.activeClipboardSource !== 'manual') {
      clearImplicitClipboardState(clipboardOptions)
      const clipboard = await getLatestClipboard({ refresh: true })
      if (isClipboardFreshForAutoPaste(clipboard, appSetting.tools.autoPaste)) {
        handlePaste({ triggerSearch: true, attemptAutoFill: true })
      }
    }
    wasTriggeredByShortcut.value = false

    setTimeout(() => {
      nextTick(() => boxInputRef.value?.focus?.())
    }, 120)
  }

  watch(
    () => visibility.value,
    (visible) => {
      if (!hasNativeVisibilitySignal) applyVisibility(visible === 'visible')
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
