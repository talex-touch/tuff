import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  return quotaOk({
    exempted: true,
    platform: String(query.platform || 'wechat'),
    key: String(query.key || ''),
    status: 'EXEMPTED',
    codeStatus: 'EXEMPTED',
    message: '二维码状态查询已豁免：当前不会走真实授权。',
  })
})
