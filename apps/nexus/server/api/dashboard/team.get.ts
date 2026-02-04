import { createError } from 'h3'
import { requireAuth } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  throw createError({ statusCode: 501, statusMessage: 'Team features are not available yet.' })
})
