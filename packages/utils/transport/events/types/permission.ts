/**
 * @fileoverview Type definitions for Permission domain events
 * @module @talex-touch/utils/transport/events/types/permission
 */

import type {
  PermissionAuditLog,
  PermissionCheckResult,
  PermissionDefinition,
  PermissionGrant,
  PluginPermissionStatus,
} from '../../../permission/types'

export interface PermissionGetPluginRequest {
  pluginId: string
}

export type PermissionGetPluginResponse = PermissionGrant[]

export interface PermissionGetStatusRequest {
  pluginId: string
  sdkapi?: number
  required?: string[]
  optional?: string[]
}

export type PermissionGetStatusResponse = PluginPermissionStatus | null

export interface PermissionGrantRequest {
  pluginId: string
  permissionId: string
  grantedBy?: PermissionGrant['grantedBy']
}

export interface PermissionGrantMultipleRequest {
  pluginId: string
  permissionIds: string[]
  grantedBy?: PermissionGrant['grantedBy']
}

export interface PermissionRevokeRequest {
  pluginId: string
  permissionId: string
}

export interface PermissionRevokeAllRequest {
  pluginId: string
}

export interface PermissionCheckRequest {
  pluginId: string
  permissionId: string
  sdkapi?: number
}

export type PermissionCheckResponse = boolean

export type PermissionGetAllResponse = Record<string, PermissionGrant[]>

export type PermissionGetRegistryResponse = PermissionDefinition[]

export interface PermissionGetAuditLogsRequest {
  pluginId?: string
  action?: PermissionAuditLog['action']
  limit?: number
  offset?: number
}

export type PermissionGetAuditLogsResponse = PermissionAuditLog[]

export interface PermissionOperationResult {
  success: boolean
}

export interface PermissionUpdatedPayload {
  pluginId: string
}

export interface PermissionStartupRequestPayload {
  pluginId: string
  pluginName: string
  sdkapi?: number
  required: string[]
  optional: string[]
  reasons: Record<string, string>
}

export type PermissionGetPerformanceResponse = unknown

export type PermissionGetPluginStatusResponse = PermissionCheckResult
