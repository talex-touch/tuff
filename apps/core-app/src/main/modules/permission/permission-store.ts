/**
 * Permission Store
 *
 * Persistent storage for plugin permissions.
 */

import type {
  PermissionAuditLog,
  PermissionGrant,
  PluginPermissionStatus
} from '@talex-touch/utils/permission'
import path from 'node:path'
import { DEFAULT_PERMISSIONS, getPluginPermissionStatus } from '@talex-touch/utils/permission'
import { checkSdkCompatibility } from '@talex-touch/utils/plugin'
import fse from 'fs-extra'

type AuditLogEntry = PermissionAuditLog

interface PermissionData {
  /** Version for migration */
  version: number
  /** Plugin permission grants: { pluginId: { permissionId: PermissionGrant } } */
  grants: Record<string, Record<string, PermissionGrant>>
  /** Audit logs (recent 500 entries) */
  auditLogs?: AuditLogEntry[]
}

const CURRENT_VERSION = 1

/**
 * PermissionStore - JSON file-based permission storage
 */
export class PermissionStore {
  private filePath: string
  private data: PermissionData
  private dirty = false

  /** Session-level permissions (memory only, cleared on app restart) */
  private sessionGrants: Record<string, Set<string>> = {}

  constructor(dirPath: string) {
    this.filePath = path.join(dirPath, 'permissions.json')
    this.data = this.load()
  }

  /**
   * Load permissions from file
   */
  private load(): PermissionData {
    try {
      if (fse.existsSync(this.filePath)) {
        const data = fse.readJSONSync(this.filePath) as PermissionData
        // Migration if needed
        if (!data.version || data.version < CURRENT_VERSION) {
          return this.migrate(data)
        }
        return data
      }
    } catch (error) {
      console.error('[PermissionStore] Failed to load:', error)
    }

    // Return default empty data
    return {
      version: CURRENT_VERSION,
      grants: {}
    }
  }

  /**
   * Migrate old data format
   */
  private migrate(data: Partial<PermissionData>): PermissionData {
    console.info('[PermissionStore] Migrating data to version', CURRENT_VERSION)
    return {
      version: CURRENT_VERSION,
      grants: data.grants || {}
    }
  }

  /**
   * Save permissions to file
   */
  save(): void {
    if (!this.dirty) return

    try {
      fse.ensureDirSync(path.dirname(this.filePath))
      fse.writeJSONSync(this.filePath, this.data, { spaces: 2 })
      this.dirty = false
    } catch (error) {
      console.error('[PermissionStore] Failed to save:', error)
    }
  }

  /**
   * Grant permission to plugin
   */
  async grant(
    pluginId: string,
    permissionId: string,
    grantedBy: 'user' | 'auto' | 'trust' = 'user'
  ): Promise<void> {
    if (!this.data.grants[pluginId]) {
      this.data.grants[pluginId] = {}
    }

    this.data.grants[pluginId][permissionId] = {
      pluginId,
      permissionId,
      grantedAt: Date.now(),
      grantedBy
    }

    // Add audit log
    this.addAuditLog(
      'granted',
      pluginId,
      permissionId,
      grantedBy === 'trust' ? 'system' : grantedBy === 'auto' ? 'auto' : 'user'
    )

    this.dirty = true
    this.save()
  }

  /**
   * Revoke permission from plugin
   */
  async revoke(pluginId: string, permissionId: string): Promise<void> {
    if (this.data.grants[pluginId]) {
      delete this.data.grants[pluginId][permissionId]

      // Add audit log
      this.addAuditLog('revoked', pluginId, permissionId, 'user')

      this.dirty = true
      this.save()
    }
  }

  /**
   * Revoke all permissions for plugin
   */
  async revokeAll(pluginId: string): Promise<void> {
    const permissions = Object.keys(this.data.grants[pluginId] || {})
    delete this.data.grants[pluginId]

    // Add audit logs for each revoked permission
    for (const permissionId of permissions) {
      this.addAuditLog('revoked', pluginId, permissionId, 'user', 'Revoked via "revoke all"')
    }

    this.dirty = true
    this.save()
  }

  /**
   * Grant session-level permission (memory only, not persisted)
   */
  grantSession(pluginId: string, permissionId: string): void {
    if (!this.sessionGrants[pluginId]) {
      this.sessionGrants[pluginId] = new Set()
    }
    this.sessionGrants[pluginId].add(permissionId)
    this.addAuditLog('granted', pluginId, permissionId, 'user', 'Session-only grant')
  }

  /**
   * Grant multiple session-level permissions
   */
  grantSessionMultiple(pluginId: string, permissionIds: string[]): void {
    if (!this.sessionGrants[pluginId]) {
      this.sessionGrants[pluginId] = new Set()
    }
    for (const permissionId of permissionIds) {
      this.sessionGrants[pluginId].add(permissionId)
      this.addAuditLog('granted', pluginId, permissionId, 'user', 'Session-only grant')
    }
  }

  /**
   * Check if plugin has session-level permission
   */
  hasSessionPermission(pluginId: string, permissionId: string): boolean {
    return this.sessionGrants[pluginId]?.has(permissionId) ?? false
  }

  /**
   * Check if plugin has permission
   */
  hasPermission(pluginId: string, permissionId: string, sdkapi?: number): boolean {
    // Check SDK compatibility
    const compat = checkSdkCompatibility(sdkapi, pluginId)
    if (!compat.enforcePermissions) {
      // Enforcement disabled - allow all
      return true
    }

    // Check default permissions
    if (DEFAULT_PERMISSIONS.includes(permissionId)) {
      return true
    }

    // Check session grants first
    if (this.hasSessionPermission(pluginId, permissionId)) {
      return true
    }

    // Check granted permissions
    return !!this.data.grants[pluginId]?.[permissionId]
  }

  /**
   * Get all permissions for a plugin
   */
  getPluginPermissions(pluginId: string): PermissionGrant[] {
    const pluginGrants = this.data.grants[pluginId]
    if (!pluginGrants) return []
    return Object.values(pluginGrants)
  }

  /**
   * Get all plugin permissions
   */
  getAllPluginPermissions(): Record<string, PermissionGrant[]> {
    const result: Record<string, PermissionGrant[]> = {}
    for (const [pluginId, grants] of Object.entries(this.data.grants)) {
      result[pluginId] = Object.values(grants)
    }
    return result
  }

  /**
   * Get permission status for a plugin
   */
  getPluginPermissionStatus(
    pluginId: string,
    sdkapi: number | undefined,
    declared: { required: string[]; optional: string[] }
  ): PluginPermissionStatus {
    const grantedIds = this.getPluginPermissions(pluginId).map((g) => g.permissionId)
    return getPluginPermissionStatus(pluginId, sdkapi, declared, grantedIds)
  }

  /**
   * Get granted permission IDs for a plugin
   */
  getGrantedPermissionIds(pluginId: string): string[] {
    return this.getPluginPermissions(pluginId).map((g) => g.permissionId)
  }

  // ==================== Audit Log Methods ====================

  private readonly MAX_AUDIT_LOGS = 500

  /**
   * Add an audit log entry
   */
  addAuditLog(
    action: AuditLogEntry['action'],
    pluginId: string,
    permissionId: string,
    triggeredBy: 'user' | 'auto' | 'system' | 'plugin' = 'system',
    reason?: string
  ): void {
    if (!this.data.auditLogs) {
      this.data.auditLogs = []
    }

    const context: Record<string, unknown> = { triggeredBy }
    if (reason) {
      context.reason = reason
    }

    const entry: AuditLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      pluginId,
      action,
      permissionId,
      context
    }

    this.data.auditLogs.unshift(entry)

    // Keep only recent entries
    if (this.data.auditLogs.length > this.MAX_AUDIT_LOGS) {
      this.data.auditLogs = this.data.auditLogs.slice(0, this.MAX_AUDIT_LOGS)
    }

    this.dirty = true
    this.save()
  }

  /**
   * Get audit logs with optional filters
   */
  getAuditLogs(options?: {
    pluginId?: string
    action?: AuditLogEntry['action']
    limit?: number
    offset?: number
  }): AuditLogEntry[] {
    let logs = this.data.auditLogs || []

    // Apply filters
    if (options?.pluginId) {
      logs = logs.filter((l) => l.pluginId === options.pluginId)
    }
    if (options?.action) {
      logs = logs.filter((l) => l.action === options.action)
    }

    // Apply pagination
    const offset = options?.offset || 0
    const limit = options?.limit || 50
    logs = logs.slice(offset, offset + limit)

    return logs
  }

  /**
   * Clear all audit logs
   */
  clearAuditLogs(): void {
    this.data.auditLogs = []
    this.dirty = true
    this.save()
  }
}

export type { AuditLogEntry }
