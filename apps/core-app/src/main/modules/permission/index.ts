/**
 * Permission Module
 *
 * Manages plugin permissions with persistent storage.
 */

import type { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import {
  PermissionCategory,
  permissionRegistry,
  PermissionRiskLevel
} from '@talex-touch/utils/permission'
import { getTuffTransportMain, PermissionEvents } from '@talex-touch/utils/transport/main'
import { PermissionGrantedEvent, TalexEvents, touchEventBus } from '../../core/eventbus/touch-event'
import { createLogger } from '../../utils/logger'
import { BaseModule } from '../abstract-base-module'
import { PermissionGuard } from './permission-guard'
import { PermissionStore } from './permission-store'

const permLog = createLogger('Permission')
const SHORTCUT_PERMISSION_ID = 'system.shortcut'
const resolveKeyManager = (channel: unknown): unknown =>
  (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel

export { createProtectedRegister, registerProtectedChannels, withPermission } from './channel-guard'
export type { ProtectedChannelDefinition, ProtectedChannelOptions } from './channel-guard'
export { PermissionGuard } from './permission-guard'
export type { ApiPermissionMapping, PermissionCheckResult } from './permission-guard'

/**
 * PermissionModule - Plugin permission management
 *
 * Features:
 * - Persistent permission storage (JSON file)
 * - IPC channels for renderer queries
 * - Plugin permission status calculation
 * - Audit logging
 */
export class PermissionModule extends BaseModule {
  static key: symbol = Symbol.for('Permission')
  name: ModuleKey = PermissionModule.key

  private store!: PermissionStore
  private guard!: PermissionGuard
  private transport: ReturnType<typeof getTuffTransportMain> | null = null

  constructor() {
    super(PermissionModule.key, {
      create: true,
      dirName: 'permission'
    })
  }

  onInit({ file }: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    // Initialize permission store
    this.store = new PermissionStore(file.dirPath!)

    // Initialize permission guard
    this.guard = new PermissionGuard(this.store)

    if (!permissionRegistry.has(SHORTCUT_PERMISSION_ID)) {
      permissionRegistry.register({
        id: SHORTCUT_PERMISSION_ID,
        nameKey: 'permission.system.shortcut.name',
        descKey: 'permission.system.shortcut.desc',
        category: PermissionCategory.SYSTEM,
        risk: PermissionRiskLevel.MEDIUM,
        icon: 'Keyboard'
      })
    }

    // Register IPC channels
    if ($app.channel) {
      const keyManager = resolveKeyManager($app.channel)
      this.transport = getTuffTransportMain($app.channel, keyManager)
    }
    this.registerChannels()

    // Set global reference
    setPermissionModule(this)

    permLog.success('Permission module initialized')
  }

  private registerChannels(): void {
    const transport = this.transport
    if (!transport) return

    // Get all permissions for a plugin
    transport.on(PermissionEvents.api.getPlugin, async (payload) => {
      if (!payload?.pluginId) return []
      return this.store.getPluginPermissions(payload.pluginId)
    })

    // Get permission status for a plugin
    transport.on(PermissionEvents.api.getStatus, async (payload) => {
      if (!payload?.pluginId) return null
      return this.store.getPluginPermissionStatus(payload.pluginId, payload.sdkapi, {
        required: payload.required || [],
        optional: payload.optional || []
      })
    })

    // Grant permission
    transport.on(PermissionEvents.api.grant, async (payload) => {
      if (!payload?.pluginId || !payload?.permissionId) return { success: false }
      await this.store.grant(payload.pluginId, payload.permissionId, payload.grantedBy || 'user')
      this.broadcastUpdate(payload.pluginId)
      return { success: true }
    })

    // Revoke permission
    transport.on(PermissionEvents.api.revoke, async (payload) => {
      if (!payload?.pluginId || !payload?.permissionId) return { success: false }
      await this.store.revoke(payload.pluginId, payload.permissionId)
      this.broadcastUpdate(payload.pluginId)
      return { success: true }
    })

    // Grant multiple permissions at once
    transport.on(PermissionEvents.api.grantMultiple, async (payload) => {
      if (!payload?.pluginId || !payload?.permissionIds) return { success: false }
      for (const permissionId of payload.permissionIds) {
        await this.store.grant(payload.pluginId, permissionId, payload.grantedBy || 'user')
      }
      this.broadcastUpdate(payload.pluginId)

      // Notify plugin module to retry enabling the plugin
      touchEventBus.emit(
        TalexEvents.PERMISSION_GRANTED,
        new PermissionGrantedEvent(payload.pluginId)
      )

      return { success: true }
    })

    // Grant session-only permissions (memory only, not persisted)
    transport.on(PermissionEvents.api.grantSession, async (payload) => {
      if (!payload?.pluginId || !payload?.permissionIds) return { success: false }
      this.store.grantSessionMultiple(payload.pluginId, payload.permissionIds)
      this.broadcastUpdate(payload.pluginId)

      // Notify plugin module to retry enabling the plugin
      touchEventBus.emit(
        TalexEvents.PERMISSION_GRANTED,
        new PermissionGrantedEvent(payload.pluginId)
      )

      return { success: true }
    })

    // Revoke all permissions for a plugin
    transport.on(PermissionEvents.api.revokeAll, async (payload) => {
      if (!payload?.pluginId) return { success: false }
      await this.store.revokeAll(payload.pluginId)
      this.broadcastUpdate(payload.pluginId)
      return { success: true }
    })

    // Check if plugin has specific permission
    transport.on(PermissionEvents.api.check, async (payload) => {
      if (!payload?.pluginId || !payload?.permissionId) return false
      return this.store.hasPermission(payload.pluginId, payload.permissionId, payload.sdkapi)
    })

    // Get all plugin permission statuses
    transport.on(PermissionEvents.api.getAll, async () => {
      return this.store.getAllPluginPermissions()
    })

    // Get permission registry
    transport.on(PermissionEvents.api.getRegistry, async () => {
      const { permissionRegistry } = await import('@talex-touch/utils/permission')
      return permissionRegistry.all()
    })

    // Get audit logs
    transport.on(PermissionEvents.api.getAuditLogs, async (payload) => {
      return this.store.getAuditLogs({
        pluginId: payload?.pluginId,
        action: payload?.action,
        limit: payload?.limit || 50,
        offset: payload?.offset || 0
      })
    })

    // Clear audit logs
    transport.on(PermissionEvents.api.clearAuditLogs, async () => {
      this.store.clearAuditLogs()
      return { success: true }
    })

    // Get performance statistics (Phase 5 verification)
    transport.on(PermissionEvents.api.getPerformance, async () => {
      return this.guard.getPerformanceStats()
    })

    // Reset performance statistics
    transport.on(PermissionEvents.api.resetPerformance, async () => {
      this.guard.resetPerformanceStats()
      return { success: true }
    })
  }

  /**
   * Broadcast permission update to all renderer windows
   */
  private broadcastUpdate(pluginId: string): void {
    const transport =
      this.transport ??
      ($app.channel ? getTuffTransportMain($app.channel, resolveKeyManager($app.channel)) : null)

    transport?.broadcast(PermissionEvents.push.updated, { pluginId })
  }

  /**
   * Get permission store instance (for use by other modules)
   */
  getStore(): PermissionStore {
    return this.store
  }

  /**
   * Get permission guard instance (for use by other modules)
   */
  getGuard(): PermissionGuard {
    return this.guard
  }

  /**
   * Check permission for plugin API call
   */
  checkPermission(pluginId: string, apiName: string, sdkapi?: number) {
    return this.guard.check(pluginId, apiName, sdkapi)
  }

  /**
   * Enforce permission - throws if denied
   */
  enforcePermission(pluginId: string, apiName: string, sdkapi?: number) {
    return this.guard.enforce(pluginId, apiName, sdkapi)
  }

  /**
   * Get missing permissions for a plugin (for startup confirmation)
   */
  getMissingPermissions(
    pluginId: string,
    sdkapi: number | undefined,
    declared: { required: string[]; optional: string[] }
  ): { required: string[]; optional: string[] } {
    const status = this.store.getPluginPermissionStatus(pluginId, sdkapi, declared)
    return {
      required: status.missingRequired,
      optional: declared.optional.filter((p) => !status.granted.includes(p))
    }
  }

  /**
   * Grant all permissions for a plugin
   */
  async grantAll(
    pluginId: string,
    permissions: string[],
    grantedBy: 'user' | 'auto' | 'trust' = 'user'
  ): Promise<void> {
    for (const permissionId of permissions) {
      await this.store.grant(pluginId, permissionId, grantedBy)
    }
    this.broadcastUpdate(pluginId)
  }

  /**
   * Check if plugin needs permission confirmation (for startup)
   */
  needsPermissionConfirmation(
    pluginId: string,
    sdkapi: number | undefined,
    declared: { required: string[]; optional: string[] }
  ): boolean {
    const status = this.store.getPluginPermissionStatus(pluginId, sdkapi, declared)
    // Only ask for confirmation if:
    // 1. Plugin enforces permissions (sdkapi >= 251212)
    // 2. Has missing required permissions
    return status.enforcePermissions && status.missingRequired.length > 0
  }

  /**
   * Get performance statistics for permission checks
   */
  getPerformanceStats() {
    return this.guard.getPerformanceStats()
  }

  onDestroy(): MaybePromise<void> {
    // Log final performance stats
    const stats = this.guard.getPerformanceStats()
    if (stats.totalChecks > 0) {
      permLog.info(
        `Performance: ${stats.totalChecks} checks, avg ${stats.avgDurationMs}ms, max ${stats.maxDurationMs}ms, target met: ${stats.meetsTarget}`
      )
    }
    // Save any pending changes
    this.store.save()
    permLog.info('Permission module destroyed')
  }
}

// Export singleton getter
let permissionModule: PermissionModule | null = null

export function getPermissionModule(): PermissionModule | null {
  return permissionModule
}

export function setPermissionModule(module: PermissionModule): void {
  permissionModule = module
}
