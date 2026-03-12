import { requirePilotAuth } from '../../utils/auth'
import { quotaOk } from '../../utils/quota-api'

function encodeText(value: string): string {
  return btoa(encodeURIComponent(value))
}

export default defineEventHandler((event) => {
  requirePilotAuth(event)

  const cards = [
    { type: 'career', score: 88, message: '今天适合推进长期事项。' },
    { type: 'study', score: 82, message: '学习效率较高，适合处理复杂任务。' },
    { type: 'health', score: 79, message: '注意补水与休息。' },
  ]

  return quotaOk({
    date: new Date().toISOString().slice(0, 10),
    luckyColor: 'blue',
    content: encodeText(JSON.stringify(cards)),
  })
})
