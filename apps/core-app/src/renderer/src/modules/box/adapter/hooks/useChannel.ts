import type { Ref } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { BoxMode } from '../types'

export function useChannel(boxOptions: any, res: Ref<any[]>, searchVal?: Ref<string>): void {
  console.log('useChannel', boxOptions)

  touchChannel.regChannel('core-box:set-input-visibility', ({ data }: any) => {
    const { visible } = data
    if (boxOptions) {
      boxOptions.inputVisible = visible
    }
  })

  touchChannel.regChannel('core-box:request-input-value', ({ reply }: any) => {
    const input = searchVal?.value || ''
    reply({ input })
  })

  touchChannel.regChannel('core-box:clear-items', ({ data }: any) => {
    if (data && data.pluginName) {
      const removedIds = new Set()

      res.value = res.value.filter((item: any) => {
        if (item.value === data.pluginName) {
          if (item.pushedItemId) {
            removedIds.add(item.pushedItemId)
          }
          return false
        }
        return true
      })

      if (boxOptions.mode === BoxMode.FEATURE && boxOptions.data?.pushedItemIds) {
        removedIds.forEach((id) => {
          boxOptions.data.pushedItemIds.delete(id)
        })
      }
    }
  })
}
