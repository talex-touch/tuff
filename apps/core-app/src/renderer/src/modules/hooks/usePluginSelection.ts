import { ref, watch, computed, nextTick } from 'vue'
import { usePluginStore } from '~/stores/plugin'
import { storeToRefs } from 'pinia'
import { useDebounceFn } from '@vueuse/core'

export function usePluginSelection() {
  const pluginStore = usePluginStore()
  const { plugins: pluginMap } = storeToRefs(pluginStore)
  const plugins = computed(() => [...pluginMap.value.values()])

  const select = ref<string>()
  const curSelect = ref<any>()
  const loading = ref(false)
  const lastUnloadedPlugin = ref<string | null>(null)

  const updateSelectedPlugin = useDebounceFn(() => {
    if (!plugins.value || !select.value) {
      curSelect.value = null
      return
    }
    curSelect.value = plugins.value.find((item) => item.name === select.value) || null
    if (curSelect.value) {
      console.log(
        `[usePluginSelection] Plugin "${curSelect.value.name}" selected. Initial status:`,
        curSelect.value.status
      )
    }
  }, 50)

  watch(() => select.value, updateSelectedPlugin, { immediate: true })

  // Watch for plugin unload (when selected plugin is removed from map)
  watch(
    () => pluginMap.value,
    (newMap, oldMap) => {
      if (!select.value || !oldMap) return

      // Check if the currently selected plugin was removed
      if (oldMap.has(select.value) && !newMap.has(select.value)) {
        console.log(`[usePluginSelection] Selected plugin "${select.value}" was unloaded`)
        lastUnloadedPlugin.value = select.value
        select.value = ''
        console.log(
          `[usePluginSelection] Selection cleared, will auto-restore if plugin reloads and user doesn't select another`
        )
      }
    },
    { deep: true }
  )

  // Watch for plugin reload (when size increases and lastUnloaded plugin returns)
  watch(
    () => pluginMap.value.size,
    () => {
      if (!lastUnloadedPlugin.value) return

      // If the previously unloaded plugin is back and user hasn't selected anything else
      if (pluginMap.value.has(lastUnloadedPlugin.value) && !select.value) {
        console.log(
          `[usePluginSelection] Auto-restoring selection to: ${lastUnloadedPlugin.value}`
        )
        select.value = lastUnloadedPlugin.value
        lastUnloadedPlugin.value = null
      }
    }
  )

  // Clear lastUnloadedPlugin if user manually selects a different plugin
  watch(
    () => select.value,
    (newSelect) => {
      if (newSelect && newSelect !== lastUnloadedPlugin.value && lastUnloadedPlugin.value) {
        console.log(
          `[usePluginSelection] User selected different plugin, clearing restore target: ${lastUnloadedPlugin.value}`
        )
        lastUnloadedPlugin.value = null
      }
    }
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

  console.log(plugins)

  return {
    plugins,
    select,
    curSelect,
    loading,
    selectPlugin
  }
}
