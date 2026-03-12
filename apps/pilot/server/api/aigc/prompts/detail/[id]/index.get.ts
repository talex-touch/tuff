import { quotaOk } from '../../../../../utils/quota-api'

export default defineEventHandler((event) => {
  const id = Number(event.context.params?.id)
  return quotaOk({
    id: Number.isFinite(id) ? id : 0,
    title: 'M1 默认提示词',
    content: 'M1 阶段返回占位提示词详情，可在 M2 对接正式提示词中心。',
    tags: ['m1', 'compat'],
  })
})
