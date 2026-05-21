import { readBody } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { markBrowserNotificationsRead } from '../../../../utils/browserNotificationInboxStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const body = await readBody(event)
  const updated = await markBrowserNotificationsRead(event, {
    userId,
    ids: body?.ids,
    all: body?.all,
  })

  return {
    updated,
    generatedAt: new Date().toISOString(),
  }
})
