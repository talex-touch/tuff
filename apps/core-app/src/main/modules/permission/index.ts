/**
 * Permission Module
 *
 * Manages plugin permissions with persistent storage.
 */

import type { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { ChannelType } from '@talex-touch/utils/channel'
import { BrowserWindow } from 'electron'
import { BaseModule } from '../abstract-base-module'
import { PermissionStore } from './permission-store'
import { PermissionGuard } from './permission-guard'

export { PermissionGuard } from './permission-guard'
export type { PermissionCheckResult, ApiPermissionMapping } from './permission-guard'
export { withPermission, createProtectedRegister, registerProtectedChannels } from './channel-guard'
export type { ProtectedChannelOptions, ProtectedChannelDefinition } from './channel-guard'

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

  constructor() {
    super(PermissionModule.key, {
      create: true,
      dirName: 'permission',
    })
  }

  onInit({ file }: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    // Initialize permission store
    this.store = new PermissionStore(file.dirPath!)

    // Initialize permission guard
    this.guard = new PermissionGuard(this.store)

    // Register IPC channels
    this.registerChannels()

    // Set global reference
    setPermissionModule(this)

    console.info('[PermissionModule] Initialized')
  }

  private registerChannels(): void {
    const channel = $app.channel

    // Get all permissions for a plugin
    channel.regChannel(ChannelType.MAIN, 'permission:get-plugin', async ({ data }) => {
      if (!data?.pluginId) return []
      return this.store.getPluginPermissions(data.pluginId)
    })

    // Get permission status for a plugin
    channel.regChannel(ChannelType.MAIN, 'permission:get-status', async ({ data }) => {
      if (!data?.pluginId) return null
      return this.store.getPluginPermissionStatus(
        data.pluginId,
        data.sdkapi,
        { required: data.required || [], optional: data.optional || [] }
      )
    })

    // Grant permission
    channel.regChannel(ChannelType.MAIN, 'permission:grant', async ({ data }) => {
      if (!data?.pluginId || !data?.permissionId) return { success: false }
      await this.store.grant(data.pluginId, data.permissionId, data.grantedBy || 'user')
      this.broadcastUpdate(data.pluginId)
      return { success: true }
    })

    // Revoke permission
    channel.regChannel(ChannelType.MAIN, 'permission:revoke', async ({ data }) => {
      if (!data?.pluginId || !data?.permissionId) return { success: false }
      await this.store.revoke(data.pluginId, data.permissionId)
      this.broadcastUpdate(data.pluginId)
      return { success: true }
    })

    // Grant multiple permissions at once
    channel.regChannel(ChannelType.MAIN, 'permission:grant-multiple', async ({ data }) => {
      if (!data?.pluginId || !data?.permissionIds) return { success: false }
      for (const permissionId of data.permissionIds) {
        await this.store.grant(data.pluginId, permissionId, data.grantedBy || 'user')
      }
      this.broadcastUpdate(data.pluginId)
      return { success: true }
    })

    // Revoke all permissions for a plugin
    channel.regChannel(ChannelType.MAIN, 'permission:revoke-all', async ({ data }) => {
      if (!data?.pluginId) return { success: false }
      await this.store.revokeAll(data.pluginId)
      this.broadcastUpdate(data.pluginId)
      return { success: true }
    })

    // Check if plugin has specific permission
    channel.regChannel(ChannelType.MAIN, 'permission:check', async ({ data }) => {
      if (!data?.pluginId || !data?.permissionId) return false
      return this.store.hasPermission(data.pluginId, data.permissionId, data.sdkapi)
    })

    // Get all plugin permission statuses
    channel.regChannel(ChannelType.MAIN, 'permission:get-all', async () => {
      return this.store.getAllPluginPermissions()
    })

    // Get permission registry
    channel.regChannel(ChannelType.MAIN, 'permission:get-registry', async () => {
      const { permissionRegistry } = await import('@talex-touch/utils/permission')
      return permissionRegistry.all()
    })

    // Get audit logs
    channel.regChannel(ChannelType.MAIN, 'permission:get-audit-logs', async ({ data }) => {
      return this.store.getAuditLogs({
        pluginId: data?.pluginId,
        action: data?.action,
        limit: data?.limit || 50,
        offset: data?.offset || 0,
      })
    })

    // Clear audit logs
    channel.regChannel(ChannelType.MAIN, 'permission:clear-audit-logs', async () => {
      this.store.clearAuditLogs()
      return { success: true }
    })
  }

  /**
   * Broadcast permission update to all renderer windows
   */
  private broadcastUpdate(pluginId: string): void {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      $app.channel?.sendTo(win, ChannelType.MAIN, 'permission:updated', { pluginId })
    }
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

  onDestroy(): MaybePromise<void> {
    // Save any pending changes
    this.store.save()
    console.info('[PermissionModule] Destroyed')
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
