import type { Ref } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { BoxMode } from '../types'

export function useChannel(boxOptions: any, res: Ref<any[]>, searchVal?: Ref<string>): void {
  // 监听主进程请求输入框可见性变化
  touchChannel.regChannel('core-box:set-input-visibility', ({ data }: any) => {
    const { visible } = data
    // 通过 boxOptions 控制输入框可见性
    if (boxOptions) {
      boxOptions.inputVisible = visible
    }
  })

  // 监听主进程请求当前输入值
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
