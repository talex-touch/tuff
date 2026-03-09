import { requirePilotAuth } from '../../utils/auth'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler((event) => {
  const auth = requirePilotAuth(event)
  const isLogin = auth.isAuthenticated

  return quotaOk({
    isLogin,
    source: auth.source,
    userId: auth.userId,
    profile: isLogin
      ? {
          nickname: `Pilot-${auth.userId.slice(-6)}`,
          avatar: '',
          roles: [],
          permissions: [],
        }
      : null,
  })
})
