/**
 * Layout Module
 *
 * Provides layout management functionality including:
 * - Layout registry and configuration
 * - Dynamic layout loading
 * - Layout switching utilities
 */

export { LayoutManager, type LayoutConfig } from './layout-manager'
export { useDynamicTuffLayout } from './useDynamicTuffLayout'
export { getAppSettings, getAppSettingsSync, initializeAppSettings } from './app-settings-loader'
export type { default as layoutsConfig } from './layouts.json'

// Legacy export for backward compatibility
export { useDynamicTuffLayout as useLayout } from './useDynamicTuffLayout'

