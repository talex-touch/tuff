import type { Ref } from 'vue'
import type { IBoxOptions } from '..'
import { useDocumentVisibility } from '@vueuse/core'
import { nextTick, watch } from 'vue'
import { appSetting } from '~/modules/channel/storage'
import { BoxMode } from '..'

export function useVisibility(
  boxOptions: IBoxOptions,
  searchVal: Ref<string>,
  clipboardOptions: any,
  handleAutoPaste: () => void,
  handlePaste: (options?: { overrideDismissed?: boolean }) => void,
  _clearClipboard: () => void,
  boxInputRef: Ref<any>,
) {
  const visibility = useDocumentVisibility()

  watch(
    () => visibility.value,
    (val) => {
      if (!val) {
        boxOptions.lastHidden = Date.now()
        console.debug('[Visibility] CoreBox hidden, timestamp saved:', boxOptions.lastHidden)
        // Don't clear clipboard, preserve state for expiration check on next open
        return
      }

      // Use nextTick to ensure the input element is available and ready.
      nextTick(() => {
        boxInputRef.value?.focus()
      })

      // Check if autoClear should be triggered
      if (appSetting.tools.autoClear !== -1 && boxOptions.lastHidden > 0) {
        const timeSinceHidden = Date.now() - boxOptions.lastHidden
        const autoClearMs = appSetting.tools.autoClear * 1000

        console.debug('[Visibility] CoreBox shown, checking autoClear', {
          timeSinceHidden: `${Math.round(timeSinceHidden / 1000)}s`,
          autoClearThreshold: `${appSetting.tools.autoClear}s`,
          shouldClear: timeSinceHidden > autoClearMs,
        })

        if (timeSinceHidden > autoClearMs) {
          console.debug('[Visibility] AutoClear triggered, clearing search bar')
          searchVal.value = ''
          boxOptions.mode = BoxMode.INPUT
          boxOptions.data = {}
        }
      }
      else if (appSetting.tools.autoClear === -1) {
        console.debug('[Visibility] AutoClear disabled (set to -1)')
      }
      else if (boxOptions.lastHidden <= 0) {
        console.debug('[Visibility] No lastHidden timestamp, skipping autoClear')
      }

      // Auto-detect clipboard when CoreBox is opened
      // handlePaste will check if clipboard is expired
      handlePaste()

      if (clipboardOptions.last) {
        handleAutoPaste()
      }
    },
  )

  return {
    visibility,
  }
}
