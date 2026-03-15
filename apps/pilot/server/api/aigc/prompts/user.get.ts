import { requirePilotAuth } from '../../../utils/auth'
import { listPromptPage } from '../../../utils/pilot-compat-aigc'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  requirePilotAuth(event)
  const page = await listPromptPage(event, {
    page: 1,
    pageSize: 200,
  })
  const total = page.meta.totalItems
  const published = page.items.filter(item => Number(item.status) === 3).length
  const pending = page.items.filter(item => Number(item.status) === 0).length

  return quotaOk({
    total,
    thisWeek: published,
    favorites: pending,
    updatedAt: new Date().toISOString(),
  })
})
