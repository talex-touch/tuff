import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)
  return quotaOk({
    exempted: true,
    account: String(body?.account || ''),
    provider: 'sms',
    sent: true,
    message: '短信能力已豁免：未接入真实网关。',
  })
})
