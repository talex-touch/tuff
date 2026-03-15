import { searchSystemUsers } from '../../../utils/pilot-system-resource'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const query = String(getQuery(event).query || '')
  const data = await searchSystemUsers(event, query)
  return quotaOk(data)
})
