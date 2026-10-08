import { requireAuth } from '../../../../utils/auth'
import { countUnreadBrowserNotifications } from '../../../../utils/browserNotificationInboxStore'

/**
 * The dashboard nav's badge. It used to read a page of the inbox for the count that came with it, on
 * every dashboard route change.
 */
export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  return {
    unreadCount: await countUnreadBrowserNotifications(event, userId),
  }
})
