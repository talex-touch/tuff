/**
 * Flow Target Registry
 *
 * Manages registration and discovery of Flow targets from plugins.
 */

import type {
  FlowTarget,
  FlowTargetInfo,
  FlowPayloadType
} from '@talex-touch/utils'

/**
 * Internal target entry with plugin metadata
 */
interface TargetEntry {
  target: FlowTarget
  pluginId: string
  pluginName?: string
  pluginIcon?: string
  isEnabled: boolean
  hasFlowHandler: boolean
  isNativeShare?: boolean
  usageCount: number
  lastUsed?: number
}

/**
 * FlowTargetRegistry
 *
 * Singleton registry for all Flow targets.
 * Handles target registration, discovery, and filtering.
 */
export class FlowTargetRegistry {
  private static instance: FlowTargetRegistry | null = null

  /** Map of full target ID to entry */
  private targets: Map<string, TargetEntry> = new Map()

  /** Map of plugin ID to target IDs */
  private pluginTargets: Map<string, Set<string>> = new Map()

  private constructor() {}

  static getInstance(): FlowTargetRegistry {
    if (!FlowTargetRegistry.instance) {
      FlowTargetRegistry.instance = new FlowTargetRegistry()
    }
    return FlowTargetRegistry.instance
  }

  /**
   * Generates full target ID from plugin ID and target ID
   */
  private getFullTargetId(pluginId: string, targetId: string): string {
    return `${pluginId}.${targetId}`
  }

  /**
   * Registers a Flow target from a plugin
   */
  registerTarget(
    pluginId: string,
    target: FlowTarget,
    options?: {
      pluginName?: string
      pluginIcon?: string
      isEnabled?: boolean
      hasFlowHandler?: boolean
      isNativeShare?: boolean
    }
  ): boolean {
    const fullId = this.getFullTargetId(pluginId, target.id)

    if (this.targets.has(fullId)) {
      console.warn(`[FlowTargetRegistry] Target already registered: ${fullId}`)
      return false
    }

    // Validate target
    if (!target.id || !target.name || !target.supportedTypes?.length) {
      console.error(`[FlowTargetRegistry] Invalid target configuration: ${fullId}`)
      return false
    }

    const entry: TargetEntry = {
      target,
      pluginId,
      pluginName: options?.pluginName,
      pluginIcon: options?.pluginIcon,
      isEnabled: options?.isEnabled ?? true,
      hasFlowHandler: options?.hasFlowHandler ?? false,
      isNativeShare: options?.isNativeShare ?? false,
      usageCount: 0
    }

    this.targets.set(fullId, entry)

    // Track plugin's targets
    if (!this.pluginTargets.has(pluginId)) {
      this.pluginTargets.set(pluginId, new Set())
    }
    this.pluginTargets.get(pluginId)!.add(fullId)

    console.log(`[FlowTargetRegistry] Registered target: ${fullId}`)
    return true
  }

  /**
   * Registers multiple targets from a plugin
   */
  registerPluginTargets(
    pluginId: string,
    targets: FlowTarget[],
    options?: {
      pluginName?: string
      pluginIcon?: string
      isEnabled?: boolean
      hasFlowHandler?: boolean
    }
  ): number {
    let count = 0
    for (const target of targets) {
      if (this.registerTarget(pluginId, target, options)) {
        count++
      }
    }
    console.log(`[FlowTargetRegistry] Registered ${count}/${targets.length} targets for plugin: ${pluginId}`)
    return count
  }

  /**
   * Unregisters a Flow target
   */
  unregisterTarget(fullTargetId: string): boolean {
    const entry = this.targets.get(fullTargetId)
    if (!entry) {
      return false
    }

    this.targets.delete(fullTargetId)

    // Remove from plugin tracking
    const pluginTargetSet = this.pluginTargets.get(entry.pluginId)
    if (pluginTargetSet) {
      pluginTargetSet.delete(fullTargetId)
      if (pluginTargetSet.size === 0) {
        this.pluginTargets.delete(entry.pluginId)
      }
    }

    console.log(`[FlowTargetRegistry] Unregistered target: ${fullTargetId}`)
    return true
  }

  /**
   * Unregisters all targets from a plugin
   */
  unregisterPluginTargets(pluginId: string): number {
    const targetIds = this.pluginTargets.get(pluginId)
    if (!targetIds) {
      return 0
    }

    let count = 0
    for (const targetId of targetIds) {
      if (this.targets.delete(targetId)) {
        count++
      }
    }

    this.pluginTargets.delete(pluginId)
    console.log(`[FlowTargetRegistry] Unregistered ${count} targets for plugin: ${pluginId}`)
    return count
  }

  /**
   * Gets a target by full ID
   */
  getTarget(fullTargetId: string): FlowTargetInfo | undefined {
    const entry = this.targets.get(fullTargetId)
    if (!entry) return undefined

    return this.entryToInfo(fullTargetId, entry)
  }

  /**
   * Gets all registered targets
   */
  getAllTargets(): FlowTargetInfo[] {
    const result: FlowTargetInfo[] = []
    for (const [fullId, entry] of this.targets) {
      result.push(this.entryToInfo(fullId, entry))
    }
    return result
  }

  /**
   * Gets targets that support a specific payload type
   */
  getTargetsByPayloadType(payloadType: FlowPayloadType): FlowTargetInfo[] {
    const result: FlowTargetInfo[] = []
    for (const [fullId, entry] of this.targets) {
      if (entry.target.supportedTypes.includes(payloadType)) {
        result.push(this.entryToInfo(fullId, entry))
      }
    }
    return result
  }

  /**
   * Gets enabled targets only
   */
  getEnabledTargets(): FlowTargetInfo[] {
    const result: FlowTargetInfo[] = []
    for (const [fullId, entry] of this.targets) {
      if (entry.isEnabled) {
        result.push(this.entryToInfo(fullId, entry))
      }
    }
    return result
  }

  /**
   * Updates plugin enabled state
   */
  setPluginEnabled(pluginId: string, enabled: boolean): void {
    const targetIds = this.pluginTargets.get(pluginId)
    if (!targetIds) return

    for (const targetId of targetIds) {
      const entry = this.targets.get(targetId)
      if (entry) {
        entry.isEnabled = enabled
      }
    }
  }

  /**
   * Records target usage
   */
  recordUsage(fullTargetId: string): void {
    const entry = this.targets.get(fullTargetId)
    if (entry) {
      entry.usageCount++
      entry.lastUsed = Date.now()
    }
  }

  /**
   * Converts internal entry to public FlowTargetInfo
   */
  private entryToInfo(fullId: string, entry: TargetEntry): FlowTargetInfo {
    return {
      ...entry.target,
      fullId,
      pluginId: entry.pluginId,
      pluginName: entry.pluginName,
      pluginIcon: entry.pluginIcon,
      isEnabled: entry.isEnabled,
      hasFlowHandler: entry.hasFlowHandler,
      isNativeShare: entry.isNativeShare,
      adaptationHint: entry.hasFlowHandler ? undefined : '该插件尚未适配 Flow Transfer',
      usageCount: entry.usageCount,
      lastUsed: entry.lastUsed
    }
  }

  /**
   * Updates plugin's flow handler status
   */
  setPluginFlowHandler(pluginId: string, hasHandler: boolean): void {
    const targetIds = this.pluginTargets.get(pluginId)
    if (!targetIds) return

    for (const targetId of targetIds) {
      const entry = this.targets.get(targetId)
      if (entry) {
        entry.hasFlowHandler = hasHandler
      }
    }
    console.log(`[FlowTargetRegistry] Plugin ${pluginId} flow handler: ${hasHandler}`)
  }

  /**
   * Gets targets sorted by adaptation status
   * Adapted plugins first, then unadapted plugins at the end
   */
  getTargetsSortedByAdaptation(payloadType?: FlowPayloadType): FlowTargetInfo[] {
    let targets = payloadType
      ? this.getTargetsByPayloadType(payloadType)
      : this.getAllTargets()

    // Sort: native share first, then adapted, then unadapted
    return targets.sort((a, b) => {
      // Native share always first
      if (a.isNativeShare && !b.isNativeShare) return -1
      if (!a.isNativeShare && b.isNativeShare) return 1

      // Adapted plugins before unadapted
      if (a.hasFlowHandler && !b.hasFlowHandler) return -1
      if (!a.hasFlowHandler && b.hasFlowHandler) return 1

      // Then by usage count
      return (b.usageCount ?? 0) - (a.usageCount ?? 0)
    })
  }

  /**
   * Clears all targets
   */
  clear(): void {
    this.targets.clear()
    this.pluginTargets.clear()
    console.log('[FlowTargetRegistry] All targets cleared')
  }
}

export const flowTargetRegistry = FlowTargetRegistry.getInstance()
