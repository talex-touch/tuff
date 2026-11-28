import { defineEventHandler, getQuery } from 'h3'
import { requireAuth } from '../../utils/auth'
import { readBrowserNotificationInbox } from '../../utils/browserNotificationInboxStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const query = getQuery(event)

  return await readBrowserNotificationInbox(event, {
    userId,
    status: query.status ?? 'all',
    limit: query.limit ?? 20,
    page: query.page ?? 1,
    offset: query.offset,
  })
})
