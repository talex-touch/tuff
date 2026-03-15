import { searchPromptTags } from '../../../../utils/pilot-compat-aigc'
import { quotaOk } from '../../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const keyword = String(getQuery(event).keyword || '')
  const data = await searchPromptTags(event, keyword)
  return quotaOk(data)
})
