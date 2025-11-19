import type { Component, ComputedRef, Ref } from 'vue'
import type { LayoutConfig } from './layouts-definition'
import { appSettings } from '@talex-touch/utils/renderer/storage/app-settings'
import { computed, nextTick, ref, watch } from 'vue'
import layoutsDefinition from './layouts-definition'

const componentCache = new Map<string, Component>()

function getCurrentLayoutName(): string {
  const layout = appSettings?.data?.layout
  if (layout && layoutsDefinition[layout]) {
    return layout
  }

  return layoutsDefinition[0].name
}

function setCurrentLayoutName(layoutName: string): void {
  if (!layoutsDefinition[layoutName])
    return
  try {
    appSettings?.data && (appSettings.data.layout = layoutName)
  }
  catch {
    // appSettings not initialized
  }
}

async function loadLayoutComponent(
  layoutName: string,
  forceReload = false,
): Promise<Component | null> {
  if (!forceReload && componentCache.has(layoutName)) {
    return componentCache.get(layoutName)!
  }

  const config = layoutsDefinition[layoutName]
  if (!config)
    return null

  try {
    const module = await config.component
    const component = module.default
    componentCache.set(layoutName, component)
    return component
  }
  catch (error) {
    console.error(`Failed to load layout "${layoutName}":`, error)
    return null
  }
}

/**
 * Composable for managing dynamic layout state and operations
 */
export function useDynamicTuffLayout(): {
  currentLayoutName: Ref<string>
  currentLayout: ComputedRef<LayoutConfig | undefined>
  currentLayoutDisplayName: ComputedRef<string>
  layoutComponent: Ref<Component | null>
  isLoading: Ref<boolean>
  availableLayouts: ComputedRef<Record<string, LayoutConfig>>
  loadLayout: (layoutName?: string) => Promise<void>
  switchLayout: (layoutName: string) => Promise<void>
} {
  const currentLayoutName = ref<string>(getCurrentLayoutName())
  const layoutComponent = ref<Component | null>(null)
  const isLoading = ref(false)

  const availableLayouts = computed<Record<string, LayoutConfig>>(() => ({
    ...layoutsDefinition,
  }))

  const currentLayout = computed<LayoutConfig | undefined>(
    () => layoutsDefinition[currentLayoutName.value],
  )

  const currentLayoutDisplayName = computed(
    () => currentLayout.value?.displayName || currentLayoutName.value,
  )

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
    }
    catch (error) {
      console.error(`Failed to load layout "${layoutToLoad}":`, error)
      layoutComponent.value = null
    }
    finally {
      isLoading.value = false
    }
  }

  async function switchLayout(layoutName: string): Promise<void> {
    if (layoutName === currentLayoutName.value)
      return

    layoutComponent.value = null
    setCurrentLayoutName(layoutName)
    currentLayoutName.value = layoutName
    await nextTick()
    await loadLayout(layoutName)
  }

  watch(
    () => appSettings?.data?.layout,
    (newLayout) => {
      if (newLayout && newLayout !== currentLayoutName.value && layoutsDefinition[newLayout]) {
        currentLayoutName.value = newLayout
        loadLayout(newLayout)
      }
      else if (!layoutComponent.value) {
        currentLayoutName.value = newLayout
        loadLayout(newLayout)
      }
    },
    { immediate: true },
  )

  return {
    currentLayoutName,
    currentLayout,
    currentLayoutDisplayName,
    layoutComponent,
    isLoading,
    availableLayouts,
    loadLayout,
    switchLayout,
  }
}

export function clearLayoutCache(): void {
  componentCache.clear()
}
