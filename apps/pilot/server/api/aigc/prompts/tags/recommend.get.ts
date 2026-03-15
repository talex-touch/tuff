import { listPromptTagPage } from '../../../../utils/pilot-compat-aigc'
import { quotaOk } from '../../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const page = await listPromptTagPage(event, {
    page: 1,
    pageSize: 20,
  })
  return quotaOk(page.items)
})
