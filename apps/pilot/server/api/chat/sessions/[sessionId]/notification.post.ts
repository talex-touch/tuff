import { requirePilotAuth } from '../../../../utils/auth'
import { requireSessionId } from '../../../../utils/pilot-http'
import { createPilotStoreAdapter } from '../../../../utils/pilot-store'

interface NotificationBody {
  unread?: boolean
}

export default defineEventHandler(async (event) => {
  const { userId } = requirePilotAuth(event)
  const sessionId = requireSessionId(event)
  const body = await readBody<NotificationBody>(event)

  const unread = typeof body?.unread === 'boolean' ? body.unread : false

  const store = createPilotStoreAdapter(event, userId)
  await store.runtime.ensureSchema()
  await store.runtime.setSessionNotification(sessionId, unread)

  return {
    ok: true,
    sessionId,
    unread,
  }
})
