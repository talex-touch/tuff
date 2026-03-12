import { requirePilotAuth } from '../../../utils/auth'
import { quotaOk, toBoundedPositiveInt } from '../../../utils/quota-api'
import { ensureQuotaShareSchema, listQuotaShares } from '../../../utils/quota-share-store'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const query = getQuery(event)
  const page = toBoundedPositiveInt(query.page, 1, 1, 10_000)
  const pageSize = toBoundedPositiveInt(query.pageSize, 25, 1, 200)

  await ensureQuotaShareSchema(event)
  const result = await listQuotaShares(event, {
    userId: auth.userId,
    page,
    pageSize,
  })

  const totalPages = result.totalItems <= 0
    ? 0
    : Math.ceil(result.totalItems / pageSize)

  return quotaOk({
    items: result.items.map(item => ({
      uuid: item.shareId,
      chat_id: item.chatId,
      topic: item.topic,
      value: item.value,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    meta: {
      totalItems: result.totalItems,
      itemCount: result.items.length,
      itemsPerPage: pageSize,
      totalPages,
      currentPage: page,
    },
  })
})
