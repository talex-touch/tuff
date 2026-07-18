import type {
  AppPreviewChannel,
  CachedUpdateRecord,
  GitHubRelease,
  UpdateCheckResult,
  UpdateLifecycleSnapshot,
  UpdateSettings,
  UpdateUserAction
} from '../../../types/update'

export interface UpdateOpResponse<T = void> {
  success: boolean
  data?: T
  error?: string
  errorCode?: string
  retryable?: boolean
  snapshot?: UpdateLifecycleSnapshot
}

export interface UpdateCheckRequest {
  force?: boolean
}

export type UpdateGetStatusResponse = UpdateOpResponse<UpdateLifecycleSnapshot>

export interface UpdateCachedReleaseRequest {
  channel?: AppPreviewChannel
}

export interface UpdateRecordActionRequest {
  tag: string
  action: UpdateUserAction
}

export interface UpdateDownloadRequest {
  tag: string
}

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
  snapshot: UpdateLifecycleSnapshot
  channel?: AppPreviewChannel
}

export type UpdateGetCachedReleaseResponse = UpdateOpResponse<CachedUpdateRecord | null>

export type UpdateCheckResponse = UpdateOpResponse<UpdateCheckResult>

export type UpdateGetSettingsResponse = UpdateOpResponse<UpdateSettings>

export interface UpdateUpdateSettingsRequest {
  settings: Partial<UpdateSettings>
}
