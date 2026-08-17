import {
  APP_ACCESS_TOKEN_TTL_SECONDS,
  createAppToken,
  requireAppRefreshAuth,
} from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const { userId, deviceId, tokenGrantType } = await requireAppRefreshAuth(event)
  const appToken = await createAppToken(event, userId, {
    deviceId,
    grantType: tokenGrantType ?? undefined,
    tokenKind: 'access',
    ttlSeconds: APP_ACCESS_TOKEN_TTL_SECONDS,
  })

  return {
    appToken,
    grantType: tokenGrantType,
    ttlSeconds: APP_ACCESS_TOKEN_TTL_SECONDS,
    refreshable: true,
  }
})
