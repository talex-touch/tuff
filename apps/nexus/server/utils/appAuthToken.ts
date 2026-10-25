import { createError } from 'h3'
import { createAppTokenPair, requireSessionAuth } from './auth'
import { hasLongTermSignInMethod } from './authStore'

function resolveErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message)
    return error.message
  if (typeof error === 'string' && error.trim().length > 0)
    return error
  return fallback
}

export async function issueAppSignInToken(event: Parameters<typeof requireSessionAuth>[0]) {
  const { userId, deviceId, user } = await requireSessionAuth(event)
  if (!deviceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A device id is required for desktop sign-in.',
    })
  }

  // Long only for an account with a sign-in method, as device authorization grants it: one without would lose the
  // grant at its first renewal and be signed out a day later.
  const grantType = user && await hasLongTermSignInMethod(event, user) ? 'long' : 'short'
  try {
    const tokens = await createAppTokenPair(event, userId, {
      deviceId,
      grantType,
    })
    return {
      ...tokens,
      grantType,
      refreshable: true,
    }
  }
  catch (error) {
    const detail = resolveErrorMessage(error, 'Failed to create app sign-in tokens.')
    throw createError({
      statusCode: 500,
      statusMessage: detail,
    })
  }
}
