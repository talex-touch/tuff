import { requireAdmin } from '../../../utils/auth'
import { listNotificationCredentials } from '../../../utils/notificationCredentialStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  return {
    credentials: await listNotificationCredentials(event),
    generatedAt: new Date().toISOString(),
  }
})
