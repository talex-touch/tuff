import type { ITuffTransport } from '@talex-touch/utils/transport'
import type {
  NotificationAppPresentation,
  NotificationDismissPayload,
  NotificationPushPayload,
  NotificationRequest,
  NotificationUpdatePayload
} from '@talex-touch/utils/transport/events'
import { NotificationEvents } from '@talex-touch/utils/transport/events'
import { toast } from 'vue-sonner'
import {
  blowMention,
  forDialogMention,
  forTouchTip,
  popperMention
} from '../mention/dialog-mention'

const notificationCache = new Map<string, NotificationRequest>()

function resolvePresentation(request: NotificationRequest): NotificationAppPresentation {
  return request.app?.presentation ?? 'toast'
}

function resolveToastMessage(request: NotificationRequest): { text: string; description?: string } {
  if (request.title && request.message) {
    return { text: request.title, description: request.message }
  }
  return { text: request.message || request.title || '' }
}

function showToast(id: string, request: NotificationRequest): void {
  const { text, description } = resolveToastMessage(request)
  const options: Record<string, any> = {
    id,
    description
  }
  if (request.app?.duration !== undefined) {
    options.duration = request.app.duration
  }

  switch (request.level) {
    case 'success':
      toast.success(text, options)
      break
    case 'warning':
      toast.warning(text, options)
      break
    case 'error':
      toast.error(text, options)
      break
    default:
      toast.info(text, options)
      break
  }
}

function mergeRequest(
  base: NotificationRequest | undefined,
  patch: Partial<NotificationRequest>,
  id: string
): NotificationRequest {
  const app = base?.app || patch.app
  return {
    ...base,
    ...patch,
    id,
    channel: base?.channel ?? patch.channel ?? 'app',
    message: patch.message ?? base?.message ?? '',
    app: app
      ? {
          presentation: base?.app?.presentation ?? patch.app?.presentation ?? 'toast',
          duration: patch.app?.duration ?? base?.app?.duration,
          modal: patch.app?.modal ?? base?.app?.modal
        }
      : undefined,
    user: {
      ...base?.user,
      ...patch.user
    },
    system: {
      ...base?.system,
      ...patch.system
    }
  }
}

async function showDialog(request: NotificationRequest, transport: ITuffTransport, id: string) {
  if (!request.title) {
    request.title = 'Notification'
  }
  const buttons = request.actions?.map((action) => ({
    content: action.label,
    type: request.level ?? 'info',
    onClick: async () => {
      await transport.send(NotificationEvents.api.action, {
        id,
        actionId: action.id,
        channel: 'app'
      })
      return true
    }
  }))
  await forDialogMention(request.title, request.message, null, buttons)
}

async function showMention(request: NotificationRequest, transport: ITuffTransport, id: string) {
  const title = request.title ?? 'Notification'
  const buttons = request.actions?.map((action) => ({
    content: action.label,
    type: request.level ?? 'info',
    onClick: async () => {
      await transport.send(NotificationEvents.api.action, {
        id,
        actionId: action.id,
        channel: 'app'
      })
      return true
    }
  }))
  await forTouchTip(title, request.message, buttons)
}

async function showBlow(request: NotificationRequest) {
  const title = request.title ?? 'Notification'
  await blowMention(title, request.message)
}

async function showPopper(request: NotificationRequest) {
  const title = request.title ?? 'Notification'
  await popperMention(title, request.message)
}

async function dispatchAppNotification(
  request: NotificationRequest,
  transport: ITuffTransport,
  id: string
): Promise<void> {
  const presentation = resolvePresentation(request)
  switch (presentation) {
    case 'toast':
    case 'banner':
      showToast(id, request)
      break
    case 'dialog':
      await showDialog(request, transport, id)
      break
    case 'mention':
      await showMention(request, transport, id)
      break
    case 'blow':
      await showBlow(request)
      break
    case 'popper':
      await showPopper(request)
      break
    default:
      showToast(id, request)
      break
  }
}

export function registerNotificationHub(transport: ITuffTransport): () => void {
  const disposers: Array<() => void> = []

  disposers.push(
    transport.on(NotificationEvents.push.notify, async (payload: NotificationPushPayload) => {
      const { id, request } = payload
      notificationCache.set(id, request)
      await dispatchAppNotification(request, transport, id)
    }),
    transport.on(NotificationEvents.push.update, async (payload: NotificationUpdatePayload) => {
      const previous = notificationCache.get(payload.id)
      const merged = mergeRequest(previous, payload.patch, payload.id)
      notificationCache.set(payload.id, merged)
      await dispatchAppNotification(merged, transport, payload.id)
    }),
    transport.on(NotificationEvents.push.dismiss, (payload: NotificationDismissPayload) => {
      toast.dismiss(payload.id)
      notificationCache.delete(payload.id)
    })
  )

  return () => {
    disposers.forEach((dispose) => dispose())
  }
}
