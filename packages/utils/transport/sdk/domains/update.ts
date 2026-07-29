import type {
  AppPreviewChannel,
  BundledReleaseNotesState,
  CachedUpdateRecord,
  ReleaseNotesEntry,
  ReleaseNotesPage,
  UpdateCheckResult,
  UpdateReleaseNotesChannel,
  UpdateSettings,
  UpdateUserAction,
} from '../../../types/update'
import type {
  UpdateAvailablePayload,
  UpdateCheckResponse,
  UpdateDownloadRequest,
  UpdateGetBundledReleaseNotesResponse,
  UpdateGetCachedReleaseResponse,
  UpdateGetReleaseNotesResponse,
  UpdateGetSettingsResponse,
  UpdateGetStatusResponse,
  UpdateIgnoreVersionRequest,
  UpdateInstallRequest,
  UpdateLifecycleChangedPayload,
  UpdateListReleaseNotesResponse,
  UpdateOpResponse,
} from '../../events/types/update'
import type { ITuffTransport } from '../../types'
import { UpdateEvents } from '../../events'

export interface UpdateSdk {
  check: (payload?: { force?: boolean }) => Promise<UpdateCheckResponse>
  getSettings: () => Promise<UpdateGetSettingsResponse>
  updateSettings: (
    settings: Partial<UpdateSettings>,
  ) => Promise<UpdateOpResponse>
  getStatus: () => Promise<UpdateGetStatusResponse>
  clearCache: () => Promise<UpdateOpResponse>
  getCachedRelease: (payload?: {
    channel?: AppPreviewChannel
  }) => Promise<UpdateGetCachedReleaseResponse>
  getBundledReleaseNotes: () => Promise<UpdateGetBundledReleaseNotesResponse>
  listReleaseNotes: (payload: {
    channel: UpdateReleaseNotesChannel
    cursor?: string
    limit?: number
  }) => Promise<UpdateListReleaseNotesResponse>
  getReleaseNotes: (payload: { tag: string }) => Promise<UpdateGetReleaseNotesResponse>
  acknowledgeReleaseNotes: (payload: { version: string }) => Promise<UpdateOpResponse>
  recordAction: (payload: {
    tag: string
    action: UpdateUserAction
  }) => Promise<UpdateOpResponse>
  download: (
    payload: UpdateDownloadRequest,
  ) => Promise<UpdateOpResponse<{ taskId?: string }>>
  install: (payload: UpdateInstallRequest) => Promise<UpdateOpResponse>
  ignoreVersion: (
    payload: UpdateIgnoreVersionRequest,
  ) => Promise<UpdateOpResponse>
  setAutoDownload: (enabled: boolean) => Promise<UpdateOpResponse>
  setAutoCheck: (enabled: boolean) => Promise<UpdateOpResponse>
  onAvailable: (
    handler: (payload: UpdateAvailablePayload) => void,
  ) => () => void
  onLifecycleChanged: (
    handler: (payload: UpdateLifecycleChangedPayload) => void,
  ) => () => void
}

export function createUpdateSdk(transport: ITuffTransport): UpdateSdk {
  return {
    check: payload => transport.send(UpdateEvents.check, payload ?? {}),
    getSettings: () => transport.send(UpdateEvents.getSettings),
    updateSettings: settings =>
      transport.send(UpdateEvents.updateSettings, { settings }),
    getStatus: () => transport.send(UpdateEvents.getStatus),
    clearCache: () => transport.send(UpdateEvents.clearCache),
    getCachedRelease: payload =>
      transport.send(UpdateEvents.getCachedRelease, payload ?? {}),
    getBundledReleaseNotes: () =>
      transport.send(UpdateEvents.getBundledReleaseNotes),
    listReleaseNotes: payload =>
      transport.send(UpdateEvents.listReleaseNotes, payload),
    getReleaseNotes: payload =>
      transport.send(UpdateEvents.getReleaseNotes, payload),
    acknowledgeReleaseNotes: payload =>
      transport.send(UpdateEvents.acknowledgeReleaseNotes, payload),
    recordAction: payload =>
      transport.send(UpdateEvents.recordAction, payload),
    download: payload => transport.send(UpdateEvents.download, payload),
    install: payload => transport.send(UpdateEvents.install, payload),
    ignoreVersion: payload =>
      transport.send(UpdateEvents.ignoreVersion, payload),
    setAutoDownload: enabled =>
      transport.send(UpdateEvents.setAutoDownload, { enabled }),
    setAutoCheck: enabled =>
      transport.send(UpdateEvents.setAutoCheck, { enabled }),
    onAvailable: handler => transport.on(UpdateEvents.available, handler),
    onLifecycleChanged: handler =>
      transport.on(UpdateEvents.lifecycleChanged, handler),
  }
}

export type {
  UpdateAvailablePayload,
  UpdateCheckResponse,
  UpdateGetBundledReleaseNotesResponse,
  UpdateGetCachedReleaseResponse,
  UpdateGetReleaseNotesResponse,
  UpdateGetSettingsResponse,
  UpdateGetStatusResponse,
  UpdateLifecycleChangedPayload,
  UpdateListReleaseNotesResponse,
  UpdateOpResponse,
}

export type {
  AppPreviewChannel,
  BundledReleaseNotesState,
  CachedUpdateRecord,
  ReleaseNotesEntry,
  ReleaseNotesPage,
  UpdateCheckResult,
  UpdateReleaseNotesChannel,
  UpdateSettings,
  UpdateUserAction,
}
