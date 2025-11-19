/**
 * Layout Module
 *
 * Provides layout management functionality including:
 * - Layout registry and configuration
 * - Dynamic layout loading
 * - Layout switching utilities
 */

export type { LayoutConfig, default as layoutsConfig } from './layouts-definition'
export { clearLayoutCache, useDynamicTuffLayout } from './useDynamicTuffLayout'
// Legacy export for backward compatibility
export { useDynamicTuffLayout as useLayout } from './useDynamicTuffLayout'

export { useSecondaryNavigation } from './useSecondaryNavigation'
