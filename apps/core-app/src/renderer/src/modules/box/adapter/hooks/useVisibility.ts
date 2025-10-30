import { watch, Ref, nextTick } from 'vue'
import { useDocumentVisibility } from '@vueuse/core'
import { appSetting } from '~/modules/channel/storage'
import { BoxMode, IBoxOptions } from '..'

export function useVisibility(
  boxOptions: IBoxOptions,
  searchVal: Ref<string>,
  clipboardOptions: any,
  handleAutoPaste: () => void,
  handlePaste: () => void,
  clearClipboard: () => void,
  boxInputRef: Ref<any>
) {
  const visibility = useDocumentVisibility()

  watch(
    () => visibility.value,
    (val) => {
      if (!val) {
        boxOptions.lastHidden = Date.now()
        // Don't clear clipboard, preserve state for expiration check on next open
        return
      }

      // Use nextTick to ensure the input element is available and ready.
      nextTick(() => {
        boxInputRef.value?.focus()
      })

      if (
        appSetting.tools.autoClear !== -1 &&
        Date.now() - boxOptions.lastHidden > appSetting.tools.autoClear * 1000
      ) {
        searchVal.value = ''
        boxOptions.mode = BoxMode.INPUT
        boxOptions.data = {}
      }

      // Auto-detect clipboard when CoreBox is opened
      // handlePaste will check if clipboard is expired
      handlePaste()

      if (clipboardOptions.last) {
        handleAutoPaste()
      }
    }
  )

  return {
    visibility
  }
}
