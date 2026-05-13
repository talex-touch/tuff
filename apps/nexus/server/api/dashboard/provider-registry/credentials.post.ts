import { readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { storeProviderCredential } from '../../../utils/providerCredentialStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody(event)

  return await storeProviderCredential(event, {
    authRef: body?.authRef,
    authType: body?.authType,
    credentials: body?.credentials,
  }, userId)
})
