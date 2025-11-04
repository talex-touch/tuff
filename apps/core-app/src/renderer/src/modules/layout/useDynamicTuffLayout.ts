import { computed, ref, watch, nextTick, type Component } from 'vue'
import { LayoutManager, type LayoutConfig } from './layout-manager'
import { getAppSettings, getAppSettingsSync } from './app-settings-loader'

/**
 * Composable for managing dynamic layout state and operations
 *
 * Provides reactive access to current layout, available layouts,
 * and methods to switch between layouts with dynamic loading.
 *
 * @example
 * ```ts
 * const { currentLayout, availableLayouts, switchLayout, layoutComponent } = useDynamicTuffLayout()
 * ```
 */
export function useDynamicTuffLayout() {
  const currentLayoutName = ref<string>(LayoutManager.getCurrentLayout())
  const layoutComponent = ref<Component | null>(null)
  const isLoading = ref(false)

  /**
   * Get available layouts from the registry
   */
  const availableLayouts = computed<Record<string, LayoutConfig>>(() => {
    return LayoutManager.getAvailableLayouts()
  })

  /**
   * Get current layout configuration
   */
  const currentLayout = computed<LayoutConfig | undefined>(() => {
    return LayoutManager.getLayoutConfig(currentLayoutName.value)
  })

  /**
   * Get current layout display name
   */
  const currentLayoutDisplayName = computed(() => {
    return currentLayout.value?.displayName || currentLayoutName.value
  })

  /**
   * Load the layout component for the current layout name
   */
  async function loadLayout(layoutName?: string): Promise<void> {
    const layoutToLoad = layoutName || currentLayoutName.value

    console.log('[useDynamicTuffLayout] loadLayout called:', {
      layoutToLoad,
      currentLayoutName: currentLayoutName.value,
      isLoading: isLoading.value
    })

    if (!LayoutManager.hasLayout(layoutToLoad)) {
      console.warn(`[useDynamicTuffLayout] Layout "${layoutToLoad}" not found, using "simple"`)
      layoutToLoad === 'simple' ? void 0 : await loadLayout('simple')
      return
    }

    try {
      console.log('[useDynamicTuffLayout] Starting to load layout:', layoutToLoad)
      isLoading.value = true

      // Force reload to get fresh component instance
      const component = await LayoutManager.loadLayoutComponent(layoutToLoad, true)
      console.log('[useDynamicTuffLayout] Layout component loaded:', {
        layoutToLoad,
        component,
        componentType: typeof component,
        isVueComponent: !!component
      })

      layoutComponent.value = component
      currentLayoutName.value = layoutToLoad

      console.log('[useDynamicTuffLayout] Layout loaded successfully:', {
        layoutToLoad,
        hasComponent: !!layoutComponent.value,
        currentLayoutName: currentLayoutName.value
      })
    } catch (error) {
      console.error(`[useDynamicTuffLayout] Failed to load layout "${layoutToLoad}":`, error)
      // Fallback to simple layout on error
      if (layoutToLoad !== 'simple') {
        await loadLayout('simple')
      }
    } finally {
      isLoading.value = false
      console.log('[useDynamicTuffLayout] loadLayout completed, isLoading:', isLoading.value)
    }
  }

  /**
   * Switch to a different layout
   * @param layoutName - Name of the layout to switch to
   */
  async function switchLayout(layoutName: string): Promise<void> {
    console.log('[useDynamicTuffLayout] switchLayout called:', {
      layoutName,
      currentLayout: currentLayoutName.value,
      hasComponent: !!layoutComponent.value
    })

    if (layoutName === currentLayoutName.value) {
      console.log('[useDynamicTuffLayout] Layout already active, skipping')
      return
    }

    try {
      // Clear current component first to force re-render
      console.log('[useDynamicTuffLayout] Clearing current component')
      layoutComponent.value = null

      // Update appSettings first to trigger reactive updates
      console.log('[useDynamicTuffLayout] Setting layout in appSettings:', layoutName)
      LayoutManager.setCurrentLayout(layoutName)

      // Update currentLayoutName immediately
      console.log('[useDynamicTuffLayout] Updating currentLayoutName to:', layoutName)
      currentLayoutName.value = layoutName

      // Wait a tick to ensure reactive updates propagate
      await nextTick()

      console.log('[useDynamicTuffLayout] Loading layout component:', layoutName)
      await loadLayout(layoutName)

      console.log('[useDynamicTuffLayout] Layout switch completed:', {
        layoutName,
        hasComponent: !!layoutComponent.value,
        currentLayoutName: currentLayoutName.value,
        isLoading: isLoading.value
      })
    } catch (error) {
      console.error('[useDynamicTuffLayout] Failed to switch layout:', error)
      throw error
    }
  }

  // Watch for when appSettings becomes available and load saved layout
  watch(
    () => {
      try {
        const settings = getAppSettings()
        return settings?.data?.layout
      } catch {
        // Try to initialize appSettings if not cached yet
        getAppSettingsSync()
          .then(() => {
            // Retry after initialization
            const settings = getAppSettings()
            if (settings?.data?.layout && settings.data.layout !== currentLayoutName.value) {
              currentLayoutName.value = settings.data.layout
              loadLayout(settings.data.layout)
            }
          })
          .catch(() => {
            // Will retry on next watch cycle
          })
        return null
      }
    },
    (newLayout) => {
      if (newLayout && newLayout !== currentLayoutName.value) {
        currentLayoutName.value = newLayout
        loadLayout(newLayout)
      } else if (!layoutComponent.value) {
        // Load default layout if we haven't loaded any yet
        const savedLayout = LayoutManager.getCurrentLayout()
        if (savedLayout && savedLayout !== currentLayoutName.value) {
          currentLayoutName.value = savedLayout
          loadLayout(savedLayout)
        } else {
          loadLayout('simple')
        }
      }
    },
    { immediate: true }
  )

  return {
    // State - return refs directly for better reactivity
    currentLayoutName,  // ref, not computed
    currentLayout,
    currentLayoutDisplayName,
    layoutComponent,    // ref, not computed
    isLoading,          // ref, not computed
    availableLayouts,

    // Methods
    loadLayout,
    switchLayout,
  }
}

