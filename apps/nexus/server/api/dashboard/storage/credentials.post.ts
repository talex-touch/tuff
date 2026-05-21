import { readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { storeStorageCredential } from '../../../utils/storageCredentialStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody(event)

  return await storeStorageCredential(event, body ?? {}, userId)
})
