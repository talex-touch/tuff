import { quotaOk } from '../../../../utils/quota-api'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  return quotaOk({
    exempted: true,
    provider: 'wechat',
    code: String(query.code || ''),
    state: String(query.state || ''),
    message: '微信授权回调已豁免：当前为模拟响应。',
  })
})
