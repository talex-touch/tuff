import { watch, Ref } from 'vue'
import { useDocumentVisibility } from '@vueuse/core'
import { appSetting } from '~/modules/channel/storage'
import { IBoxOptions } from '..'

export function useVisibility(
  boxOptions: IBoxOptions,
  searchVal: Ref<string>,
  clipboardOptions: any,
  handleAutoPaste: () => void
) {
  const visibility = useDocumentVisibility()

  watch(
    () => visibility.value,
    (val) => {
      if (!val) {
        boxOptions.lastHidden = Date.now()
        return
      }

      const inputEl = document.getElementById('core-box-input')
      setTimeout(() => inputEl?.focus(), 200)

      if (
        appSetting.tools.autoClear !== -1 &&
        Date.now() - boxOptions.lastHidden > appSetting.tools.autoClear * 1000
      ) {
        searchVal.value = ''
        boxOptions.mode = BoxMode.INPUT
        boxOptions.data = {}
      }

      if (clipboardOptions.last) {
        handleAutoPaste()
      }
    }
  )

  return {
    visibility
  }
}
