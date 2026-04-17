/**
 * DivisionBox Shortcut Trigger System
 *
 * Manages global shortcuts for opening DivisionBox instances.
 * Plugins can register shortcuts that trigger their DivisionBox with specific configurations.
 */

import type { DivisionBoxConfig } from '@talex-touch/utils'
import { shortcutModule } from '../global-shortcon'
import { divisionBoxShortcutLog } from './logger'
import { DivisionBoxManager } from './manager'

const DIVISION_BOX_SHORTCUT_OWNER = 'module.division-box.shortcut-trigger'

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
      divisionBoxShortcutLog.warn('Shortcut mapping already exists', {
        meta: { shortcutId: mapping.id }
      })
      return false
    }

    // Register with global shortcut module
    const success = shortcutModule.registerMainShortcut(
      mapping.id,
      mapping.defaultAccelerator,
      () => this.handleTrigger(mapping.id),
      { owner: DIVISION_BOX_SHORTCUT_OWNER }
    )

    if (!success) {
      divisionBoxShortcutLog.error('Failed to register shortcut', {
        meta: { shortcutId: mapping.id, accelerator: mapping.defaultAccelerator }
      })
      return false
    }

    // Store mapping
    this.mappings.set(mapping.id, mapping)

    divisionBoxShortcutLog.info('Registered shortcut', {
      meta: { shortcutId: mapping.id, accelerator: mapping.defaultAccelerator }
    })
    return true
  }

  /**
   * Unregisters a shortcut mapping
   *
   * @param id - Shortcut mapping ID
   * @returns Success status
   */
  unregisterShortcut(id: string): boolean {
    const mappingRemoved = this.mappings.delete(id)
    const shortcutRemoved = shortcutModule.unregisterMainShortcut(id)
    if (!mappingRemoved && !shortcutRemoved) {
      divisionBoxShortcutLog.warn('Shortcut mapping not found during unregister', {
        meta: { shortcutId: id }
      })
      return false
    }
    divisionBoxShortcutLog.info('Unregistered shortcut', { meta: { shortcutId: id } })
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
      divisionBoxShortcutLog.error('Shortcut mapping missing on trigger', {
        meta: { shortcutId: id }
      })
      return
    }

    try {
      divisionBoxShortcutLog.info('Shortcut triggered', { meta: { shortcutId: id } })

      // Execute beforeOpen callback if provided
      if (mapping.beforeOpen) {
        const result = await mapping.beforeOpen()
        if (result === false) {
          divisionBoxShortcutLog.info('Shortcut opening cancelled by beforeOpen', {
            meta: { shortcutId: id }
          })
          return
        }
      }

      // Create DivisionBox session
      const session = await this.manager.createSession(mapping.config)

      divisionBoxShortcutLog.info('DivisionBox opened from shortcut', {
        meta: { shortcutId: id, sessionId: session.sessionId }
      })

      // Execute afterOpen callback if provided
      if (mapping.afterOpen) {
        await mapping.afterOpen(session.sessionId)
      }
    } catch (error) {
      divisionBoxShortcutLog.error('Failed to handle shortcut trigger', {
        meta: { shortcutId: id },
        error
      })
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
    const ids = Array.from(this.mappings.keys())
    for (const id of ids) {
      shortcutModule.unregisterMainShortcut(id)
    }
    this.mappings.clear()
    divisionBoxShortcutLog.info('Cleared all shortcut mappings')
  }
}

/**
 * Singleton instance export
 */
export const shortcutTriggerManager = ShortcutTriggerManager.getInstance()
