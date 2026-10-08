import { getQuery } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { readBrowserNotificationInbox } from '../../../../utils/browserNotificationInboxStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const query = getQuery(event)
  const { notifications, unreadCount } = await readBrowserNotificationInbox(event, {
    userId,
    status: query.status,
    limit: query.limit,
  })

  return {
    notifications,
    unreadCount,
    generatedAt: new Date().toISOString(),
  }
})
