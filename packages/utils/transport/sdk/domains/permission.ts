import type {
  PermissionCheckRequest,
  PermissionCheckResponse,
  PermissionGetAllResponse,
  PermissionGetAuditLogsRequest,
  PermissionGetAuditLogsResponse,
  PermissionGetPerformanceResponse,
  PermissionGetPluginRequest,
  PermissionGetPluginResponse,
  PermissionGetRegistryResponse,
  PermissionGetStatusRequest,
  PermissionGetStatusResponse,
  PermissionGrantMultipleRequest,
  PermissionGrantRequest,
  PermissionOperationResult,
  PermissionRevokeAllRequest,
  PermissionRevokeRequest,
  PermissionStartupRequestPayload,
  PermissionUpdatedPayload,
} from '../../events/types/permission'
import type { ITuffTransport } from '../../types'
import { PermissionEvents } from '../../events'

export interface PermissionSdk {
  getPlugin: (payload: PermissionGetPluginRequest) => Promise<PermissionGetPluginResponse>
  getStatus: (payload: PermissionGetStatusRequest) => Promise<PermissionGetStatusResponse>
  grant: (payload: PermissionGrantRequest) => Promise<PermissionOperationResult>
  revoke: (payload: PermissionRevokeRequest) => Promise<PermissionOperationResult>
  grantMultiple: (payload: PermissionGrantMultipleRequest) => Promise<PermissionOperationResult>
  grantSession: (payload: PermissionGrantMultipleRequest) => Promise<PermissionOperationResult>
  revokeAll: (payload: PermissionRevokeAllRequest) => Promise<PermissionOperationResult>
  check: (payload: PermissionCheckRequest) => Promise<PermissionCheckResponse>
  getAll: () => Promise<PermissionGetAllResponse>
  getRegistry: () => Promise<PermissionGetRegistryResponse>
  getAuditLogs: (payload?: PermissionGetAuditLogsRequest) => Promise<PermissionGetAuditLogsResponse>
  clearAuditLogs: () => Promise<PermissionOperationResult>
  getPerformance: () => Promise<PermissionGetPerformanceResponse>
  resetPerformance: () => Promise<PermissionOperationResult>
  onUpdated: (handler: (payload: PermissionUpdatedPayload) => void) => () => void
  onStartupRequest: (handler: (payload: PermissionStartupRequestPayload) => void) => () => void
}

export type PermissionSdkTransport = Pick<ITuffTransport, 'send' | 'on'>

export function createPermissionSdk(transport: PermissionSdkTransport): PermissionSdk {
  return {
    getPlugin: payload => transport.send(PermissionEvents.api.getPlugin, payload),
    getStatus: payload => transport.send(PermissionEvents.api.getStatus, payload),
    grant: payload => transport.send(PermissionEvents.api.grant, payload),
    revoke: payload => transport.send(PermissionEvents.api.revoke, payload),
    grantMultiple: payload => transport.send(PermissionEvents.api.grantMultiple, payload),
    grantSession: payload => transport.send(PermissionEvents.api.grantSession, payload),
    revokeAll: payload => transport.send(PermissionEvents.api.revokeAll, payload),
    check: payload => transport.send(PermissionEvents.api.check, payload),
    getAll: () => transport.send(PermissionEvents.api.getAll),
    getRegistry: () => transport.send(PermissionEvents.api.getRegistry),
    getAuditLogs: payload => transport.send(PermissionEvents.api.getAuditLogs, payload),
    clearAuditLogs: () => transport.send(PermissionEvents.api.clearAuditLogs),
    getPerformance: () => transport.send(PermissionEvents.api.getPerformance),
    resetPerformance: () => transport.send(PermissionEvents.api.resetPerformance),
    onUpdated: handler => transport.on(PermissionEvents.push.updated, handler),
    onStartupRequest: handler => transport.on(PermissionEvents.push.startupRequest, handler),
  }
}

export type {
  PermissionCheckRequest,
  PermissionCheckResponse,
  PermissionGetAllResponse,
  PermissionGetAuditLogsRequest,
  PermissionGetAuditLogsResponse,
  PermissionGetPerformanceResponse,
  PermissionGetPluginRequest,
  PermissionGetPluginResponse,
  PermissionGetRegistryResponse,
  PermissionGetStatusRequest,
  PermissionGetStatusResponse,
  PermissionGrantMultipleRequest,
  PermissionGrantRequest,
  PermissionOperationResult,
  PermissionRevokeAllRequest,
  PermissionRevokeRequest,
  PermissionStartupRequestPayload,
  PermissionUpdatedPayload,
}
