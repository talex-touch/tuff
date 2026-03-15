import { listPromptPage } from '../../../utils/pilot-compat-aigc'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const page = await listPromptPage(event, {
    page: 1,
    pageSize: 12,
  })
  return quotaOk(page.items)
})
