/**
 * Permission Guard
 *
 * Runtime permission checking and interception.
 * Performance target: < 5ms per check (verified via timing instrumentation)
 */

import type { PermissionStore } from './permission-store'
import { getLogger } from '@talex-touch/utils/common/logger'
import { normalizePermissionId, permissionRegistry } from '@talex-touch/utils/permission'

const permissionGuardLog = getLogger('permission-guard')

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  /** Whether permission is granted */
  allowed: boolean
  /** Machine-readable error code */
  code?: 'PERMISSION_DENIED' | 'SDKAPI_BLOCKED'
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

type PermissionDeniedError = Error & {
  code: 'PERMISSION_DENIED' | 'SDKAPI_BLOCKED'
  permissionId: string
  pluginId: string
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
  { pattern: 'fs:index', permissions: ['fs.index'] },

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
  { pattern: 'shortcon:reg', permissions: ['system.shortcut'] },

  // Intelligence APIs
  { pattern: 'intelligence:agent:tool:approve', permissions: ['intelligence.admin'] },
  { pattern: 'intelligence:agent:session:trace:export', permissions: ['intelligence.admin'] },
  { pattern: 'intelligence:agent:tool:*', permissions: ['intelligence.agents'] },
  { pattern: 'intelligence:agent:execute', permissions: ['intelligence.agents'] },
  { pattern: 'intelligence:agent:*', permissions: ['intelligence.basic'] },
  { pattern: 'intelligence:agent:session:*', permissions: ['intelligence.basic'] },
  { pattern: 'intelligence:*', permissions: ['intelligence.basic'] },

  // Storage APIs
  { pattern: 'storage:plugin:*', permissions: ['storage.plugin'] },
  { pattern: 'storage:shared:*', permissions: ['storage.shared'] },
  { pattern: 'storage:sqlite:*', permissions: ['storage.sqlite'] },

  // Window APIs
  { pattern: 'window:new', permissions: ['window.create'] },
  { pattern: 'window:visible', permissions: ['window.create'] },
  { pattern: 'window:command', permissions: ['window.create'] },
  { pattern: 'window:property', permissions: ['window.create'] },
  { pattern: 'window:create', permissions: ['window.create'] },
  { pattern: 'window:open', permissions: ['window.create'] },
  { pattern: 'window:capture', permissions: ['window.capture'] },
  { pattern: 'screen:capture', permissions: ['window.capture'] },

  // Native APIs
  { pattern: 'native:screenshot:*', permissions: ['window.capture'] },
  { pattern: 'native:file-index:*', permissions: ['fs.index'] },
  { pattern: 'native:file:*', permissions: ['fs.read'] },
  { pattern: 'native:media:*', permissions: ['media.read'] },

  // Localization and Domain Lexicon APIs
  { pattern: 'i18n:*', permissions: ['i18n.read'] },
  { pattern: 'lexicon:resolve', permissions: ['lexicon.read'] },
  { pattern: 'lexicon:search', permissions: ['lexicon.read'] },
  { pattern: 'lexicon:register', permissions: ['lexicon.register'] },

  // Search APIs
  { pattern: 'search:root-results:*', permissions: ['search.root-results'] },

  // Flow Transfer APIs
  { pattern: 'flow:native:*', permissions: ['network.internet'] },
  { pattern: 'flow:*', permissions: ['storage.shared'] },

  // DivisionBox APIs
  { pattern: 'division-box:*', permissions: ['window.create'] }
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
    slowChecks: 0 // > 5ms
  }

  /** API names that reached check() with no mapping, and how often. See #915. */
  private unmappedApis = new Map<string, { count: number; plugins: Set<string> }>()

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
  check(pluginId: string, apiName: string, sdkapi?: number): PermissionCheckResult {
    const startTime = performance.now()

    // Find matching permission mapping
    const requiredPermissions = this.getRequiredPermissions(apiName)

    if (requiredPermissions.length === 0) {
      // Unmapped names are allowed, which makes this an opt-in denylist keyed on a
      // hand-maintained table rather than a default-deny gate (#915). What still reaches
      // here is a name that matches no API pattern AND is not a registered permission —
      // i.e. one nothing in the permission model knows about at all. Every literal the
      // main process passes today is one or the other, so this branch should be empty in
      // practice; recording it is how a new one gets noticed.
      //
      // An allow that leaves a trace is still a gap, but it is a countable gap rather
      // than a silent one.
      this.recordUnmappedApi(pluginId, apiName)

      const duration = performance.now() - startTime
      this.recordPerformance(duration)
      return {
        allowed: true,
        permissionId: '',
        pluginId,
        durationMs: duration
      }
    }

    // Check each required permission
    for (const permissionId of requiredPermissions) {
      const normalizedPermissionId = normalizePermissionId(permissionId)
      const accessState = this.store.checkPermissionAccess(pluginId, normalizedPermissionId, sdkapi)

      if (!accessState.allowed) {
        const duration = performance.now() - startTime
        this.recordPerformance(duration)
        const blockedByDeclaration = accessState.reason === 'not-declared'
        const blockedBySdk = accessState.reason === 'incompatible-sdk'
        const reason = blockedByDeclaration
          ? accessState.hasHistoricalGrant
            ? `Permission '${normalizedPermissionId}' was previously granted but is no longer declared`
            : `Permission '${normalizedPermissionId}' is not declared in plugin manifest`
          : blockedBySdk
            ? `Plugin "${pluginId}" is blocked because sdkapi is incompatible with the enforced runtime baseline`
            : `Permission '${normalizedPermissionId}' not granted`
        return {
          allowed: false,
          code: blockedBySdk ? 'SDKAPI_BLOCKED' : 'PERMISSION_DENIED',
          permissionId: normalizedPermissionId,
          pluginId,
          reason,
          showRequest: blockedBySdk ? false : !blockedByDeclaration,
          durationMs: duration
        }
      }
    }

    const duration = performance.now() - startTime
    this.recordPerformance(duration)
    return {
      allowed: true,
      permissionId: normalizePermissionId(requiredPermissions[0]),
      pluginId,
      durationMs: duration
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
    const avg =
      this.performanceStats.totalChecks > 0
        ? this.performanceStats.totalDurationMs / this.performanceStats.totalChecks
        : 0
    return {
      totalChecks: this.performanceStats.totalChecks,
      avgDurationMs: Math.round(avg * 100) / 100,
      maxDurationMs: Math.round(this.performanceStats.maxDurationMs * 100) / 100,
      slowChecks: this.performanceStats.slowChecks,
      meetsTarget: avg < 5 && this.performanceStats.maxDurationMs < 10
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
      slowChecks: 0
    }
  }

  /**
   * Check permission and throw if denied
   */
  enforce(pluginId: string, apiName: string, sdkapi?: number): void {
    const result = this.check(pluginId, apiName, sdkapi)
    if (!result.allowed) {
      const error = new Error(`Permission denied: ${result.reason}`) as PermissionDeniedError
      error.code = result.code ?? 'PERMISSION_DENIED'
      error.permissionId = result.permissionId
      error.pluginId = pluginId
      throw error
    }
  }

  /**
   * Get required permissions for an API
   */
  private recordUnmappedApi(pluginId: string, apiName: string): void {
    const entry = this.unmappedApis.get(apiName)
    if (entry) {
      entry.count += 1
      entry.plugins.add(pluginId)
      return
    }

    this.unmappedApis.set(apiName, { count: 1, plugins: new Set([pluginId]) })
    // First sighting only: these repeat per call and would drown the log otherwise.
    permissionGuardLog.warn(
      `"${apiName}" matches no entry in API_PERMISSION_MAPPINGS and was allowed by default.`,
      { meta: { apiName, pluginId } }
    )
  }

  /**
   * Every unmapped name seen so far. This is the inventory a default-deny flip needs: each
   * entry is either an API that should require a permission, or one that should be declared
   * as deliberately public.
   */
  getUnmappedApis(): { apiName: string; count: number; plugins: string[] }[] {
    return [...this.unmappedApis.entries()]
      .map(([apiName, entry]) => ({ apiName, count: entry.count, plugins: [...entry.plugins] }))
      .sort((left, right) => right.count - left.count)
  }

  getRequiredPermissions(apiName: string): string[] {
    // Exact match
    const exact = this.mappings.get(apiName)
    if (exact) {
      return exact.permissions.map((permissionId) => normalizePermissionId(permissionId))
    }

    // Wildcard match
    for (const [pattern, mapping] of this.mappings) {
      if (this.matchPattern(pattern, apiName)) {
        return mapping.permissions.map((permissionId) => normalizePermissionId(permissionId))
      }
    }

    // Two vocabularies reach this function. `API_PERMISSION_MAPPINGS` is keyed on
    // colon-separated *API names* (`clipboard:read`), but `withPermission` and
    // `createProtectedRegister` name a dotted *permission id* directly
    // (`system.shell`) — and channel-guard passes that straight through as the
    // apiName. No pattern contains a dot, so every one of those fell off the end
    // and was waved through: the terminal, network, plugin-window, localization
    // and agent-execution gates were all allow-everything (#915).
    //
    // A name that is a registered permission is required as itself. There is no
    // ambiguity to resolve — API names use colons and permission ids use dots.
    const normalized = normalizePermissionId(apiName)
    if (permissionRegistry.get(normalized)) {
      return [normalized]
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
      const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`)
      return regex.test(apiName)
    }

    return pattern === apiName
  }

  /**
   * Register custom API permission mapping
   */
  registerMapping(mapping: ApiPermissionMapping): void {
    this.mappings.set(mapping.pattern, {
      ...mapping,
      permissions: mapping.permissions.map((permissionId) => normalizePermissionId(permissionId))
    })
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
