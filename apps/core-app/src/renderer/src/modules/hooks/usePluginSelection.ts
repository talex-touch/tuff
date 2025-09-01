import { ref, watch, computed, nextTick } from 'vue'
import { usePluginStore } from '~/modules/adapter/plugin-adapter/store'
import { storeToRefs } from 'pinia'
import { useDebounceFn } from '@vueuse/core'

export function usePluginSelection() {
  const pluginStore = usePluginStore()
  const { plugins: pluginMap } = storeToRefs(pluginStore)
  const plugins = computed(() => [...pluginMap.value.values()])

  const select = ref<string>()
  const curSelect = ref<any>()
  const loading = ref(false)

  const updateSelectedPlugin = useDebounceFn(() => {
    if (!plugins.value || !select.value) {
      curSelect.value = null
      return
    }
    curSelect.value = plugins.value.find((item) => item.name === select.value) || null
  }, 50)

  watch(() => select.value, updateSelectedPlugin, { immediate: true })

  watch(
    () => plugins,
    (newPlugins, oldPlugins) => {
      if (!select.value || !newPlugins || !oldPlugins) return
      // @ts-ignore - map to array
      if (newPlugins.size === oldPlugins.size) return

      const temp = select.value
      select.value = ''
      nextTick(() => {
        setTimeout(() => (select.value = temp), 200)
      })
    },
    { deep: true }
  )

  async function selectPlugin(index: string): Promise<void> {
    if (index === select.value || loading.value) return

    console.log('selectPlugin', index, plugins.value[index])

    loading.value = true

    select.value = index

    // Simulate async operation if needed, or just set loading false after a tick
    await nextTick()
    loading.value = false
  }

  return {
    plugins,
    select,
    curSelect,
    loading,
    selectPlugin
  }
}
