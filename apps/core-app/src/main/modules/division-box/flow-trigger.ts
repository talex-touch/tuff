/**
 * DivisionBox Flow Trigger System
 *
 * Integrates DivisionBox with the Flow Transfer system.
 * Allows DivisionBox instances to be opened as Flow targets.
 *
 * Note: This is a forward-compatible implementation. The Flow Transfer system
 * is not yet fully implemented, but this module provides the interface for
 * future integration.
 */

import type { DivisionBoxConfig } from '@talex-touch/utils'
import { DivisionBoxManager } from './manager'

/**
 * Flow payload types supported by DivisionBox
 */
export type FlowPayloadType = 'text' | 'file' | 'json' | 'custom'

/**
 * Flow payload structure
 *
 * Represents data being transferred through the Flow system.
 */
export interface FlowPayload {
  /** Type of the payload */
  type: FlowPayloadType

  /** Payload data */
  data: any

  /** Optional context metadata */
  context?: Record<string, any>
}

/**
 * Flow target configuration for DivisionBox
 *
 * Defines how a DivisionBox can receive Flow payloads.
 */
export interface FlowTargetConfig {
  /** Unique identifier for this flow target */
  id: string

  /** Display name */
  name: string

  /** Description of what this target does */
  description: string

  /** Supported payload types */
  supportedTypes: FlowPayloadType[]

  /** DivisionBox configuration to use when triggered */
  divisionBoxConfig: DivisionBoxConfig

  /** Optional handler to process the payload before opening */
  onReceive?: (payload: FlowPayload) => Promise<void> | void

  /** Optional handler to modify the URL based on payload */
  urlBuilder?: (baseUrl: string, payload: FlowPayload) => string
}

/**
 * FlowTriggerManager
 *
 * Manages Flow target registrations for DivisionBox.
 * Handles incoming Flow payloads and opens appropriate DivisionBox instances.
 */
export class FlowTriggerManager {
  private static instance: FlowTriggerManager | null = null

  /** Map of flow target ID to configuration */
  private targets: Map<string, FlowTargetConfig> = new Map()

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
  static getInstance(): FlowTriggerManager {
    if (!FlowTriggerManager.instance) {
      FlowTriggerManager.instance = new FlowTriggerManager()
    }
    return FlowTriggerManager.instance
  }

  /**
   * Registers a Flow target for DivisionBox
   *
   * @param config - Flow target configuration
   * @returns Success status
   *
   * @example
   * ```typescript
   * flowTrigger.registerTarget({
   *   id: 'plugin.notes.quick-capture',
   *   name: 'Quick Capture',
   *   description: 'Quickly save text as a note',
   *   supportedTypes: ['text', 'json'],
   *   divisionBoxConfig: {
   *     url: 'plugin://notes/capture.html',
   *     title: 'Quick Capture',
   *     size: 'medium'
   *   },
   *   urlBuilder: (baseUrl, payload) => {
   *     if (payload.type === 'text') {
   *       return `${baseUrl}?text=${encodeURIComponent(payload.data)}`
   *     }
   *     return baseUrl
   *   }
   * })
   * ```
   */
  registerTarget(config: FlowTargetConfig): boolean {
    // Check if target ID already exists
    if (this.targets.has(config.id)) {
      console.warn(`[FlowTrigger] Flow target already exists: ${config.id}`)
      return false
    }

    // Validate configuration
    if (!config.id || !config.name || !config.supportedTypes.length) {
      console.error('[FlowTrigger] Invalid flow target configuration')
      return false
    }

    // Store target configuration
    this.targets.set(config.id, config)

    console.log(`[FlowTrigger] Registered flow target: ${config.id}`)
    return true
  }

  /**
   * Unregisters a Flow target
   *
   * @param targetId - Flow target ID
   * @returns Success status
   */
  unregisterTarget(targetId: string): boolean {
    if (!this.targets.has(targetId)) {
      console.warn(`[FlowTrigger] Flow target not found: ${targetId}`)
      return false
    }

    this.targets.delete(targetId)

    console.log(`[FlowTrigger] Unregistered flow target: ${targetId}`)
    return true
  }

  /**
   * Gets a Flow target by ID
   *
   * @param targetId - Flow target ID
   * @returns Flow target configuration or undefined
   */
  getTarget(targetId: string): FlowTargetConfig | undefined {
    return this.targets.get(targetId)
  }

  /**
   * Gets all registered Flow targets
   *
   * @returns Array of flow target configurations
   */
  getAllTargets(): FlowTargetConfig[] {
    return Array.from(this.targets.values())
  }

  /**
   * Gets Flow targets that support a specific payload type
   *
   * @param payloadType - Payload type to filter by
   * @returns Array of matching flow target configurations
   */
  getTargetsByPayloadType(payloadType: FlowPayloadType): FlowTargetConfig[] {
    return Array.from(this.targets.values()).filter((target) =>
      target.supportedTypes.includes(payloadType)
    )
  }

  /**
   * Handles an incoming Flow payload
   *
   * Opens a DivisionBox instance configured for the target.
   *
   * @param targetId - Flow target ID
   * @param payload - Flow payload data
   * @returns Session ID of the opened DivisionBox
   *
   * @example
   * ```typescript
   * const sessionId = await flowTrigger.handleFlow(
   *   'plugin.notes.quick-capture',
   *   {
   *     type: 'text',
   *     data: 'This is a note to save',
   *     context: { source: 'clipboard' }
   *   }
   * )
   * ```
   */
  async handleFlow(targetId: string, payload: FlowPayload): Promise<string> {
    const target = this.targets.get(targetId)

    if (!target) {
      throw new Error(`Flow target not found: ${targetId}`)
    }

    // Validate payload type
    if (!target.supportedTypes.includes(payload.type)) {
      throw new Error(`Flow target ${targetId} does not support payload type: ${payload.type}`)
    }

    console.log(`[FlowTrigger] Handling flow for target: ${targetId}`)

    // Execute onReceive handler if provided
    if (target.onReceive) {
      await target.onReceive(payload)
    }

    // Build URL with payload data if urlBuilder is provided
    let url = target.divisionBoxConfig.url
    if (target.urlBuilder) {
      url = target.urlBuilder(url, payload)
    }

    // Create DivisionBox configuration with modified URL
    const config: DivisionBoxConfig = {
      ...target.divisionBoxConfig,
      url
    }

    // Create DivisionBox session
    const session = await this.manager.createSession(config)

    console.log(`[FlowTrigger] DivisionBox opened for flow: ${session.sessionId}`)

    return session.sessionId
  }

  /**
   * Registers a plugin's Flow targets from manifest configuration
   *
   * Convenience method for plugins to register multiple Flow targets at once.
   *
   * @param pluginId - Plugin identifier
   * @param flowTargets - Array of flow target configurations from manifest
   * @returns Number of successfully registered targets
   *
   * @example
   * ```typescript
   * // From plugin manifest:
   * // "flowTargets": [
   * //   {
   * //     "id": "quick-capture",
   * //     "name": "Quick Capture",
   * //     "supportedTypes": ["text"]
   * //   }
   * // ]
   *
   * flowTrigger.registerPluginTargets('my-plugin', manifest.flowTargets)
   * ```
   */
  registerPluginTargets(
    pluginId: string,
    flowTargets: Array<{
      id: string
      name: string
      description?: string
      supportedTypes: FlowPayloadType[]
      divisionBoxUrl?: string
    }>
  ): number {
    let successCount = 0

    for (const target of flowTargets) {
      const fullTargetId = `plugin.${pluginId}.${target.id}`

      const success = this.registerTarget({
        id: fullTargetId,
        name: target.name,
        description: target.description || '',
        supportedTypes: target.supportedTypes,
        divisionBoxConfig: {
          url: target.divisionBoxUrl || `plugin://${pluginId}/index.html`,
          title: target.name,
          pluginId,
          size: 'medium'
        }
      })

      if (success) {
        successCount++
      }
    }

    console.log(
      `[FlowTrigger] Registered ${successCount}/${flowTargets.length} flow targets for plugin: ${pluginId}`
    )

    return successCount
  }

  /**
   * Clears all Flow targets
   *
   * Used for cleanup during shutdown or testing.
   */
  clear(): void {
    this.targets.clear()
    console.log('[FlowTrigger] All flow targets cleared')
  }
}

/**
 * Singleton instance export
 */
export const flowTriggerManager = FlowTriggerManager.getInstance()
