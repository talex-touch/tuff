import { computed, ref, watch, nextTick, type Component } from 'vue'
import layoutsDefinition, { LayoutConfig } from './layouts-definition'
import { appSettings } from '@talex-touch/utils/renderer/storage/app-settings'

/**
 * Layout component cache
 */
const componentCache: Map<string, Component> = new Map()

/**
 * Get the current layout name from settings
 */
function getCurrentLayoutName(): string {
  try {
    if (appSettings?.data?.layout && layoutsDefinition[appSettings.data.layout]) {
      return appSettings.data.layout
    }
  } catch {
    // appSettings not initialized yet
  }
  return 'simple'
}

/**
 * Set the current layout in settings
 */
function setCurrentLayoutName(layoutName: string): void {
  if (!layoutsDefinition[layoutName]) {
    return
  }
  try {
    if (appSettings?.data) {
      appSettings.data.layout = layoutName
    }
  } catch {
    // appSettings not initialized yet
  }
}

/**
 * Load layout component dynamically from layouts-definition
 */
async function loadLayoutComponent(
  layoutName: string,
  forceReload = false
): Promise<Component | null> {
  // Check cache first (unless force reload)
  if (!forceReload && componentCache.has(layoutName)) {
    return componentCache.get(layoutName)!
  }

  // Get layout config
  const config = layoutsDefinition[layoutName]
  if (!config) {
    return null
  }

  try {
    // Load component from layouts-definition (already a Promise)
    const module = await config.component
    const component = module.default

    // Cache the component
    componentCache.set(layoutName, component)
    return component
  } catch (error) {
    console.error(`Failed to load layout "${layoutName}":`, error)
    return null
  }
}

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
  const currentLayoutName = ref<string>(getCurrentLayoutName())
  const layoutComponent = ref<Component | null>(null)
  const isLoading = ref(false)

  /**
   * Get available layouts from the registry
   */
  const availableLayouts = computed<Record<string, LayoutConfig>>(() => {
    return { ...layoutsDefinition }
  })

  /**
   * Get current layout configuration
   */
  const currentLayout = computed<LayoutConfig | undefined>(() => {
    return layoutsDefinition[currentLayoutName.value]
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

    if (!layoutsDefinition[layoutToLoad]) {
      layoutComponent.value = null
      return
    }

    try {
      isLoading.value = true
      const component = await loadLayoutComponent(layoutToLoad, true)
      layoutComponent.value = component
      if (component) {
        currentLayoutName.value = layoutToLoad
      }
    } catch (error) {
      console.error(`Failed to load layout "${layoutToLoad}":`, error)
      layoutComponent.value = null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Switch to a different layout
   */
  async function switchLayout(layoutName: string): Promise<void> {
    if (layoutName === currentLayoutName.value) {
      return
    }

    try {
      // Clear current component first to force re-render
      layoutComponent.value = null

      // Update settings and state
      setCurrentLayoutName(layoutName)
      currentLayoutName.value = layoutName

      // Wait a tick to ensure reactive updates propagate
      await nextTick()

      // Load the new layout
      await loadLayout(layoutName)
    } catch (error) {
      console.error('Failed to switch layout:', error)
      throw error
    }
  }

  // Watch for when appSettings becomes available and load saved layout
  watch(
    () => {
      try {
        return appSettings?.data?.layout
      } catch {
        return null
      }
    },
    (newLayout) => {
      if (newLayout && newLayout !== currentLayoutName.value && layoutsDefinition[newLayout]) {
        currentLayoutName.value = newLayout
        loadLayout(newLayout)
      } else if (!layoutComponent.value) {
        // Load default layout if we haven't loaded any yet
        const savedLayout = getCurrentLayoutName()
        if (savedLayout && savedLayout !== currentLayoutName.value) {
          currentLayoutName.value = savedLayout
          loadLayout(savedLayout)
        } else if (layoutsDefinition[0]) {
          loadLayout('simple')
        }
      }
    },
    { immediate: true }
  )

  return {
    // State
    currentLayoutName,
    currentLayout,
    currentLayoutDisplayName,
    layoutComponent,
    isLoading,
    availableLayouts,

    // Methods
    loadLayout,
    switchLayout
  }
}

/**
 * Clear component cache (useful for hot reloading)
 */
export function clearLayoutCache(): void {
  componentCache.clear()
}
