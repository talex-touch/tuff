import { requirePilotAuth } from '../utils/auth'
import { quotaOk } from '../utils/quota-api'
import { ensureQuotaUserSchema, getQuotaUserConfig } from '../utils/quota-user-store'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  await ensureQuotaUserSchema(event)
  const config = await getQuotaUserConfig(event, auth.userId)

  return quotaOk({
    pub_info: config.pubInfo,
    pri_info: config.priInfo,
    updatedAt: config.updatedAt,
  })
})
