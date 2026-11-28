import { defineEventHandler, readBody } from 'h3'
import { requireAuth } from '../../utils/auth'
import {
  countUnreadBrowserNotifications,
  markBrowserNotificationsRead,
} from '../../utils/browserNotificationInboxStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const body = await readBody<{ ids?: string[], all?: boolean }>(event).catch(() => ({} as { ids?: string[], all?: boolean }))

  const updated = await markBrowserNotificationsRead(event, {
    userId,
    ids: body?.ids,
    all: body?.all,
  })
  const unreadCount = await countUnreadBrowserNotifications(event, userId)

  return {
    ok: true,
    updated,
    unreadCount,
  }
})
