/**
 * Layout Module
 *
 * Provides layout management functionality including:
 * - Layout registry and configuration
 * - Dynamic layout loading
 * - Layout switching utilities
 */

export { useDynamicTuffLayout, clearLayoutCache } from './useDynamicTuffLayout'
export type { LayoutConfig, default as layoutsConfig } from './layouts-definition'
export { useSecondaryNavigation } from './useSecondaryNavigation'

// Legacy export for backward compatibility
export { useDynamicTuffLayout as useLayout } from './useDynamicTuffLayout'
