import { requirePilotAuth } from '../../../../../utils/auth'
import { quotaError, quotaOk } from '../../../../../utils/quota-api'
import { ensureQuotaHistorySchema, getQuotaHistory } from '../../../../../utils/quota-history-store'
import { ensureQuotaShareSchema, upsertQuotaShare } from '../../../../../utils/quota-share-store'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const chatId = String(event.context.params?.id || '').trim()
  if (!chatId) {
    return quotaError(400, 'chat_id is required', null)
  }

  await ensureQuotaHistorySchema(event)
  await ensureQuotaShareSchema(event)

  const history = await getQuotaHistory(event, auth.userId, chatId)
  if (!history) {
    return quotaError(404, 'conversation not found', null)
  }

  const share = await upsertQuotaShare(event, {
    userId: auth.userId,
    chatId,
    topic: history.topic,
    value: history.value,
  })

  return quotaOk({
    uuid: share.shareId,
    chat_id: share.chatId,
    topic: share.topic,
    createdAt: share.createdAt,
    updatedAt: share.updatedAt,
  })
})
