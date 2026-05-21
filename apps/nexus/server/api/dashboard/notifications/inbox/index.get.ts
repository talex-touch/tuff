import { getQuery } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { countUnreadBrowserNotifications, listBrowserNotificationInbox } from '../../../../utils/browserNotificationInboxStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const query = getQuery(event)
  const notifications = await listBrowserNotificationInbox(event, {
    userId,
    status: query.status,
    limit: query.limit,
  })
  const unreadCount = await countUnreadBrowserNotifications(event, userId)

  return {
    notifications,
    unreadCount,
    generatedAt: new Date().toISOString(),
  }
})
