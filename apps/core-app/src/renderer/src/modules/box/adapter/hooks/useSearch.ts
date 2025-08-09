import { ref, watch, computed } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { touchChannel } from '~/modules/channel/channel-core'
import { search, execute, appAmo, BoxMode, IBoxOptions } from '..'
import { insertSorted } from '../../../../views/box/search-sorter'

export function useSearch(boxOptions: IBoxOptions) {
  const searchVal = ref('')
  const select = ref(-1)
  const res = ref<Array<any>>([])

  async function handleSearch(): Promise<void> {
    boxOptions.focus = 0

    if (boxOptions.mode === BoxMode.FEATURE && boxOptions.data?.pushedItemIds) {
      const pushedIds = boxOptions.data.pushedItemIds
      res.value = res.value.filter(
        (item: any) => item.pushedItemId && pushedIds.has(item.pushedItemId)
      )
    } else {
      res.value = []
    }

    if (!searchVal.value) {
      boxOptions.data = {}
      return
    }

    const info: any = {}

    if (boxOptions.mode === BoxMode.FEATURE) {
      Object.assign(info, boxOptions.data)
    }

    await search(searchVal.value, { mode: boxOptions.mode }, info, (v) => {
      const amo = appAmo[v.name] || 0
      v.amo = amo

      res.value = insertSorted(res.value, v, searchVal.value)
    })
  }

  function handleExecute(item: any): void {
    const data = execute(item, searchVal.value)
    if (data === 'push') {
      boxOptions.mode = BoxMode.FEATURE

      const shouldClearQuery = item.matchedByName === true
      const queryToUse = shouldClearQuery ? '' : searchVal.value

      const featureToUse = item.originFeature || item

      boxOptions.data = {
        feature: featureToUse,
        plugin: item.value,
        query: queryToUse,
        pushedItemIds: new Set()
      }

      if (shouldClearQuery) {
        searchVal.value = ''
      }
    } else {
      searchVal.value = ''
    }

    select.value = -1
  }

  function handleExit(): void {
    if (boxOptions.mode !== BoxMode.INPUT) {
      if (boxOptions.mode === BoxMode.FEATURE) {
        if (boxOptions.data?.pushedItemIds && boxOptions.data.pushedItemIds.size > 0) {
          const pushedIds = boxOptions.data.pushedItemIds

          res.value = res.value.filter((item: any) => {
            return !item.pushedItemId || !pushedIds.has(item.pushedItemId)
          })
        }

        if (boxOptions.data?.plugin) {
          touchChannel.send('trigger-plugin-feature-exit', {
            plugin: boxOptions.data.plugin
          })
        }
      }

      boxOptions.mode = searchVal.value.startsWith('/') ? BoxMode.COMMAND : BoxMode.INPUT
      boxOptions.data = {}
    } else if (searchVal.value) {
      searchVal.value = ''
    } else {
      touchChannel.sendSync('core-box:hide')
    }
  }

  watch(
    () => searchVal.value,
    () => {
      handleSearch()
    }
  )

  const debouncedExpand = useDebounceFn(() => {
    touchChannel.sendSync('core-box:expand', res.value.length)
  }, 50)

  watch(
    () => searchVal.value?.length + res.value?.length,
    () => {
      debouncedExpand()
    }
  )

  watch(
    () => boxOptions.mode,
    () => {
      handleSearch()
    }
  )

  watch(
    () => searchVal.value,
    (val) => {
      if (boxOptions.mode === BoxMode.INPUT || boxOptions.mode === BoxMode.COMMAND)
        boxOptions.mode = val?.at?.(0) === '/' ? BoxMode.COMMAND : BoxMode.INPUT
    },
    { immediate: true }
  )

  const activeItem = computed(() => res.value[boxOptions.focus])

  return {
    searchVal,
    select,
    res,
    activeItem,
    handleSearch,
    handleExecute,
    handleExit
  }
}