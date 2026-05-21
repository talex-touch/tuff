import { requireAdmin } from '../../../utils/auth'
import { listStorageCredentials } from '../../../utils/storageCredentialStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const credentials = await listStorageCredentials(event)

  return {
    credentials,
    generatedAt: new Date().toISOString(),
  }
})
