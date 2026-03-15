import { upsertPilotCompatEntity } from '../../utils/pilot-compat-store'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)
  const now = new Date().toISOString()
  const data = await upsertPilotCompatEntity(event, {
    domain: 'doc.documents',
    id: String(body?.id || ''),
    payload: {
      ...body,
      title: String(body?.title || ''),
      content: String(body?.content || ''),
      published: Boolean(body?.published),
      createdAt: body?.createdAt || now,
      updatedAt: now,
    },
  })
  return quotaOk(data)
})
