import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler((event) => {
  return quotaOk({
    accessToken: '',
    refreshToken: '',
    exempted: true,
    code: String(getQuery(event).code || ''),
    message: '小程序短信登录已豁免：当前为模拟响应。',
  })
})
