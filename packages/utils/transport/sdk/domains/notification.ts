import type {
  NotificationActionPayload,
  NotificationDismissPayload,
  NotificationDismissRequest,
  NotificationInboxArchiveRequest,
  NotificationInboxClearRequest,
  NotificationInboxClearResponse,
  NotificationInboxDeleteRequest,
  NotificationInboxDeleteResponse,
  NotificationInboxEntry,
  NotificationInboxListRequest,
  NotificationInboxListResponse,
  NotificationInboxMarkReadRequest,
  NotificationInboxUpdatedPayload,
  NotificationPushPayload,
  NotificationRequest,
  NotificationResult,
  NotificationUpdatePayload,
  NotificationUpdateRequest,
} from '../../events/types'
import type { ITuffTransport } from '../../types'
import { NotificationEvents } from '../../events'

export interface NotificationSdk {
  notify: (request: NotificationRequest) => Promise<NotificationResult>
  update: (request: NotificationUpdateRequest) => Promise<NotificationResult>
  dismiss: (request: NotificationDismissRequest) => Promise<NotificationResult>
  reportAction: (payload: NotificationActionPayload) => Promise<void>

  listInbox: (request?: NotificationInboxListRequest) => Promise<NotificationInboxListResponse>
  markRead: (request: NotificationInboxMarkReadRequest) => Promise<NotificationInboxEntry | null>
  archive: (request: NotificationInboxArchiveRequest) => Promise<NotificationInboxEntry | null>
  delete: (request: NotificationInboxDeleteRequest) => Promise<NotificationInboxDeleteResponse>
  clear: (request?: NotificationInboxClearRequest) => Promise<NotificationInboxClearResponse>

  onNotify: (handler: (payload: NotificationPushPayload) => void) => () => void
  onUpdate: (handler: (payload: NotificationUpdatePayload) => void) => () => void
  onDismiss: (handler: (payload: NotificationDismissPayload) => void) => () => void
  onAction: (handler: (payload: NotificationActionPayload) => void) => () => void
  onInboxUpdated: (handler: (payload: NotificationInboxUpdatedPayload) => void) => () => void
}

export function createNotificationSdk(transport: ITuffTransport): NotificationSdk {
  return {
    notify: request => transport.send(NotificationEvents.api.notify, request),
    update: request => transport.send(NotificationEvents.api.update, request),
    dismiss: request => transport.send(NotificationEvents.api.dismiss, request),
    reportAction: payload => transport.send(NotificationEvents.api.action, payload),

    listInbox: request => transport.send(NotificationEvents.inbox.list, request ?? {}),
    markRead: request => transport.send(NotificationEvents.inbox.markRead, request),
    archive: request => transport.send(NotificationEvents.inbox.archive, request),
    delete: request => transport.send(NotificationEvents.inbox.delete, request),
    clear: request => transport.send(NotificationEvents.inbox.clear, request ?? {}),

    onNotify: handler => transport.on(NotificationEvents.push.notify, handler),
    onUpdate: handler => transport.on(NotificationEvents.push.update, handler),
    onDismiss: handler => transport.on(NotificationEvents.push.dismiss, handler),
    onAction: handler => transport.on(NotificationEvents.push.action, handler),
    onInboxUpdated: handler => transport.on(NotificationEvents.push.inboxUpdated, handler),
  }
}
