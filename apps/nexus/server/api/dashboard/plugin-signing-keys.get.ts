import { requireAuthOrApiKey } from '../../utils/auth'
import { listPublisherSigningKeys } from '../../utils/pluginSigning'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthOrApiKey(event, ['plugin:publish'])
  const keys = await listPublisherSigningKeys(event, userId)
  return { keys }
})
