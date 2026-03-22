import { listPilotEntitiesAll } from '../../utils/pilot-entity-store'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const list = await listPilotEntitiesAll<Record<string, any>>(event, 'wechat.livechat')
  if (list.length <= 0) {
    return quotaOk({
      id: 'livechat_exempted',
      question: '微信能力迁移豁免中，暂无实时会话数据。',
      answer: '当前返回的是可消费的豁免占位响应。',
      exempted: true,
    })
  }
  const random = list[Math.floor(Math.random() * list.length)]
  return quotaOk({ ...random, exempted: true })
})
