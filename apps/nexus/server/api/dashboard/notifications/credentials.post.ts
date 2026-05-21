import { readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { storeNotificationCredential } from '../../../utils/notificationCredentialStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody(event)

  return await storeNotificationCredential(event, {
    authRef: body?.authRef,
    credentialType: body?.credentialType,
    credentials: body?.credentials,
  }, userId)
})
