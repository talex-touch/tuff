import { reactive, Ref } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { appSetting } from '~/modules/channel/storage'
import { BoxMode, IBoxOptions } from '..'

export function useClipboard(boxOptions: IBoxOptions, searchVal: Ref<string>) {
  const clipboardOptions = reactive<any>({
    last: null
  })

  function handleAutoPaste(): void {
    if (!clipboardOptions.last) return

    const time = appSetting.tools.autoPaste.time
    const timeDiff = Date.now() - new Date(clipboardOptions.last.timestamp).getTime()

    if (
      time !== -1 &&
      appSetting.tools.autoPaste.enable &&
      (time === 0 || timeDiff < time * 1000)
    ) {
      const data = clipboardOptions.last

      if (data.type === 'files') {
       const pathList = JSON.parse(data.content)
        const [firstFile] = pathList
        if (firstFile) {
          touchChannel
            .send('file:extract-icon', {
              path: firstFile
            })
            .then((buffer) => {
              boxOptions.file = {
                buffer,
                paths: pathList
              }
              boxOptions.mode = BoxMode.FILE
            })
        }
      } else if (data.type !== 'image') {
        searchVal.value = data.content
      }

      clipboardOptions.last = null
    }
  }

  function handlePaste(): void {
   const clipboard = touchChannel.sendSync('clipboard:get-latest')

    Object.assign(clipboardOptions, {
      last: clipboard
    })

    handleAutoPaste()
  }

  touchChannel.regChannel('clipboard:new-item', (data: any) => {
    if (!data?.type) return
    Object.assign(clipboardOptions, {
      last: data
    })
  })

  return {
    clipboardOptions,
    handlePaste,
    handleAutoPaste
  }
}
