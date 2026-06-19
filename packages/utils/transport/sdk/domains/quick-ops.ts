import type {
  QuickOpsBatteryStatusGetResponse,
  QuickOpsAuditGetRequest,
  QuickOpsAuditGetResponse,
  QuickOpsCapabilityGetResponse,
  QuickOpsCommonDirectoryGetRequest,
  QuickOpsCommonDirectoryGetResponse,
  QuickOpsDiagnosticsGetResponse,
  QuickOpsDeveloperPreviewRequest,
  QuickOpsDeveloperPreviewResponse,
  QuickOpsDeveloperPreviewSaveRequest,
  QuickOpsDeveloperPreviewSaveResponse,
  QuickOpsDirectoryUsageGetRequest,
  QuickOpsDirectoryUsageGetResponse,
  QuickOpsDiskSpaceGetResponse,
  QuickOpsDnsQueryGetRequest,
  QuickOpsDnsQueryGetResponse,
  QuickOpsFileBase64GetRequest,
  QuickOpsFileBase64GetResponse,
  QuickOpsFileHashGetRequest,
  QuickOpsFileHashGetResponse,
  QuickOpsFormatTextGetRequest,
  QuickOpsFormatTextGetResponse,
  QuickOpsNetworkStatusGetResponse,
  QuickOpsPathFormatGetRequest,
  QuickOpsPathFormatGetResponse,
  QuickOpsPortStatusGetRequest,
  QuickOpsPortStatusGetResponse,
  QuickOpsQueryLocalIpGetResponse,
  QuickOpsRecentDownloadGetResponse,
  QuickOpsSessionsGetResponse,
  QuickOpsSystemProxyGetResponse,
  QuickOpsSystemInfoGetResponse,
} from '../../events/types'
import type { ITuffTransport } from '../../types'
import { QuickOpsEvents } from '../../events'

export interface QuickOpsSdk {
  capabilities: () => Promise<QuickOpsCapabilityGetResponse>
  sessions: () => Promise<QuickOpsSessionsGetResponse>
  auditRecent: (request?: QuickOpsAuditGetRequest) => Promise<QuickOpsAuditGetResponse>
  systemInfo: () => Promise<QuickOpsSystemInfoGetResponse>
  tuffDiagnostics: () => Promise<QuickOpsDiagnosticsGetResponse>
  diskSpace: () => Promise<QuickOpsDiskSpaceGetResponse>
  directoryUsage: (
    request?: QuickOpsDirectoryUsageGetRequest,
  ) => Promise<QuickOpsDirectoryUsageGetResponse>
  queryLocalIp: () => Promise<QuickOpsQueryLocalIpGetResponse>
  portStatus: (
    request: QuickOpsPortStatusGetRequest,
  ) => Promise<QuickOpsPortStatusGetResponse>
  dnsQuery: (request: QuickOpsDnsQueryGetRequest) => Promise<QuickOpsDnsQueryGetResponse>
  fileHash: (request: QuickOpsFileHashGetRequest) => Promise<QuickOpsFileHashGetResponse>
  fileBase64: (
    request: QuickOpsFileBase64GetRequest,
  ) => Promise<QuickOpsFileBase64GetResponse>
  recentDownload: () => Promise<QuickOpsRecentDownloadGetResponse>
  commonDirectory: (
    request?: QuickOpsCommonDirectoryGetRequest,
  ) => Promise<QuickOpsCommonDirectoryGetResponse>
  pathFormat: (request: QuickOpsPathFormatGetRequest) => Promise<QuickOpsPathFormatGetResponse>
  formatText: (request: QuickOpsFormatTextGetRequest) => Promise<QuickOpsFormatTextGetResponse>
  networkStatus: () => Promise<QuickOpsNetworkStatusGetResponse>
  batteryStatus: () => Promise<QuickOpsBatteryStatusGetResponse>
  systemProxy: () => Promise<QuickOpsSystemProxyGetResponse>
  developerPreview: (
    request: QuickOpsDeveloperPreviewRequest,
  ) => Promise<QuickOpsDeveloperPreviewResponse>
  saveDeveloperPreview: (
    request: QuickOpsDeveloperPreviewSaveRequest,
  ) => Promise<QuickOpsDeveloperPreviewSaveResponse>
}

export function createQuickOpsSdk(transport: ITuffTransport): QuickOpsSdk {
  return {
    capabilities: () => transport.send(QuickOpsEvents.capabilities.get),
    sessions: () => transport.send(QuickOpsEvents.sessions.get),
    auditRecent: (request) => transport.send(QuickOpsEvents.audit.get, request ?? {}),
    systemInfo: () => transport.send(QuickOpsEvents.systemInfo.get),
    tuffDiagnostics: () => transport.send(QuickOpsEvents.tuffDiagnostics.get),
    diskSpace: () => transport.send(QuickOpsEvents.diskSpace.get),
    directoryUsage: (request) =>
      transport.send(QuickOpsEvents.directoryUsage.get, request),
    queryLocalIp: () => transport.send(QuickOpsEvents.queryLocalIp.get),
    portStatus: (request) =>
      transport.send(QuickOpsEvents.portStatus.get, request),
    dnsQuery: (request) => transport.send(QuickOpsEvents.dnsQuery.get, request),
    fileHash: (request) => transport.send(QuickOpsEvents.fileHash.get, request),
    fileBase64: (request) =>
      transport.send(QuickOpsEvents.fileBase64.get, request),
    recentDownload: () => transport.send(QuickOpsEvents.recentDownload.get),
    commonDirectory: (request) =>
      transport.send(QuickOpsEvents.commonDirectory.get, request),
    pathFormat: (request) =>
      transport.send(QuickOpsEvents.pathFormat.get, request),
    formatText: (request) =>
      transport.send(QuickOpsEvents.formatText.get, request),
    networkStatus: () => transport.send(QuickOpsEvents.networkStatus.get),
    batteryStatus: () => transport.send(QuickOpsEvents.batteryStatus.get),
    systemProxy: () => transport.send(QuickOpsEvents.systemProxy.get),
    developerPreview: (request) =>
      transport.send(QuickOpsEvents.developerPreview.get, request),
    saveDeveloperPreview: (request) =>
      transport.send(QuickOpsEvents.developerPreview.save, request),
  }
}
