import { Buffer } from 'node:buffer'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)
  const platform = String(body?.platform || 'wechat')
  const key = `pilot_qr_${Date.now().toString(36)}`
  return quotaOk({
    exempted: true,
    platform,
    key,
    qrcode: `data:text/plain;base64,${Buffer.from(`pilot-${platform}-${key}`, 'utf8').toString('base64')}`,
    message: '二维码登录已豁免：返回可消费模拟码。',
  })
})
