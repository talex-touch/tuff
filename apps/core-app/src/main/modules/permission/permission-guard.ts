/**
 * Permission Guard
 *
 * Runtime permission checking and interception.
 * Performance target: < 5ms per check (verified via timing instrumentation)
 */

import { checkSdkCompatibility } from '@talex-touch/utils/plugin'
import { DEFAULT_PERMISSIONS, permissionRegistry } from '@talex-touch/utils/permission'
import { PermissionStore } from './permission-store'

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  /** Whether permission is granted */
  allowed: boolean
  /** Reason for denial if not allowed */
  reason?: string
  /** Whether to show permission request dialog */
  showRequest?: boolean
  /** Permission ID that was checked */
  permissionId: string
  /** Plugin ID */
  pluginId: string
  /** Check duration in milliseconds (for performance monitoring) */
  durationMs?: number
}

/**
 * API to permission mapping
 */
export interface ApiPermissionMapping {
  /** API pattern (e.g., 'fs:read', 'clipboard:*') */
  pattern: string
  /** Required permission IDs */
  permissions: string[]
  /** Whether all permissions are required (AND) or any (OR) */
  requireAll?: boolean
}

/**
 * Built-in API permission mappings
 */
export const API_PERMISSION_MAPPINGS: ApiPermissionMapping[] = [
  // Filesystem APIs
  { pattern: 'fs:read', permissions: ['fs.read'] },
  { pattern: 'fs:write', permissions: ['fs.write'] },
  { pattern: 'fs:execute', permissions: ['fs.execute'] },
  { pattern: 'fs:delete', permissions: ['fs.write'] },
  { pattern: 'fs:watch', permissions: ['fs.read'] },

  // Clipboard APIs
  { pattern: 'clipboard:read', permissions: ['clipboard.read'] },
  { pattern: 'clipboard:write', permissions: ['clipboard.write'] },
  { pattern: 'clipboard:get*', permissions: ['clipboard.read'] },
  { pattern: 'clipboard:set*', permissions: ['clipboard.write'] },

  // Network APIs
  { pattern: 'network:fetch', permissions: ['network.internet'] },
  { pattern: 'network:request', permissions: ['network.internet'] },
  { pattern: 'network:download', permissions: ['network.download'] },
  { pattern: 'network:local*', permissions: ['network.local'] },

  // System APIs
  { pattern: 'shell:*', permissions: ['system.shell'] },
  { pattern: 'system:shell', permissions: ['system.shell'] },
  { pattern: 'system:exec', permissions: ['system.shell'] },
  { pattern: 'notification:*', permissions: ['system.notification'] },
  { pattern: 'tray:*', permissions: ['system.tray'] },

  // AI APIs
  { pattern: 'ai:chat', permissions: ['ai.basic'] },
  { pattern: 'ai:complete', permissions: ['ai.basic'] },
  { pattern: 'ai:embed', permissions: ['ai.basic'] },
  { pattern: 'ai:agent*', permissions: ['ai.agents'] },
  { pattern: 'intelligence:*', permissions: ['ai.basic'] },

  // Storage APIs
  { pattern: 'storage:plugin:*', permissions: ['storage.plugin'] },
  { pattern: 'storage:shared:*', permissions: ['storage.shared'] },

  // Window APIs
  { pattern: 'window:create', permissions: ['window.create'] },
  { pattern: 'window:open', permissions: ['window.create'] },
  { pattern: 'window:capture', permissions: ['window.capture'] },
  { pattern: 'screen:capture', permissions: ['window.capture'] },
]

/**
 * PermissionGuard - Runtime permission checking
 */
export class PermissionGuard {
  private store: PermissionStore
  private mappings: Map<string, ApiPermissionMapping> = new Map()
  private performanceStats = {
    totalChecks: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    slowChecks: 0, // > 5ms
  }

  constructor(store: PermissionStore) {
    this.store = store

    // Index mappings for faster lookup
    for (const mapping of API_PERMISSION_MAPPINGS) {
      this.mappings.set(mapping.pattern, mapping)
    }
  }

  /**
   * Check if plugin has permission for an API call
   */
  check(
    pluginId: string,
    apiName: string,
    sdkapi?: number
  ): PermissionCheckResult {
    const startTime = performance.now()

    // Find matching permission mapping
    const requiredPermissions = this.getRequiredPermissions(apiName)

    if (requiredPermissions.length === 0) {
      // No permission required for this API
      const duration = performance.now() - startTime
      this.recordPerformance(duration)
      return {
        allowed: true,
        permissionId: '',
        pluginId,
        durationMs: duration,
      }
    }

    // Check SDK compatibility
    const sdkCompat = checkSdkCompatibility(sdkapi, pluginId)
    if (!sdkCompat.enforcePermissions) {
      // Enforcement disabled for legacy plugins
      const duration = performance.now() - startTime
      this.recordPerformance(duration)
      return {
        allowed: true,
        permissionId: requiredPermissions[0],
        pluginId,
        reason: 'Permission enforcement disabled for legacy SDK',
        durationMs: duration,
      }
    }

    // Check each required permission
    for (const permissionId of requiredPermissions) {
      // Check default permissions
      if (DEFAULT_PERMISSIONS.includes(permissionId)) {
        continue
      }

      // Check granted permissions
      if (!this.store.hasPermission(pluginId, permissionId, sdkapi)) {
        const duration = performance.now() - startTime
        this.recordPerformance(duration)
        return {
          allowed: false,
          permissionId,
          pluginId,
          reason: `Permission '${permissionId}' not granted`,
          showRequest: true,
          durationMs: duration,
        }
      }
    }

    const duration = performance.now() - startTime
    this.recordPerformance(duration)
    return {
      allowed: true,
      permissionId: requiredPermissions[0],
      pluginId,
      durationMs: duration,
    }
  }

  /**
   * Record performance metrics for monitoring
   */
  private recordPerformance(durationMs: number): void {
    this.performanceStats.totalChecks++
    this.performanceStats.totalDurationMs += durationMs
    if (durationMs > this.performanceStats.maxDurationMs) {
      this.performanceStats.maxDurationMs = durationMs
    }
    if (durationMs > 5) {
      this.performanceStats.slowChecks++
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    totalChecks: number
    avgDurationMs: number
    maxDurationMs: number
    slowChecks: number
    meetsTarget: boolean
  } {
    const avg = this.performanceStats.totalChecks > 0
      ? this.performanceStats.totalDurationMs / this.performanceStats.totalChecks
      : 0
    return {
      totalChecks: this.performanceStats.totalChecks,
      avgDurationMs: Math.round(avg * 100) / 100,
      maxDurationMs: Math.round(this.performanceStats.maxDurationMs * 100) / 100,
      slowChecks: this.performanceStats.slowChecks,
      meetsTarget: avg < 5 && this.performanceStats.maxDurationMs < 10,
    }
  }

  /**
   * Reset performance statistics
   */
  resetPerformanceStats(): void {
    this.performanceStats = {
      totalChecks: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      slowChecks: 0,
    }
  }

  /**
   * Check permission and throw if denied
   */
  enforce(
    pluginId: string,
    apiName: string,
    sdkapi?: number
  ): void {
    const result = this.check(pluginId, apiName, sdkapi)
    if (!result.allowed) {
      const error = new Error(`Permission denied: ${result.reason}`)
      ;(error as any).code = 'PERMISSION_DENIED'
      ;(error as any).permissionId = result.permissionId
      ;(error as any).pluginId = pluginId
      throw error
    }
  }

  /**
   * Get required permissions for an API
   */
  getRequiredPermissions(apiName: string): string[] {
    // Exact match
    const exact = this.mappings.get(apiName)
    if (exact) {
      return exact.permissions
    }

    // Wildcard match
    for (const [pattern, mapping] of this.mappings) {
      if (this.matchPattern(pattern, apiName)) {
        return mapping.permissions
      }
    }

    return []
  }

  /**
   * Match API name against pattern
   */
  private matchPattern(pattern: string, apiName: string): boolean {
    // Handle wildcard patterns
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1)
      return apiName.startsWith(prefix)
    }

    if (pattern.includes('*')) {
      // Convert to regex
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
      return regex.test(apiName)
    }

    return pattern === apiName
  }

  /**
   * Register custom API permission mapping
   */
  registerMapping(mapping: ApiPermissionMapping): void {
    this.mappings.set(mapping.pattern, mapping)
  }

  /**
   * Get all registered mappings
   */
  getMappings(): ApiPermissionMapping[] {
    return Array.from(this.mappings.values())
  }

  /**
   * Check if an API requires any permission
   */
  requiresPermission(apiName: string): boolean {
    return this.getRequiredPermissions(apiName).length > 0
  }

  /**
   * Get permission definition for display
   */
  getPermissionInfo(permissionId: string) {
    return permissionRegistry.get(permissionId)
  }
}
