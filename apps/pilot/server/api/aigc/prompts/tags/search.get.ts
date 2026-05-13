import { searchPromptTags } from '../../../../utils/pilot-aigc-service'
import { quotaOk } from '../../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const keyword = String(getQuery(event).keyword || '')
  const data = await searchPromptTags(event, keyword)
  return quotaOk(data)
})
