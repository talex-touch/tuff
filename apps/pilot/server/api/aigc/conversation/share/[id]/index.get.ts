import { quotaError, quotaOk } from '../../../../../utils/quota-api'
import { ensureQuotaShareSchema, getQuotaShareById } from '../../../../../utils/quota-share-store'

export default defineEventHandler(async (event) => {
  const shareId = String(event.context.params?.id || '').trim()
  if (!shareId) {
    return quotaError(400, 'uuid is required', null)
  }

  await ensureQuotaShareSchema(event)
  const share = await getQuotaShareById(event, shareId)
  if (!share) {
    return quotaError(404, 'share not found', null)
  }

  return quotaOk({
    uuid: share.shareId,
    chat_id: share.chatId,
    topic: share.topic,
    value: share.value,
    user: {
      nickname: `Pilot-${share.userId.slice(-6)}`,
      avatar: '',
    },
    createdAt: share.createdAt,
    updatedAt: share.updatedAt,
  })
})
