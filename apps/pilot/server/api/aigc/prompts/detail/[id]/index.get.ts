import { defineEventHandler } from 'h3'
import { quotaUnavailable } from '../../../../../utils/quota-api'

export default defineEventHandler((event) => {
  return quotaUnavailable(event, 410, 'prompt_detail_route_retired', {
    message: '旧提示词详情接口已退役，请使用当前提示词接口。',
    migrationTarget: '/api/aigc/prompts/:id',
  })
})
