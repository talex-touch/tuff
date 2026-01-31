import type {
  PluginApiFeatureInputChangedRequest,
  PluginApiGetManifestRequest,
  PluginApiGetManifestResponse,
  PluginApiGetOfficialListRequest,
  PluginApiGetOfficialListResponse,
  PluginApiGetPathsRequest,
  PluginApiGetPathsResponse,
  PluginApiGetPerformanceRequest,
  PluginApiGetPerformanceResponse,
  PluginApiGetRequest,
  PluginApiGetResponse,
  PluginApiGetRuntimeStatsRequest,
  PluginApiGetRuntimeStatsResponse,
  PluginApiGetStatusRequest,
  PluginApiGetStatusResponse,
  PluginApiInstallRequest,
  PluginApiInstallResponse,
  PluginApiListRequest,
  PluginApiListResponse,
  PluginApiOpenFolderRequest,
  PluginApiOpenPathRequest,
  PluginApiOpenPathResponse,
  PluginApiRevealPathRequest,
  PluginApiRevealPathResponse,
  PluginApiRegisterWidgetRequest,
  PluginApiRegisterWidgetResponse,
  PluginApiOperationRequest,
  PluginApiOperationResponse,
  PluginApiSaveManifestRequest,
  PluginApiSaveManifestResponse,
  PluginApiSaveWidgetFileRequest,
  PluginApiSaveWidgetFileResponse,
  PluginApiTriggerFeatureRequest,
  PluginDevServerStatusRequest,
  PluginDevServerStatusResponse,
  PluginInstallConfirmPayload,
  PluginInstallConfirmResponsePayload,
  PluginInstallProgressPayload,
  PluginInstallSourceRequest,
  PluginInstallSourceResponse,
  PluginPushStateChangedPayload,
  PluginPushStatusUpdatedPayload,
  PluginReconnectDevServerRequest,
  PluginReconnectDevServerResponse,
} from '../../events/types'
import type { ITuffTransport } from '../../types'
import { PluginEvents } from '../../events'

export interface PluginSdk {
  list: (request?: PluginApiListRequest) => Promise<PluginApiListResponse>
  get: (request: PluginApiGetRequest) => Promise<PluginApiGetResponse>
  getStatus: (request: PluginApiGetStatusRequest) => Promise<PluginApiGetStatusResponse>

  enable: (request: PluginApiOperationRequest) => Promise<PluginApiOperationResponse>
  disable: (request: PluginApiOperationRequest) => Promise<PluginApiOperationResponse>
  reload: (request: PluginApiOperationRequest) => Promise<PluginApiOperationResponse>
  install: (request: PluginApiInstallRequest) => Promise<PluginApiInstallResponse>
  uninstall: (request: PluginApiOperationRequest) => Promise<PluginApiOperationResponse>

  triggerFeature: (request: PluginApiTriggerFeatureRequest) => Promise<unknown>
  registerWidget: (request: PluginApiRegisterWidgetRequest) => Promise<PluginApiRegisterWidgetResponse>
  featureInputChanged: (request: PluginApiFeatureInputChangedRequest) => Promise<void>

  openFolder: (request: PluginApiOpenFolderRequest) => Promise<void>

  getOfficialList: (request?: PluginApiGetOfficialListRequest) => Promise<PluginApiGetOfficialListResponse>
  getManifest: (request: PluginApiGetManifestRequest) => Promise<PluginApiGetManifestResponse>
  saveManifest: (request: PluginApiSaveManifestRequest) => Promise<PluginApiSaveManifestResponse>
  saveWidgetFile: (request: PluginApiSaveWidgetFileRequest) => Promise<PluginApiSaveWidgetFileResponse>
  getPaths: (request: PluginApiGetPathsRequest) => Promise<PluginApiGetPathsResponse>
  openPath: (request: PluginApiOpenPathRequest) => Promise<PluginApiOpenPathResponse>
  revealPath: (request: PluginApiRevealPathRequest) => Promise<PluginApiRevealPathResponse>
  getPerformance: (request: PluginApiGetPerformanceRequest) => Promise<PluginApiGetPerformanceResponse>
  getRuntimeStats: (request: PluginApiGetRuntimeStatsRequest) => Promise<PluginApiGetRuntimeStatsResponse>

  reconnectDevServer: (request: PluginReconnectDevServerRequest) => Promise<PluginReconnectDevServerResponse>
  getDevServerStatus: (request: PluginDevServerStatusRequest) => Promise<PluginDevServerStatusResponse>

  onStateChanged: (handler: (payload: PluginPushStateChangedPayload) => void) => () => void
  onStatusUpdated: (handler: (payload: PluginPushStatusUpdatedPayload) => void) => () => void

  onInstallProgress: (handler: (payload: PluginInstallProgressPayload) => void) => () => void
  onInstallConfirm: (handler: (payload: PluginInstallConfirmPayload) => void) => () => void
  sendInstallConfirmResponse: (payload: PluginInstallConfirmResponsePayload) => Promise<void>

  installFromSource: (payload: PluginInstallSourceRequest) => Promise<PluginInstallSourceResponse>
}

export function createPluginSdk(transport: ITuffTransport): PluginSdk {
  return {
    list: async request => transport.send(PluginEvents.api.list, request ?? {}),
    get: async request => transport.send(PluginEvents.api.get, request),
    getStatus: async request => transport.send(PluginEvents.api.getStatus, request),

    enable: async request => transport.send(PluginEvents.api.enable, request),
    disable: async request => transport.send(PluginEvents.api.disable, request),
    reload: async request => transport.send(PluginEvents.api.reload, request),
    install: async request => transport.send(PluginEvents.api.install, request),
    uninstall: async request => transport.send(PluginEvents.api.uninstall, request),

    triggerFeature: async request => transport.send(PluginEvents.api.triggerFeature, request),
    registerWidget: async request => transport.send(PluginEvents.api.registerWidget, request),
    featureInputChanged: async request => transport.send(PluginEvents.api.featureInputChanged, request),

    openFolder: async request => transport.send(PluginEvents.api.openFolder, request),

    getOfficialList: async request => transport.send(PluginEvents.api.getOfficialList, request ?? {}),
    getManifest: async request => transport.send(PluginEvents.api.getManifest, request),
    saveManifest: async request => transport.send(PluginEvents.api.saveManifest, request),
    saveWidgetFile: async request => transport.send(PluginEvents.api.saveWidgetFile, request),
    getPaths: async request => transport.send(PluginEvents.api.getPaths, request),
    openPath: async request => transport.send(PluginEvents.api.openPath, request),
    revealPath: async request => transport.send(PluginEvents.api.revealPath, request),
    getPerformance: async request => transport.send(PluginEvents.api.getPerformance, request),
    getRuntimeStats: async request => transport.send(PluginEvents.api.getRuntimeStats, request),

    reconnectDevServer: async request => transport.send(PluginEvents.devServer.reconnect, request),
    getDevServerStatus: async request => transport.send(PluginEvents.devServer.status, request),

    onStateChanged: handler =>
      transport.on(PluginEvents.push.stateChanged, (payload) => {
        handler(payload)
      }),
    onStatusUpdated: handler =>
      transport.on(PluginEvents.push.statusUpdated, (payload) => {
        handler(payload)
      }),

    onInstallProgress: handler =>
      transport.on(PluginEvents.install.progress, (payload) => {
        handler(payload)
      }),
    onInstallConfirm: handler =>
      transport.on(PluginEvents.install.confirm, (payload) => {
        handler(payload)
      }),
    sendInstallConfirmResponse: async (payload) => {
      await transport.send(PluginEvents.install.confirmResponse, payload)
    },

    installFromSource: async payload => transport.send(PluginEvents.install.source, payload),
  }
}
