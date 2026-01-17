/**
 * DivisionBox Shortcut Trigger System
 *
 * Manages global shortcuts for opening DivisionBox instances.
 * Plugins can register shortcuts that trigger their DivisionBox with specific configurations.
 */

import type { DivisionBoxConfig } from '@talex-touch/utils'
import { shortcutModule } from '../global-shortcon'
import { DivisionBoxManager } from './manager'

/**
 * Shortcut mapping configuration
 * Maps a shortcut ID to a DivisionBox configuration
 */
export interface ShortcutMapping {
  /** Unique identifier for this shortcut mapping */
  id: string

  /** Default keyboard accelerator (e.g., 'CommandOrControl+Shift+D') */
  defaultAccelerator: string

  /** DivisionBox configuration to use when triggered */
  config: DivisionBoxConfig

  /** Optional callback to execute before opening */
  beforeOpen?: () => void | boolean | Promise<void | boolean>

  /** Optional callback to execute after opening */
  afterOpen?: (sessionId: string) => void | Promise<void>
}

/**
 * ShortcutTriggerManager
 *
 * Manages shortcut registrations and triggers for DivisionBox instances.
 * Integrates with the global shortcut system to provide keyboard-based access.
 */
export class ShortcutTriggerManager {
  private static instance: ShortcutTriggerManager | null = null

  /** Map of shortcut ID to mapping configuration */
  private mappings: Map<string, ShortcutMapping> = new Map()

  /** Reference to DivisionBoxManager */
  private manager: DivisionBoxManager

  /**
   * Private constructor (singleton pattern)
   */
  private constructor() {
    this.manager = DivisionBoxManager.getInstance()
  }

  /**
   * Gets the singleton instance
   */
  static getInstance(): ShortcutTriggerManager {
    if (!ShortcutTriggerManager.instance) {
      ShortcutTriggerManager.instance = new ShortcutTriggerManager()
    }
    return ShortcutTriggerManager.instance
  }

  /**
   * Registers a shortcut mapping for a DivisionBox
   *
   * @param mapping - Shortcut mapping configuration
   * @returns Success status
   *
   * @example
   * ```typescript
   * shortcutTrigger.registerShortcut({
   *   id: 'plugin.calculator.open',
   *   defaultAccelerator: 'CommandOrControl+Shift+C',
   *   config: {
   *     url: 'plugin://calculator/index.html',
   *     title: 'Calculator',
   *     icon: 'ri:calculator-line',
   *     size: 'compact',
   *     keepAlive: true
   *   }
   * })
   * ```
   */
  registerShortcut(mapping: ShortcutMapping): boolean {
    // Check if shortcut ID already exists
    if (this.mappings.has(mapping.id)) {
      console.warn(`[ShortcutTrigger] Shortcut mapping already exists: ${mapping.id}`)
      return false
    }

    // Register with global shortcut module
    const success = shortcutModule.registerMainShortcut(
      mapping.id,
      mapping.defaultAccelerator,
      () => this.handleTrigger(mapping.id)
    )

    if (!success) {
      console.error(`[ShortcutTrigger] Failed to register shortcut: ${mapping.id}`)
      return false
    }

    // Store mapping
    this.mappings.set(mapping.id, mapping)

    console.log(
      `[ShortcutTrigger] Registered shortcut: ${mapping.id} (${mapping.defaultAccelerator})`
    )
    return true
  }

  /**
   * Unregisters a shortcut mapping
   *
   * @param id - Shortcut mapping ID
   * @returns Success status
   */
  unregisterShortcut(id: string): boolean {
    if (!this.mappings.has(id)) {
      console.warn(`[ShortcutTrigger] Shortcut mapping not found: ${id}`)
      return false
    }

    // Remove mapping
    this.mappings.delete(id)

    // Note: Global shortcut module doesn't provide unregister for individual shortcuts
    // The shortcut will remain registered but won't have a mapping

    console.log(`[ShortcutTrigger] Unregistered shortcut: ${id}`)
    return true
  }

  /**
   * Gets a shortcut mapping by ID
   *
   * @param id - Shortcut mapping ID
   * @returns Shortcut mapping or undefined
   */
  getMapping(id: string): ShortcutMapping | undefined {
    return this.mappings.get(id)
  }

  /**
   * Gets all registered shortcut mappings
   *
   * @returns Array of shortcut mappings
   */
  getAllMappings(): ShortcutMapping[] {
    return Array.from(this.mappings.values())
  }

  /**
   * Handles shortcut trigger
   *
   * Called when a registered shortcut is pressed.
   * Executes beforeOpen callback, creates DivisionBox session, and executes afterOpen callback.
   *
   * @param id - Shortcut mapping ID
   */
  private async handleTrigger(id: string): Promise<void> {
    const mapping = this.mappings.get(id)

    if (!mapping) {
      console.error(`[ShortcutTrigger] No mapping found for shortcut: ${id}`)
      return
    }

    try {
      console.log(`[ShortcutTrigger] Shortcut triggered: ${id}`)

      // Execute beforeOpen callback if provided
      if (mapping.beforeOpen) {
        const result = await mapping.beforeOpen()
        if (result === false) {
          console.log(`[ShortcutTrigger] beforeOpen cancelled opening: ${id}`)
          return
        }
      }

      // Create DivisionBox session
      const session = await this.manager.createSession(mapping.config)

      console.log(`[ShortcutTrigger] DivisionBox opened: ${session.sessionId}`)

      // Execute afterOpen callback if provided
      if (mapping.afterOpen) {
        await mapping.afterOpen(session.sessionId)
      }
    } catch (error) {
      console.error(`[ShortcutTrigger] Error handling shortcut trigger for ${id}:`, error)
    }
  }

  /**
   * Registers a shortcut for a plugin's DivisionBox
   *
   * Convenience method for plugins to register shortcuts with plugin-specific defaults.
   *
   * @param pluginId - Plugin identifier
   * @param accelerator - Keyboard accelerator
   * @param config - DivisionBox configuration
   * @returns Success status
   *
   * @example
   * ```typescript
   * shortcutTrigger.registerPluginShortcut(
   *   'my-plugin',
   *   'CommandOrControl+Shift+M',
   *   {
   *     url: 'plugin://my-plugin/index.html',
   *     title: 'My Plugin',
   *     size: 'medium'
   *   }
   * )
   * ```
   */
  registerPluginShortcut(
    pluginId: string,
    accelerator: string,
    config: DivisionBoxConfig
  ): boolean {
    const shortcutId = `plugin.${pluginId}.division-box`

    return this.registerShortcut({
      id: shortcutId,
      defaultAccelerator: accelerator,
      config: {
        ...config,
        pluginId
      }
    })
  }

  /**
   * Clears all shortcut mappings
   *
   * Used for cleanup during shutdown or testing.
   */
  clear(): void {
    this.mappings.clear()
    console.log('[ShortcutTrigger] All shortcut mappings cleared')
  }
}

/**
 * Singleton instance export
 */
export const shortcutTriggerManager = ShortcutTriggerManager.getInstance()
