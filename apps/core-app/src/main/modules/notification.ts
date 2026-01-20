import type {
  MaybePromise,
  ModuleDestroyContext,
  ModuleInitContext,
  ModuleKey
} from '@talex-touch/utils'
import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport'
import type {
  NotificationActionPayload,
  NotificationChannel,
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
  NotificationRequest,
  NotificationUpdateRequest
} from '@talex-touch/utils/transport/events'
import type { NotificationAction as SystemNotificationAction } from 'electron'
import type { TalexEvents } from '../core/eventbus/touch-event'
import { randomUUID } from 'node:crypto'
import { StorageList } from '@talex-touch/utils'
import { getTuffTransportMain, NotificationEvents } from '@talex-touch/utils/transport'
import { Notification } from 'electron'
import { genTouchApp } from '../core'
import { BaseModule } from './abstract-base-module'
import { getPermissionModule } from './permission'
import { getMainConfig, saveMainConfig } from './storage'

const INBOX_MAX_ENTRIES = 500

interface NotificationInboxStats {
  total: number
  unread: number
}

function getKeyManager(value: unknown): unknown {
  if (!value || typeof value !== 'object') return undefined
  if (!('keyManager' in value)) return undefined
  return (value as { keyManager?: unknown }).keyManager
}

class NotificationInboxStore {
  private loaded = false
  private entries: NotificationInboxEntry[] = []

  private ensureLoaded(): void {
    if (this.loaded) return
    const data = getMainConfig(StorageList.NOTIFICATION_CENTER) as any
    if (Array.isArray(data)) {
      this.entries = data
    } else if (Array.isArray(data?.entries)) {
      this.entries = data.entries
    } else {
      this.entries = []
    }
    this.entries.sort((a, b) => b.createdAt - a.createdAt)
    this.loaded = true
  }

  private save(): void {
    saveMainConfig(StorageList.NOTIFICATION_CENTER, { entries: this.entries })
  }

  private stats(entries: NotificationInboxEntry[]): NotificationInboxStats {
    const unread = entries.reduce((count, entry) => count + (entry.readAt ? 0 : 1), 0)
    return { total: entries.length, unread }
  }

  private prune(): void {
    if (this.entries.length <= INBOX_MAX_ENTRIES) return
    this.entries = this.entries
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, INBOX_MAX_ENTRIES)
  }

  list(request: NotificationInboxListRequest = {}): NotificationInboxListResponse {
    this.ensureLoaded()
    const includeArchived = Boolean(request.includeArchived)
    const unreadOnly = Boolean(request.unreadOnly)
    const source = request.source

    const filtered = this.entries.filter((entry) => {
      if (!includeArchived && entry.archivedAt) return false
      if (unreadOnly && entry.readAt) return false
      if (source && entry.source !== source) return false
      return true
    })

    const offset = request.offset ?? 0
    const limit = request.limit ?? filtered.length
    const entries = filtered.slice(offset, offset + limit)
    const { total, unread } = this.stats(filtered)

    return { entries, total, unread }
  }

  getStats(): NotificationInboxStats {
    this.ensureLoaded()
    return this.stats(this.entries.filter((entry) => !entry.archivedAt))
  }

  has(id: string): boolean {
    this.ensureLoaded()
    return this.entries.some((entry) => entry.id === id)
  }

  add(entry: NotificationInboxEntry): NotificationInboxEntry {
    this.ensureLoaded()
    const existingIndex = entry.dedupeKey
      ? this.entries.findIndex((item) => item.dedupeKey === entry.dedupeKey && !item.archivedAt)
      : -1

    if (existingIndex >= 0) {
      const existing = this.entries[existingIndex]
      const merged: NotificationInboxEntry = {
        ...existing,
        ...entry,
        id: existing.id,
        readAt: undefined
      }
      this.entries.splice(existingIndex, 1)
      this.entries.unshift(merged)
      this.prune()
      this.save()
      return merged
    }

    this.entries.unshift(entry)
    this.prune()
    this.save()
    return entry
  }

  update(id: string, patch: Partial<NotificationRequest>): NotificationInboxEntry | null {
    this.ensureLoaded()
    const entry = this.entries.find((item) => item.id === id)
    if (!entry) return null

    entry.title = patch.title ?? entry.title
    entry.message = patch.message ?? entry.message
    entry.level = patch.level ?? entry.level
    entry.actions = patch.actions ?? entry.actions
    entry.dedupeKey = patch.dedupeKey ?? entry.dedupeKey
    entry.payload = patch.meta ?? entry.payload
    if (patch.user?.source) {
      entry.source = patch.user.source
    }

    this.save()
    return entry
  }

  markRead(request: NotificationInboxMarkReadRequest): NotificationInboxEntry | null {
    this.ensureLoaded()
    const entry = this.entries.find((item) => item.id === request.id)
    if (!entry) return null
    entry.readAt = request.read === false ? undefined : Date.now()
    this.save()
    return entry
  }

  archive(request: NotificationInboxArchiveRequest): NotificationInboxEntry | null {
    this.ensureLoaded()
    const entry = this.entries.find((item) => item.id === request.id)
    if (!entry) return null
    entry.archivedAt = request.archived === false ? undefined : Date.now()
    this.save()
    return entry
  }

  delete(request: NotificationInboxDeleteRequest): NotificationInboxDeleteResponse {
    this.ensureLoaded()
    const before = this.entries.length
    this.entries = this.entries.filter((item) => item.id !== request.id)
    const success = this.entries.length !== before
    if (success) this.save()
    return { success }
  }

  clear(request: NotificationInboxClearRequest = {}): NotificationInboxClearResponse {
    this.ensureLoaded()
    const includeArchived = Boolean(request.includeArchived)
    const unreadOnly = Boolean(request.unreadOnly)

    const before = this.entries.length
    this.entries = this.entries.filter((entry) => {
      if (!includeArchived && entry.archivedAt) return true
      if (unreadOnly && entry.readAt) return true
      return false
    })
    const removed = before - this.entries.length
    if (removed > 0) this.save()
    return { success: true, removed }
  }
}

export class NotificationModule extends BaseModule {
  static key: ModuleKey = Symbol.for('Notification')
  name: ModuleKey = NotificationModule.key

  private transport: ITuffTransportMain | null = null
  private transportDisposers: Array<() => void> = []
  private inbox = new NotificationInboxStore()
  private systemNotifications = new Map<string, Notification>()
  private systemRequests = new Map<string, NotificationRequest>()

  constructor() {
    super(NotificationModule.key, { create: true, dirName: 'notification' })
  }

  onInit(_ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    const app = genTouchApp()
    const channel = (app as any).channel as any
    this.transport = getTuffTransportMain(channel, getKeyManager(channel) ?? channel)
    this.registerTransportHandlers()
  }

  onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): MaybePromise<void> {
    for (const dispose of this.transportDisposers) {
      dispose()
    }
    this.transportDisposers = []
    this.transport = null
    this.systemNotifications.clear()
    this.systemRequests.clear()
  }

  private registerTransportHandlers(): void {
    if (!this.transport) return

    this.transportDisposers.push(
      this.transport.on(NotificationEvents.api.notify, (payload, context) =>
        this.handleNotify(payload, context)
      ),
      this.transport.on(NotificationEvents.api.update, (payload, context) =>
        this.handleUpdate(payload, context)
      ),
      this.transport.on(NotificationEvents.api.dismiss, (payload, context) =>
        this.handleDismiss(payload, context)
      ),
      this.transport.on(NotificationEvents.api.action, (payload, context) =>
        this.handleAction(payload, context)
      ),
      this.transport.on(NotificationEvents.inbox.list, (payload) => this.inbox.list(payload ?? {})),
      this.transport.on(NotificationEvents.inbox.markRead, (payload) =>
        this.handleInboxMarkRead(payload)
      ),
      this.transport.on(NotificationEvents.inbox.archive, (payload) =>
        this.handleInboxArchive(payload)
      ),
      this.transport.on(NotificationEvents.inbox.delete, (payload) => this.inbox.delete(payload)),
      this.transport.on(NotificationEvents.inbox.clear, (payload) =>
        this.inbox.clear(payload ?? {})
      )
    )
  }

  private handleNotify(payload: NotificationRequest, context: HandlerContext) {
    const id = payload.id ?? randomUUID()
    const request: NotificationRequest = { ...payload, id }

    if (request.channel === 'system') {
      this.enforceSystemPermission(context, request)
      this.showSystemNotification(request)
    } else if (request.channel === 'app') {
      this.transport?.broadcast(NotificationEvents.push.notify, { id, request })
    } else if (request.channel === 'user') {
      this.handleUserNotification(request, context)
    }

    return { id }
  }

  private handleUpdate(payload: NotificationUpdateRequest, context: HandlerContext) {
    const channel = this.resolveChannel(payload.channel, payload.id)
    if (channel === 'system') {
      this.enforceSystemPermission(context, this.systemRequests.get(payload.id) ?? payload.patch)
      const previous = this.systemRequests.get(payload.id)
      const next = this.mergeRequest(previous, payload.patch, payload.id)
      this.dismissSystemNotification(payload.id)
      this.showSystemNotification(next)
    } else if (channel === 'app') {
      this.transport?.broadcast(NotificationEvents.push.update, {
        id: payload.id,
        patch: payload.patch
      })
    } else if (channel === 'user') {
      const updated = this.inbox.update(payload.id, payload.patch)
      if (updated) {
        const stats = this.inbox.getStats()
        this.transport?.broadcast(NotificationEvents.push.inboxUpdated, {
          entry: updated,
          ...stats
        })
      }
    }

    return { id: payload.id }
  }

  private handleDismiss(payload: NotificationDismissRequest, context: HandlerContext) {
    const channel = this.resolveChannel(payload.channel, payload.id)
    if (channel === 'system') {
      this.enforceSystemPermission(context, this.systemRequests.get(payload.id))
      this.dismissSystemNotification(payload.id)
    } else if (channel === 'app') {
      this.transport?.broadcast(NotificationEvents.push.dismiss, { id: payload.id })
    } else if (channel === 'user') {
      const updated = this.inbox.archive({ id: payload.id })
      if (updated) {
        const stats = this.inbox.getStats()
        this.transport?.broadcast(NotificationEvents.push.inboxUpdated, {
          entry: updated,
          ...stats
        })
      }
    }

    return { id: payload.id }
  }

  private handleAction(payload: NotificationActionPayload, context: HandlerContext) {
    const source = payload.source ?? (context.plugin ? 'plugin' : 'app')
    this.transport?.broadcast(NotificationEvents.push.action, { ...payload, source })
  }

  private handleUserNotification(request: NotificationRequest, context: HandlerContext): void {
    if (request.user?.persistent === false) return
    const entry: NotificationInboxEntry = {
      id: request.id ?? randomUUID(),
      source: request.user?.source ?? (context.plugin ? 'plugin' : 'app'),
      title: request.title,
      message: request.message,
      level: request.level,
      actions: request.actions,
      createdAt: Date.now(),
      dedupeKey: request.dedupeKey,
      payload: request.meta
    }
    const stored = this.inbox.add(entry)
    const stats = this.inbox.getStats()
    this.transport?.broadcast(NotificationEvents.push.inboxUpdated, {
      entry: stored,
      ...stats
    })
  }

  private handleInboxMarkRead(
    request: NotificationInboxMarkReadRequest
  ): NotificationInboxEntry | null {
    const entry = this.inbox.markRead(request)
    if (entry) {
      const stats = this.inbox.getStats()
      this.transport?.broadcast(NotificationEvents.push.inboxUpdated, {
        entry,
        ...stats
      })
    }
    return entry
  }

  private handleInboxArchive(
    request: NotificationInboxArchiveRequest
  ): NotificationInboxEntry | null {
    const entry = this.inbox.archive(request)
    if (entry) {
      const stats = this.inbox.getStats()
      this.transport?.broadcast(NotificationEvents.push.inboxUpdated, {
        entry,
        ...stats
      })
    }
    return entry
  }

  private resolveChannel(
    channel: NotificationChannel | undefined,
    id: string
  ): NotificationChannel {
    if (channel) return channel
    if (this.systemRequests.has(id) || this.systemNotifications.has(id)) return 'system'
    if (this.inbox.has(id)) return 'user'
    return 'app'
  }

  private mergeRequest(
    previous: NotificationRequest | undefined,
    patch: Partial<NotificationRequest>,
    id: string
  ): NotificationRequest {
    const app = previous?.app || patch.app
    const mergedApp: NotificationRequest['app'] | undefined = app
      ? {
          presentation: previous?.app?.presentation ?? patch.app?.presentation ?? 'toast',
          duration: patch.app?.duration ?? previous?.app?.duration,
          modal: patch.app?.modal ?? previous?.app?.modal
        }
      : undefined
    return {
      ...previous,
      ...patch,
      id,
      channel: previous?.channel ?? patch.channel ?? 'system',
      message: patch.message ?? previous?.message ?? '',
      app: mergedApp,
      user: {
        ...previous?.user,
        ...patch.user
      },
      system: {
        ...previous?.system,
        ...patch.system
      }
    }
  }

  private showSystemNotification(request: NotificationRequest): void {
    const id = request.id ?? randomUUID()
    this.systemRequests.set(id, request)
    if (!Notification.isSupported()) return
    const actions: SystemNotificationAction[] =
      request.actions?.map((action) => ({
        type: 'button',
        text: action.label
      })) ?? []
    const notification = new Notification({
      title: request.title ?? '',
      body: request.message ?? '',
      actions,
      silent: request.system?.silent ?? false
    })

    notification.on('click', () => {
      this.transport?.broadcast(NotificationEvents.push.action, {
        id,
        channel: 'system'
      })
    })

    notification.on('action', (_event, index) => {
      const actionId = request.actions?.[index]?.id
      this.transport?.broadcast(NotificationEvents.push.action, {
        id,
        actionId,
        channel: 'system'
      })
    })

    notification.on('close', () => {
      this.systemNotifications.delete(id)
      this.systemRequests.delete(id)
    })

    notification.show()
    this.systemNotifications.set(id, notification)
  }

  private dismissSystemNotification(id: string): void {
    const existing = this.systemNotifications.get(id)
    if (existing) {
      existing.close()
      this.systemNotifications.delete(id)
    }
    this.systemRequests.delete(id)
  }

  private enforceSystemPermission(
    context: HandlerContext,
    request?: Partial<NotificationRequest>
  ): void {
    const pluginId = context.plugin?.name
    if (!pluginId) return
    const permissionModule = getPermissionModule()
    if (!permissionModule) return
    const sdkapi = request?._sdkapi
    permissionModule.enforcePermission(pluginId, 'notification:system:notify', sdkapi)
  }
}

export const notificationModule = new NotificationModule()
export default notificationModule
