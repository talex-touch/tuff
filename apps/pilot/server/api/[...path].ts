import { defineEventHandler } from 'h3'
import { quotaNotImplemented } from '../utils/quota-api'

export default defineEventHandler((event) => {
  const pathParam = event.context.params?.path
  const path = Array.isArray(pathParam)
    ? pathParam.join('/')
    : String(pathParam || '')

  return quotaNotImplemented(event, `M0 未实现接口: /api/${path}`)
})
