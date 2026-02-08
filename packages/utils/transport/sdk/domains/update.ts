import type { AppPreviewChannel, CachedUpdateRecord, GitHubRelease, UpdateCheckResult, UpdateSettings, UpdateUserAction } from '../../../types/update'
import type {
  UpdateAvailablePayload,
  UpdateCheckResponse,
  UpdateGetCachedReleaseResponse,
  UpdateGetSettingsResponse,
  UpdateGetStatusResponse,
  UpdateIgnoreVersionRequest,
  UpdateInstallRequest,
  UpdateOpResponse,
} from '../../events/types/update'
import type { ITuffTransport } from '../../types'
import { UpdateEvents } from '../../events'

export interface UpdateSdk {
  check: (payload?: { force?: boolean }) => Promise<UpdateCheckResponse>
  getSettings: () => Promise<UpdateGetSettingsResponse>
  updateSettings: (settings: Partial<UpdateSettings>) => Promise<UpdateOpResponse>
  getStatus: () => Promise<UpdateGetStatusResponse>
  clearCache: () => Promise<UpdateOpResponse>
  getCachedRelease: (payload?: { channel?: AppPreviewChannel }) => Promise<UpdateGetCachedReleaseResponse>
  recordAction: (payload: { tag: string, action: UpdateUserAction }) => Promise<UpdateOpResponse>
  download: (release: GitHubRelease) => Promise<UpdateOpResponse<{ taskId?: string }>>
  install: (payload: UpdateInstallRequest) => Promise<UpdateOpResponse>
  ignoreVersion: (payload: UpdateIgnoreVersionRequest) => Promise<UpdateOpResponse>
  setAutoDownload: (enabled: boolean) => Promise<UpdateOpResponse>
  setAutoCheck: (enabled: boolean) => Promise<UpdateOpResponse>
  onAvailable: (handler: (payload: UpdateAvailablePayload) => void) => () => void
}

export function createUpdateSdk(transport: ITuffTransport): UpdateSdk {
  return {
    check: payload => transport.send(UpdateEvents.check, payload ?? {}),
    getSettings: () => transport.send(UpdateEvents.getSettings),
    updateSettings: settings => transport.send(UpdateEvents.updateSettings, { settings }),
    getStatus: () => transport.send(UpdateEvents.getStatus),
    clearCache: () => transport.send(UpdateEvents.clearCache),
    getCachedRelease: payload => transport.send(UpdateEvents.getCachedRelease, payload ?? {}),
    recordAction: payload => transport.send(UpdateEvents.recordAction, payload),
    download: release => transport.send(UpdateEvents.download, release),
    install: payload => transport.send(UpdateEvents.install, payload),
    ignoreVersion: payload => transport.send(UpdateEvents.ignoreVersion, payload),
    setAutoDownload: enabled => transport.send(UpdateEvents.setAutoDownload, { enabled }),
    setAutoCheck: enabled => transport.send(UpdateEvents.setAutoCheck, { enabled }),
    onAvailable: handler => transport.on(UpdateEvents.available, handler),
  }
}

export type {
  UpdateAvailablePayload,
  UpdateCheckResponse,
  UpdateGetCachedReleaseResponse,
  UpdateGetSettingsResponse,
  UpdateGetStatusResponse,
  UpdateOpResponse,
}

export type {
  AppPreviewChannel,
  CachedUpdateRecord,
  UpdateCheckResult,
  UpdateSettings,
  UpdateUserAction,
}
