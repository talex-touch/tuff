import { createError, readBody } from 'h3'
import { requireSessionAuth } from '../../../utils/auth'
import { submitAccountDeletion } from '../../../utils/privacyDataStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const body = await readBody<{ sessionId?: unknown, confirm?: unknown }>(event)
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
  const confirm = typeof body?.confirm === 'string' ? body.confirm.trim() : ''
  if (!sessionId)
    throw createError({ statusCode: 400, statusMessage: 'Terms session id is required.' })

  return await submitAccountDeletion(event, userId, sessionId, confirm)
})
