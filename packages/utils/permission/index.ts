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
  CURRENT_SDK_VERSION,
} from '../plugin/sdk-version'
import { DEFAULT_PERMISSIONS, permissionRegistry } from './registry'

export * from './legacy'
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
  required = required.filter(id => permissionRegistry.has(id))
  optional = optional.filter(id => permissionRegistry.has(id))

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

  // Calculate missing required permissions
  const missingRequired = declaredPermissions.required.filter(
    p => !grantedPermissions.includes(p) && !DEFAULT_PERMISSIONS.includes(p),
  )

  // Calculate denied (not in granted and not default)
  const allDeclared = [...declaredPermissions.required, ...declaredPermissions.optional]
  const denied = allDeclared.filter(
    p => !grantedPermissions.includes(p) && !DEFAULT_PERMISSIONS.includes(p),
  )

  return {
    pluginId,
    sdkapi,
    enforcePermissions: sdkCompat.enforcePermissions,
    required: declaredPermissions.required,
    optional: declaredPermissions.optional,
    granted: [...new Set([...grantedPermissions, ...DEFAULT_PERMISSIONS])],
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
  // If enforcement is disabled, allow all
  if (!status.enforcePermissions) {
    return true
  }

  // Check if granted
  return status.granted.includes(permissionId)
}

/**
 * Generate permission issue for plugin
 */
export function generatePermissionIssue(
  status: PluginPermissionStatus,
): { type: 'error' | 'warning', message: string, code: string, suggestion?: string } | null {
  // SDK version warning
  if (status.warning && !status.enforcePermissions) {
    return {
      type: 'warning',
      message: status.warning,
      code: status.sdkapi === undefined ? 'SDK_VERSION_MISSING' : 'SDK_VERSION_OUTDATED',
      suggestion: `Add "sdkapi": ${CURRENT_SDK_VERSION} to manifest.json for permission enforcement.`,
    }
  }

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
