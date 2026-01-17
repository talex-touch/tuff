import type {
  AppPreviewChannel,
  CachedUpdateRecord,
  GitHubRelease,
  UpdateCheckResult,
  UpdateSettings,
  UpdateUserAction,
} from '../../../types/update'

export type UpdateOpResponse<T = void> = {
  success: boolean
  data?: T
  error?: string
}

export type UpdateCheckRequest = {
  force?: boolean
}

export type UpdateGetStatusResponse = UpdateOpResponse<{
  enabled: boolean
  frequency: UpdateSettings['frequency']
  source: UpdateSettings['source']
  channel: AppPreviewChannel
  polling: boolean
  lastCheck: number | null
}>

export type UpdateCachedReleaseRequest = {
  channel?: AppPreviewChannel
}

export type UpdateRecordActionRequest = {
  tag: string
  action: UpdateUserAction
}

export type UpdateDownloadRequest = GitHubRelease

export type UpdateDownloadResponse = UpdateOpResponse<{
  taskId?: string
}>

export type UpdateInstallRequest = {
  taskId: string
}

export type UpdateIgnoreVersionRequest = {
  version: string
}

export type UpdateAutoDownloadRequest = {
  enabled: boolean
}

export type UpdateAutoCheckRequest = {
  enabled: boolean
}

export type UpdateAvailablePayload = {
  hasUpdate: boolean
  release: GitHubRelease
  source: string
  channel?: AppPreviewChannel
}

export type UpdateGetCachedReleaseResponse = UpdateOpResponse<CachedUpdateRecord | null>

export type UpdateCheckResponse = UpdateOpResponse<UpdateCheckResult>

export type UpdateGetSettingsResponse = UpdateOpResponse<UpdateSettings>

export type UpdateUpdateSettingsRequest = {
  settings: Partial<UpdateSettings>
}
