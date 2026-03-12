import { requirePilotAuth } from '../../../utils/auth'
import { quotaNotImplemented } from '../../../utils/quota-api'

export default defineEventHandler((event) => {
  requirePilotAuth(event)
  return quotaNotImplemented('M1 渠道配置默认由环境变量 PILOT_CHANNELS_JSON/PILOT_DEFAULT_CHANNEL_ID/PILOT_CHANNEL_DEFAULT_ADAPTER 管理，后台写入将在 M2 开放。')
})
