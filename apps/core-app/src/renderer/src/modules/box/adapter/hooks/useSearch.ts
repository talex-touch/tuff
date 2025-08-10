import { ref, watch, computed } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { touchChannel } from '~/modules/channel/channel-core'
import { BoxMode, IBoxOptions } from '..'

export function useSearch(boxOptions: IBoxOptions) {
  const searchVal = ref('')
  const select = ref(-1)
  const res = ref<Array<any>>([])
  const loading = ref(false)

  const debouncedSearch = useDebounceFn(async () => {
    if (!searchVal.value) {
      res.value = []
      boxOptions.data = {}
      return
    }
    loading.value = true
    try {
      const query = { text: searchVal.value, mode: boxOptions.mode }
      console.log('search', query)
      const result = await touchChannel.send('core-box:query', { query })
      res.value = result.items
    } catch (error) {
      console.error('Search failed:', error)
      res.value = []
    } finally {
      loading.value = false
    }
  }, 200)

  async function handleSearch(): Promise<void> {
    boxOptions.focus = 0
    debouncedSearch()
  }

  async function handleExecute(item: any): Promise<void> {
    loading.value = true
    try {
      await touchChannel.send('core-box:execute', { item })
      searchVal.value = ''
    } catch (error) {
      console.error('Execute failed:', error)
    } finally {
      loading.value = false
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

  const debouncedExpand = useDebounceFn(() => {
    touchChannel.sendSync('core-box:expand', res.value.length)
  }, 50)

  watch(
    () => res.value?.length,
    () => debouncedExpand(),
    { deep: true }
  )

  watch(searchVal, (newSearchVal) => {
    if (boxOptions.mode === BoxMode.INPUT || boxOptions.mode === BoxMode.COMMAND) {
      boxOptions.mode = newSearchVal.startsWith('/') ? BoxMode.COMMAND : BoxMode.INPUT
    }
  })

  // 2. Watch for searchVal or mode changes to trigger the search
  watch([searchVal], handleSearch)

  const activeItem = computed(() => res.value[boxOptions.focus])

  return {
    searchVal,
    select,
    res,
    loading,
    activeItem,
    handleSearch,
    handleExecute,
    handleExit
  }
}
