import { touchChannel } from '~/modules/channel/channel-core'
import { appAmo, BoxMode } from '../adapter'
import { insertSorted } from '../search-sorter'

export function useChannel(
  boxOptions: any,
  res: Ref<any[]>,
  searchVal: Ref<string>
) {
  touchChannel.regChannel('core-box:trigger', ({ data }: any) => {
    const { show, id } = data

    const isOurWindow = window.$startupInfo?.id === undefined || window.$startupInfo.id === id

    if (show && isOurWindow) {
      import('../adapter')
        .then(({ refreshSearchList }) => {
          refreshSearchList()
            .then(() => {})
            .catch(() => {})
        })
        .catch(() => {})
    }
  })

  touchChannel.regChannel('core-box:push-items', ({ data }: any) => {
    if (data && data.items && Array.isArray(data.items)) {
      data.items.forEach((item: any) => {
        const amo = appAmo[item.name] || 0
        item.amo = amo

        const itemId = `${item.name}-${item.desc || ''}-${item.value || ''}-${Date.now()}-${Math.random()}`
        item.pushedItemId = itemId

        if (boxOptions.mode === BoxMode.FEATURE && boxOptions.data?.pushedItemIds) {
          boxOptions.data.pushedItemIds.add(itemId)
        }

        res.value = insertSorted(res.value, item, searchVal.value)
      })
    }
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