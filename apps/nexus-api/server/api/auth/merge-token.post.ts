import { createError } from 'h3'
import { requireSessionAuth } from '../../utils/auth'
import { createLoginToken, getUserById } from '../../utils/authStore'

const MERGE_TOKEN_TTL_MS = 1000 * 60 * 10

export default defineEventHandler(async (event) => {
  const auth = await requireSessionAuth(event)
  const { userId } = auth
  const user = auth.user ?? await getUserById(event, userId)
  if (!user || user.status !== 'active') {
    throw createError({ statusCode: 403, statusMessage: 'Account disabled.' })
  }

  const token = await createLoginToken(event, userId, 'merge', MERGE_TOKEN_TTL_MS)
  return {
    token,
    expiresIn: Math.floor(MERGE_TOKEN_TTL_MS / 1000),
  }
})
