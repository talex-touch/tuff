import { listPromptPage } from '../../../utils/pilot-aigc-service'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = await listPromptPage(event, {
    page: 1,
    pageSize: query.pageSize || 50,
    keyword: query.keyword || query.query || '',
  })
  return quotaOk(page.items)
})
