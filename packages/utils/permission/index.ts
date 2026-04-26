/**
 * Permission Center
 *
 * Plugin permission management system.
 */

import type { SdkApiVersion } from '../plugin'
import type {
  ManifestPermissionReasons,
  ManifestPermissions,
  PluginPermissionStatus,
} from './types'
import {
  checkSdkCompatibility,
} from '../plugin/sdk-version'
import {
  DEFAULT_PERMISSIONS,
  getPermissionIdCandidates,
  normalizePermissionId,
  permissionRegistry
} from './registry'

export * from './registry'
export * from './types'

/**
 * Parse permissions from manifest
 */
export function parseManifestPermissions(manifest: {
  permissions?: ManifestPermissions | string[]
  permissionReasons?: ManifestPermissionReasons
}): { required: string[], optional: string[], reasons: ManifestPermissionReasons } {
  let required: string[] = []
  let optional: string[] = []

  if (Array.isArray(manifest.permissions)) {
    // Legacy format: string[]
    required = manifest.permissions
  }
  else if (manifest.permissions) {
    // New format: { required, optional }
    required = manifest.permissions.required || []
    optional = manifest.permissions.optional || []
  }

  // Validate permission IDs
  required = required
    .map(id => normalizePermissionId(id))
    .filter(id => permissionRegistry.has(id))
  optional = optional
    .map(id => normalizePermissionId(id))
    .filter(id => permissionRegistry.has(id))

  return {
    required,
    optional,
    reasons: manifest.permissionReasons || {},
  }
}

/**
 * Get plugin permission status
 */
export function getPluginPermissionStatus(
  pluginId: string,
  sdkapi: SdkApiVersion | undefined,
  declaredPermissions: { required: string[], optional: string[] },
  grantedPermissions: string[],
): PluginPermissionStatus {
  const sdkCompat = checkSdkCompatibility(sdkapi, pluginId)
  const required = [...new Set(declaredPermissions.required.map(id => normalizePermissionId(id)))]
  const optional = [...new Set(declaredPermissions.optional.map(id => normalizePermissionId(id)))]
  const declared = [...new Set([...required, ...optional])]
  const declaredSet = new Set(declared)
  const grantedSet = new Set(grantedPermissions.map(id => normalizePermissionId(id)))
  const defaultPermissions = [...new Set(DEFAULT_PERMISSIONS.map(id => normalizePermissionId(id)))]
  const defaultSet = new Set(defaultPermissions)

  // Effective granted permissions only include current declarations.
  const effectiveGranted = declared.filter(permissionId => {
    return grantedSet.has(permissionId) || defaultSet.has(permissionId)
  })

  // Historically granted permissions that are no longer declared should be retained but inactive.
  const deprecatedGranted = [...grantedSet].filter(
    permissionId => !declaredSet.has(permissionId) && !defaultSet.has(permissionId),
  )
  const outdatedByAppUpdate = deprecatedGranted.filter(permissionId => !permissionRegistry.has(permissionId))
  const outdatedByPluginChange = deprecatedGranted.filter(permissionId => permissionRegistry.has(permissionId))

  // Calculate missing required permissions.
  const missingRequired = required.filter(permissionId => !effectiveGranted.includes(permissionId))

  // Calculate denied (declared but not effectively granted).
  const denied = declared.filter(permissionId => !effectiveGranted.includes(permissionId))

  return {
    pluginId,
    sdkapi,
    enforcePermissions: sdkCompat.enforcePermissions,
    required,
    optional,
    granted: effectiveGranted,
    deprecatedGranted,
    outdatedByAppUpdate,
    outdatedByPluginChange,
    denied,
    missingRequired,
    warning: sdkCompat.warning,
  }
}

/**
 * Check if plugin has permission
 */
export function hasPermission(
  status: PluginPermissionStatus,
  permissionId: string,
): boolean {
  // Compatibility-bypassed access is no longer a valid runtime path.
  if (!status.enforcePermissions) {
    return false
  }

  // Check if granted
  const candidates = getPermissionIdCandidates(permissionId)
  return candidates.some(id => status.granted.includes(id))
}

/**
 * Generate permission issue for plugin
 */
export function generatePermissionIssue(
  status: PluginPermissionStatus,
): { type: 'error' | 'warning', message: string, code: string, suggestion?: string } | null {
  // Missing required permissions (warning, not error - plugin can still run)
  if (status.enforcePermissions && status.missingRequired.length > 0) {
    return {
      type: 'warning',
      message: `Missing required permissions: ${status.missingRequired.join(', ')}`,
      code: 'PERMISSION_MISSING',
      suggestion: 'Grant permissions in Plugin Details > Permissions tab.',
    }
  }

  return null
}
