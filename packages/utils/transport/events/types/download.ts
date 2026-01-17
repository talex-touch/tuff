import type {
  DownloadConfig,
  DownloadHistory,
  DownloadRequest,
  DownloadStats,
  DownloadStatus,
  DownloadTask,
} from '../../../types/download'

export type DownloadAddTaskRequest = DownloadRequest

export type DownloadTaskPayload = DownloadTask

export interface DownloadOpResponse {
  success: boolean
  error?: string
}

export type DownloadAddTaskResponse = DownloadOpResponse & {
  taskId?: string
}

export interface DownloadTaskIdRequest {
  taskId: string
}

export type DownloadGetTasksResponse = DownloadOpResponse & {
  tasks?: DownloadTask[]
}

export type DownloadGetTaskStatusResponse = DownloadOpResponse & {
  task?: DownloadTask | null
}

export type DownloadGetConfigResponse = DownloadOpResponse & {
  config?: DownloadConfig
}

export type DownloadGetNotificationConfigResponse = DownloadOpResponse & {
  config?: unknown
}

export type DownloadGetHistoryResponse = DownloadOpResponse & {
  history?: DownloadHistory[]
}

export type DownloadGetLogsResponse = DownloadOpResponse & {
  logs?: unknown
}

export type DownloadGetErrorStatsResponse = DownloadOpResponse & {
  stats?: unknown
}

export type DownloadGetTempStatsResponse = DownloadOpResponse & {
  stats?: unknown
}

export interface DownloadGetTasksByStatusRequest {
  status: DownloadStatus
}

export interface DownloadUpdatePriorityRequest {
  taskId: string
  priority: number
}

export interface DownloadGetHistoryRequest {
  limit?: number
}

export interface DownloadClearHistoryItemRequest {
  historyId: string
}

export interface DownloadUpdateConfigRequest {
  config: DownloadConfig
}

export interface DownloadUpdateNotificationConfigRequest {
  config: unknown
}

export interface DownloadTaskRetryingPayload {
  taskId: string
  attempt: number
  error: string
  delay: number
}

export interface DownloadNotificationClickedPayload {
  taskId: string
  action: string
}

export type DownloadMigrationStatusResponse = DownloadOpResponse & {
  currentVersion?: number
  appliedMigrations?: unknown[]
}

export type DownloadMigrationNeededResponse = DownloadOpResponse & {
  needed?: boolean
}

export type DownloadMigrationStartResponse = DownloadOpResponse & {
  result?: { migrated: boolean }
}

export type DownloadMigrationRetryResponse = DownloadOpResponse & {
  result?: { migrated: boolean }
}

export type DownloadGetStatsResponse = DownloadOpResponse & {
  stats?: DownloadStats
}
