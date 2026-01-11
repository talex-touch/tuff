import type { Ref } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { BoxMode } from '../types'
import { DataCode } from '@talex-touch/utils'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'

export function useChannel(boxOptions: any, res: Ref<any[]>, searchVal?: Ref<string>): void {
  console.log('useChannel', boxOptions)
  const transport = useTuffTransport()

  touchChannel.regChannel('core-box:set-input-visibility', ({ data }: any) => {
    const { visible } = data
    if (boxOptions) {
      boxOptions.inputVisible = visible
    }
  })

  transport.on(CoreBoxEvents.input.setVisibility, ({ visible }) => {
    if (boxOptions) {
      boxOptions.inputVisible = visible
    }
  })

  touchChannel.regChannel('core-box:request-input-value', ({ reply }: any) => {
    const input = searchVal?.value || ''
    reply(DataCode.SUCCESS, { input })
  })

  transport.on(CoreBoxEvents.input.requestValue, () => {
    const input = searchVal?.value || ''
    return { input }
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
