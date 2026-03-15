import { getPilotLocalUserByEmail } from '../../utils/pilot-local-auth'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const account = String(getQuery(event).account || '').trim()
  const user = account ? await getPilotLocalUserByEmail(event, account) : null
  return quotaOk({
    exists: Boolean(user),
    account,
  })
})
