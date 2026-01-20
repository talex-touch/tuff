export type NotificationChannel = 'system' | 'app' | 'user'

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'

export type NotificationAppPresentation
  = | 'toast'
    | 'dialog'
    | 'mention'
    | 'popper'
    | 'blow'
    | 'banner'

export type NotificationUserSource = 'nexus' | 'plugin' | 'app'

export interface NotificationAction {
  id: string
  label: string
}

export interface NotificationRequest {
  id?: string
  channel: NotificationChannel
  level?: NotificationLevel
  title?: string
  message: string
  actions?: NotificationAction[]
  dedupeKey?: string
  meta?: Record<string, any>
  app?: {
    presentation: NotificationAppPresentation
    duration?: number
    modal?: boolean
  }
  user?: {
    source?: NotificationUserSource
    persistent?: boolean
  }
  system?: {
    silent?: boolean
  }
  _sdkapi?: number
}

export interface NotificationResult {
  id: string
}

export interface NotificationUpdateRequest {
  id: string
  patch: Partial<NotificationRequest>
  channel?: NotificationChannel
}

export interface NotificationDismissRequest {
  id: string
  channel?: NotificationChannel
}

export interface NotificationInboxEntry {
  id: string
  source: NotificationUserSource
  title?: string
  message: string
  level?: NotificationLevel
  actions?: NotificationAction[]
  createdAt: number
  readAt?: number
  archivedAt?: number
  dedupeKey?: string
  payload?: Record<string, any>
}

export interface NotificationInboxListRequest {
  limit?: number
  offset?: number
  includeArchived?: boolean
  unreadOnly?: boolean
  source?: NotificationUserSource
}

export interface NotificationInboxListResponse {
  entries: NotificationInboxEntry[]
  total: number
  unread: number
}

export interface NotificationInboxMarkReadRequest {
  id: string
  read?: boolean
}

export interface NotificationInboxArchiveRequest {
  id: string
  archived?: boolean
}

export interface NotificationInboxDeleteRequest {
  id: string
}

export interface NotificationInboxDeleteResponse {
  success: boolean
}

export interface NotificationInboxClearRequest {
  includeArchived?: boolean
  unreadOnly?: boolean
}

export interface NotificationInboxClearResponse {
  success: boolean
  removed: number
}

export interface NotificationPushPayload {
  id: string
  request: NotificationRequest
}

export interface NotificationUpdatePayload {
  id: string
  patch: Partial<NotificationRequest>
}

export interface NotificationDismissPayload {
  id: string
}

export interface NotificationActionPayload {
  id: string
  actionId?: string
  channel: NotificationChannel
  source?: NotificationUserSource
}

export interface NotificationInboxUpdatedPayload {
  entry: NotificationInboxEntry
  total: number
  unread: number
}
