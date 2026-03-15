import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler((event) => {
  const account = String(getQuery(event).account || '')
  return quotaOk({
    exempted: true,
    account,
    provider: 'sms_miniprogram',
    sent: true,
    message: '小程序短信能力已豁免：未接入真实网关。',
  })
})
