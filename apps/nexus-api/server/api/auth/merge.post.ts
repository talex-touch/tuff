import { createError, readBody } from 'h3'
import { requireSessionAuth } from '../../utils/auth'
import { consumeLoginToken, mergeUsers } from '../../utils/authStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const body = await readBody(event)
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const confirm = body?.confirm === true
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : null
  const metadata = typeof body?.metadata === 'object' && body?.metadata ? body.metadata as Record<string, any> : null

  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Merge token required.' })
  }
  if (!confirm) {
    throw createError({ statusCode: 400, statusMessage: 'Merge confirmation required.' })
  }

  const source = await consumeLoginToken(event, token, 'merge')
  if (!source || source.status !== 'active') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid merge token.' })
  }
  if (source.id === userId) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot merge the same user.' })
  }

  try {
    await mergeUsers(event, {
      sourceUserId: source.id,
      targetUserId: userId,
      mergedByUserId: userId,
      reason,
      metadata,
    })
  }
  catch (error: any) {
    throw createError({ statusCode: 400, statusMessage: error?.message || 'Merge failed.' })
  }

  return { success: true }
})
