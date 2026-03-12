import { requirePilotAuth } from '../../../../../utils/auth'
import { quotaError, quotaOk } from '../../../../../utils/quota-api'
import { ensureQuotaShareSchema, getQuotaShareByChatId } from '../../../../../utils/quota-share-store'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const chatId = String(event.context.params?.id || '').trim()
  if (!chatId) {
    return quotaError(400, 'chat_id is required', null)
  }

  await ensureQuotaShareSchema(event)
  const share = await getQuotaShareByChatId(event, auth.userId, chatId)
  if (!share) {
    return quotaError(404, 'share not found', null)
  }

  return quotaOk({
    uuid: share.shareId,
    chat_id: share.chatId,
    topic: share.topic,
    createdAt: share.createdAt,
    updatedAt: share.updatedAt,
  })
})
