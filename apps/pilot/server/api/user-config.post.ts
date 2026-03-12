import { requirePilotAuth } from '../utils/auth'
import { quotaOk } from '../utils/quota-api'
import { ensureQuotaUserSchema, upsertQuotaUserConfig } from '../utils/quota-user-store'

interface UserConfigBody {
  pub_info?: string
  pri_info?: string
}

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const body = await readBody<UserConfigBody>(event)

  await ensureQuotaUserSchema(event)
  const config = await upsertQuotaUserConfig(event, {
    userId: auth.userId,
    pubInfo: String(body?.pub_info || ''),
    priInfo: String(body?.pri_info || ''),
  })

  return quotaOk({
    pub_info: config.pubInfo,
    pri_info: config.priInfo,
    updatedAt: config.updatedAt,
  })
})
