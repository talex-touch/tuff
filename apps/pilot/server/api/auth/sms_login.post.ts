import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)
  return quotaOk({
    accessToken: '',
    refreshToken: '',
    exempted: true,
    account: String(body?.account || ''),
    message: '短信登录已豁免：当前为模拟响应。',
  })
})
