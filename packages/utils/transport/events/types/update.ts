import type {
  AppPreviewChannel,
  CachedUpdateRecord,
  GitHubRelease,
  UpdateCheckResult,
  UpdateSettings,
  UpdateUserAction,
} from '../../../types/update'

export interface UpdateOpResponse<T = void> {
  success: boolean
  data?: T
  error?: string
}

export interface UpdateCheckRequest {
  force?: boolean
}

export type UpdateGetStatusResponse = UpdateOpResponse<{
  enabled: boolean
  frequency: UpdateSettings['frequency']
  source: UpdateSettings['source']
  channel: AppPreviewChannel
  polling: boolean
  lastCheck: number | null
  downloadReady?: boolean
  downloadReadyVersion?: string | null
  downloadTaskId?: string | null
}>

export interface UpdateCachedReleaseRequest {
  channel?: AppPreviewChannel
}

export interface UpdateRecordActionRequest {
  tag: string
  action: UpdateUserAction
}

export type UpdateDownloadRequest = GitHubRelease

export type UpdateDownloadResponse = UpdateOpResponse<{
  taskId?: string
}>

export interface UpdateInstallRequest {
  taskId?: string
}

export interface UpdateIgnoreVersionRequest {
  version: string
}

export interface UpdateAutoDownloadRequest {
  enabled: boolean
}

export interface UpdateAutoCheckRequest {
  enabled: boolean
}

export interface UpdateAvailablePayload {
  hasUpdate: boolean
  release: GitHubRelease
  source: string
  channel?: AppPreviewChannel
}

export type UpdateGetCachedReleaseResponse = UpdateOpResponse<CachedUpdateRecord | null>

export type UpdateCheckResponse = UpdateOpResponse<UpdateCheckResult>

export type UpdateGetSettingsResponse = UpdateOpResponse<UpdateSettings>

export interface UpdateUpdateSettingsRequest {
  settings: Partial<UpdateSettings>
}
