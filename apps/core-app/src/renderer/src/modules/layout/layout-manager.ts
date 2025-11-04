import type { Component } from 'vue'
import layoutsConfig from './layouts.json'
import { getAppSettings, getAppSettingsSync } from './app-settings-loader'

/**
 * Layout configuration interface
 */
export interface LayoutConfig {
  name: string
  displayName: string
  component: string
}

/**
 * Layout registry mapping layout names to their configurations
 */
const layoutsRegistry: Record<string, LayoutConfig> = layoutsConfig as Record<
  string,
  LayoutConfig
>

/**
 * Layout component cache
 */
const componentCache: Map<string, Component> = new Map()

/**
 * Layout Manager
 *
 * Manages layout loading, switching, and configuration.
 * Provides functions to get available layouts, load layout components,
 * and manage the current layout selection.
 */
export class LayoutManager {
  /**
   * Get all available layout configurations
   * @returns Record of layout name to layout config
   */
  static getAvailableLayouts(): Record<string, LayoutConfig> {
    return { ...layoutsRegistry }
  }

  /**
   * Get layout configuration by name
   * @param layoutName - Name of the layout
   * @returns Layout configuration or undefined if not found
   */
  static getLayoutConfig(layoutName: string): LayoutConfig | undefined {
    return layoutsRegistry[layoutName]
  }

  /**
   * Get the current layout name from settings
   * @returns Current layout name, defaults to 'simple'
   */
  static getCurrentLayout(): string {
    try {
      const settings = getAppSettings()
      // Safe access to appSettings, may not be initialized yet
      if (settings?.data?.layout) {
        return settings.data.layout
      }
    } catch (error) {
      // appSettings not initialized yet, use default
      // Silently fail, will be initialized later
    }
    return 'simple'
  }


  /**
   * Set the current layout
   * @param layoutName - Name of the layout to switch to
   */
  static setCurrentLayout(layoutName: string): void {
    if (!layoutsRegistry[layoutName]) {
      console.warn(`[LayoutManager] Layout "${layoutName}" not found, falling back to "simple"`)
      layoutName = 'simple'
    }
    try {
      const settings = getAppSettings()
      // Safe access to appSettings
      if (settings?.data) {
        settings.data.layout = layoutName
      }
    } catch (error) {
      // appSettings not initialized yet, log warning but don't fail
      console.debug('[LayoutManager] Cannot save layout setting yet, appSettings not initialized')
    }
  }

  /**
   * Load layout component dynamically
   * @param layoutName - Name of the layout to load
   * @param forceReload - Force reload even if cached
   * @returns Promise resolving to the layout component
   */
  static async loadLayoutComponent(layoutName: string, forceReload: boolean = false): Promise<Component> {
    // Check cache first (unless force reload)
    if (!forceReload && componentCache.has(layoutName)) {
      console.log('[LayoutManager] Using cached component for:', layoutName)
      return componentCache.get(layoutName)!
    }

    // Get layout config
    const config = this.getLayoutConfig(layoutName)
    if (!config) {
      throw new Error(`[LayoutManager] Layout "${layoutName}" not found in registry`)
    }

    try {
      let component: Component

      // Dynamically import based on layout name
      switch (layoutName) {
        case 'simple':
          component = (await import('~/views/layout/simple/SimpleLayout.vue')).default
          break
        case 'flat':
          component = (await import('~/views/layout/flat/FlatLayout.vue')).default
          break
        default:
          // Fallback to simple layout
          component = (await import('~/views/layout/simple/SimpleLayout.vue')).default
      }

      // Cache the component
      componentCache.set(layoutName, component)

      return component
    } catch (error) {
      console.error(`[LayoutManager] Failed to load layout "${layoutName}":`, error)
      // Fallback to simple layout on error
      const fallback = (await import('~/views/layout/simple/SimpleLayout.vue')).default
      componentCache.set(layoutName, fallback)
      return fallback
    }
  }

  /**
   * Clear component cache (useful for hot reloading)
   */
  static clearCache(): void {
    componentCache.clear()
  }

  /**
   * Check if a layout exists
   * @param layoutName - Name of the layout to check
   * @returns True if layout exists
   */
  static hasLayout(layoutName: string): boolean {
    return layoutName in layoutsRegistry
  }
}

