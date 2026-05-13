import { defineEventHandler } from 'h3'
import { listPilotEntitiesAll } from '../../utils/pilot-entity-store'
import { quotaOk, quotaUnavailable } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const list = await listPilotEntitiesAll<Record<string, any>>(event, 'wechat.livechat')
  if (list.length <= 0) {
    return quotaUnavailable(event, 503, 'wechat_livechat_data_unavailable', {
      message: '微信实时会话数据暂不可用。',
      migrationTarget: '/api/livechat/list',
    })
  }
  const random = list[Math.floor(Math.random() * list.length)]
  return quotaOk({ ...random, exempted: true })
})
