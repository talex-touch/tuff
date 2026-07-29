import type {
  AppPreviewChannel,
  BundledReleaseNotesState,
  CachedUpdateRecord,
  GitHubRelease,
  ReleaseNotesEntry,
  ReleaseNotesPage,
  UpdateCheckResult,
  UpdateLifecycleSnapshot,
  UpdateReleaseNotesChannel,
  UpdateSettings,
  UpdateUserAction,
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

export type UpdateLifecycleChangedPayload = UpdateLifecycleSnapshot

export type UpdateGetCachedReleaseResponse
  = UpdateOpResponse<CachedUpdateRecord | null>

export type UpdateGetBundledReleaseNotesResponse
  = UpdateOpResponse<BundledReleaseNotesState>

export interface UpdateListReleaseNotesRequest {
  channel: UpdateReleaseNotesChannel
  cursor?: string
  limit?: number
}

export type UpdateListReleaseNotesResponse = UpdateOpResponse<ReleaseNotesPage>

export interface UpdateGetReleaseNotesRequest {
  tag: string
}

export type UpdateGetReleaseNotesResponse = UpdateOpResponse<ReleaseNotesEntry>

export interface UpdateAcknowledgeReleaseNotesRequest {
  version: string
}

export type UpdateCheckResponse = UpdateOpResponse<UpdateCheckResult>

export type UpdateGetSettingsResponse = UpdateOpResponse<UpdateSettings>

export interface UpdateUpdateSettingsRequest {
  settings: Partial<UpdateSettings>
}
