import { touchChannel } from '~/modules/channel/channel-core'
import { Ref } from 'vue'
import { BoxMode } from '../types'

export function useChannel(boxOptions: any, res: Ref<any[]>): void {
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
