import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler((event) => {
  const code = String(getQuery(event).code || '')
  return quotaOk({
    accessToken: '',
    refreshToken: '',
    exempted: true,
    provider: 'wechat',
    code,
    message: '微信登录已豁免：当前为 Pilot 迁移阶段模拟响应。',
  })
})
