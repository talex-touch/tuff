import type { ITouchPlugin } from '@talex-touch/utils'
import type { ComputedRef, Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'
import { usePluginStore } from '~/stores/plugin'

/**
 * Return type for the usePluginSelection composable.
 */
interface UsePluginSelectionReturn {
  /** Computed array of all available plugins */
  plugins: ComputedRef<ITouchPlugin[]>
  /** Currently selected plugin name */
  select: Ref<string | undefined>
  /** Currently selected plugin object (computed for reactive updates) */
  curSelect: ComputedRef<ITouchPlugin | null>
  /** Loading state for async operations */
  loading: Ref<boolean>
  /** Function to select a plugin by name */
  selectPlugin: (name: string) => Promise<void>
}

/**
 * Composable for managing plugin selection state and lifecycle.
 *
 * Features:
 * - Plugin selection state management with type-safe plugin objects
 * - Auto-restore selection when a plugin reloads after being unloaded
 * - Automatic cleanup when the selected plugin is removed from the store
 * - Prevents race conditions with loading state management
 *
 * @returns Plugin selection state and control methods
 *
 * @example
 * ```ts
 * const { plugins, select, curSelect, loading, selectPlugin } = usePluginSelection()
 *
 * // Select a plugin
 * await selectPlugin('my-plugin-name')
 *
 * // Access current selection
 * console.log(curSelect.value?.name)
 * ```
 */
export function usePluginSelection(): UsePluginSelectionReturn {
  const pluginStore = usePluginStore()
  const { plugins: pluginMap } = storeToRefs(pluginStore)
  const plugins = computed(() => [...pluginMap.value.values()])

  const select = ref<string | undefined>()
  const loading = ref(false)
  const lastUnloadedPlugin = ref<string | null>(null)

  /**
   * Currently selected plugin object.
   * Directly retrieves from the reactive Map to ensure property updates
   * (like status changes) are properly tracked and trigger reactive updates.
   * Automatically returns null when:
   * - No plugin is selected
   * - Selected plugin is removed from the store
   * - Selected plugin name doesn't exist in the map
   */
  const curSelect = computed<ITouchPlugin | null>(() => {
    if (!select.value) return null
    return pluginMap.value.get(select.value) ?? null
  })

  /**
   * Watch for plugin unload events.
   * When the currently selected plugin is removed from the plugin map:
   * 1. Store the plugin name in lastUnloadedPlugin for potential auto-restore
   * 2. Clear the current selection
   * 3. curSelect computed property automatically returns null (plugin not found)
   */
  watch(
    () => pluginMap.value,
    (newMap, oldMap) => {
      if (!select.value || !oldMap) return

      if (oldMap.has(select.value) && !newMap.has(select.value)) {
        lastUnloadedPlugin.value = select.value
        select.value = undefined
      }
    },
    { deep: true }
  )

  /**
   * Watch for plugin reload events.
   * When the plugin map size increases, check if a previously unloaded plugin
   * has returned. If so, and the user hasn't selected a different plugin,
   * automatically restore the previous selection.
   */
  watch(
    () => pluginMap.value.size,
    () => {
      if (!lastUnloadedPlugin.value) return

      if (pluginMap.value.has(lastUnloadedPlugin.value) && !select.value) {
        select.value = lastUnloadedPlugin.value
        lastUnloadedPlugin.value = null
      }
    }
  )

  /**
   * Clear the lastUnloadedPlugin restoration target if the user manually
   * selects a different plugin. This prevents unwanted auto-restoration
   * when the user has moved on to a different plugin.
   */
  watch(
    () => select.value,
    (newSelect) => {
      if (newSelect && newSelect !== lastUnloadedPlugin.value && lastUnloadedPlugin.value) {
        lastUnloadedPlugin.value = null
      }
    }
  )

  /**
   * Selects a plugin by name.
   * Prevents selecting the same plugin twice and blocks selection during loading.
   *
   * @param name - The unique name/identifier of the plugin to select
   * @returns Promise that resolves when selection is complete
   */
  async function selectPlugin(name: string): Promise<void> {
    if (name === select.value || loading.value) return

    loading.value = true
    select.value = name

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
