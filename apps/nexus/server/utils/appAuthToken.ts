import { createError } from 'h3'
import { createAppTokenPair, requireSessionAuth } from './auth'

function resolveErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message)
    return error.message
  if (typeof error === 'string' && error.trim().length > 0)
    return error
  return fallback
}

export async function issueAppSignInToken(event: Parameters<typeof requireSessionAuth>[0]) {
  const { userId, deviceId } = await requireSessionAuth(event)
  if (!deviceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A device id is required for desktop sign-in.',
    })
  }

  try {
    const tokens = await createAppTokenPair(event, userId, {
      deviceId,
      grantType: 'long',
    })
    return {
      ...tokens,
      grantType: 'long' as const,
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
