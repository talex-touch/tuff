/**
 * Permission System Types
 *
 * Defines the permission model for plugin security.
 */

/**
 * Permission category
 */
export enum PermissionCategory {
  FILESYSTEM = 'fs',
  CLIPBOARD = 'clipboard',
  NETWORK = 'network',
  SYSTEM = 'system',
  AI = 'ai',
  STORAGE = 'storage',
  WINDOW = 'window',
}

/**
 * Risk level for permissions
 */
export enum PermissionRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/**
 * Permission definition
 */
export interface PermissionDefinition {
  /** Permission ID (e.g., 'fs.read') */
  id: string
  /** Category */
  category: PermissionCategory
  /** Risk level */
  risk: PermissionRiskLevel
  /** i18n key for display name */
  nameKey: string
  /** i18n key for description */
  descKey: string
  /** Icon name (lucide icon) */
  icon?: string
}

/**
 * Permission grant record
 */
export interface PermissionGrant {
  /** Plugin ID */
  pluginId: string
  /** Permission ID */
  permissionId: string
  /** Grant timestamp */
  grantedAt: number
  /** How it was granted */
  grantedBy: 'user' | 'auto' | 'trust'
  /** Expiration timestamp (optional) */
  expiresAt?: number
}

/**
 * Permission denial record
 */
export interface PermissionDenial {
  /** Plugin ID */
  pluginId: string
  /** Permission ID */
  permissionId: string
  /** Denial timestamp */
  deniedAt: number
  /** Reason for denial */
  reason?: string
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  /** Permission ID */
  permissionId: string
  /** Whether permission is granted */
  granted: boolean
  /** Grant details if granted */
  grant?: PermissionGrant
  /** Whether enforcement is active (sdkapi check) */
  enforced: boolean
  /** Warning message if any */
  warning?: string
}

/**
 * Plugin permission status
 */
export interface PluginPermissionStatus {
  /** Plugin ID */
  pluginId: string
  /** SDK API version */
  sdkapi?: number
  /** Whether permission enforcement is active */
  enforcePermissions: boolean
  /** Required permissions from manifest */
  required: string[]
  /** Optional permissions from manifest */
  optional: string[]
  /** Granted permissions */
  granted: string[]
  /** Denied permissions */
  denied: string[]
  /** Missing required permissions */
  missingRequired: string[]
  /** Compatibility warning */
  warning?: string
}

/**
 * Permission request for UI prompt
 */
export interface PermissionRequest {
  /** Plugin ID */
  pluginId: string
  /** Plugin display name */
  pluginName: string
  /** Permission ID */
  permissionId: string
  /** Reason from manifest */
  reason?: string
  /** Context of the request */
  context?: Record<string, unknown>
}

/**
 * Audit log entry
 */
export interface PermissionAuditLog {
  /** Log ID */
  id: string
  /** Timestamp */
  timestamp: number
  /** Plugin ID */
  pluginId: string
  /** Permission ID */
  permissionId: string
  /** Action type */
  action: 'granted' | 'denied' | 'revoked' | 'used' | 'blocked'
  /** Additional context */
  context?: Record<string, unknown>
}

/**
 * Manifest permission declaration
 */
export interface ManifestPermissions {
  /** Required permissions - plugin won't work without these */
  required?: string[]
  /** Optional permissions - can be granted later */
  optional?: string[]
}

/**
 * Permission reasons in manifest
 */
export type ManifestPermissionReasons = Record<string, string>
