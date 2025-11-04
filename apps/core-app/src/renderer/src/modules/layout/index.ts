/**
 * Layout Module
 *
 * Provides layout management functionality including:
 * - Layout registry and configuration
 * - Dynamic layout loading
 * - Layout switching utilities
 */

export { useDynamicTuffLayout, clearLayoutCache, type LayoutConfig } from './useDynamicTuffLayout'
export type { default as layoutsConfig } from './layouts-definition'

// Legacy export for backward compatibility
export { useDynamicTuffLayout as useLayout } from './useDynamicTuffLayout'

