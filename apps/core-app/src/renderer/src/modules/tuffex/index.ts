/**
 * Tuffex Component Library Configuration
 *
 * @description
 * Controlled integration of Tuffex components.
 * Only import and register components that are actually used.
 *
 * Strategy:
 * - Phase 1: Settings pages only (SettingUser, SettingApp, etc.)
 * - Phase 2: New features (prefer Tuffex over Element Plus)
 * - Phase 3: Gradual migration of existing components
 *
 * @see packages/tuffex/README_ZHCN.md for component documentation
 */

import type { App } from 'vue'

/**
 * Components currently enabled for use in the application.
 * Add components here as they are adopted.
 */
const ENABLED_COMPONENTS = [
  // Phase 1: Basic components for Settings pages
  'TxButton',
  'TxAvatar',
  'TxCard',
  'TxSwitch',
  'TxInput',
  'TxSelect'
] as const

export type EnabledComponent = (typeof ENABLED_COMPONENTS)[number]

/**
 * Lazy import of Tuffex components to support tree-shaking.
 * Components are only loaded when actually used.
 */
export async function loadTuffexComponent(name: EnabledComponent) {
  try {
    const tuffex = await import('@talex-touch/tuffex')
    return tuffex[name] || null
  } catch (error) {
    console.warn(`[Tuffex] Failed to load component: ${name}`, error)
    return null
  }
}

/**
 * Register a subset of Tuffex components for controlled integration.
 *
 * @param app - Vue application instance
 * @param components - List of component names to register (defaults to all enabled)
 */
export async function registerTuffexComponents(
  app: App,
  components: EnabledComponent[] = [...ENABLED_COMPONENTS]
) {
  try {
    const tuffex = await import('@talex-touch/tuffex')

    for (const name of components) {
      const component = tuffex[name]
      if (component && typeof component.install === 'function') {
        app.use(component)
      } else if (component) {
        app.component(name, component)
      }
    }

    console.debug(`[Tuffex] Registered ${components.length} components`)
  } catch (error) {
    console.warn('[Tuffex] Failed to register components:', error)
  }
}

/**
 * Check if Tuffex is available (built and installed).
 */
export async function isTuffexAvailable(): Promise<boolean> {
  try {
    await import('@talex-touch/tuffex')
    return true
  } catch {
    return false
  }
}

export { ENABLED_COMPONENTS }
