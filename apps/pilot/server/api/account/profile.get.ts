import { requirePilotAuth } from '../../utils/auth'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler((event) => {
  const auth = requirePilotAuth(event)
  if (!auth.isAuthenticated) {
    return quotaOk(null)
  }

  return quotaOk({
    id: 0,
    username: auth.userId,
    nickname: `Pilot-${auth.userId.slice(-6)}`,
    avatar: '',
    phone: '',
    email: '',
    roles: [],
    permissions: [],
    status: 1,
    token: {
      accessToken: '',
      refreshToken: '',
    },
    isLogin: true,
    isAdmin: false,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date().toISOString(),
  })
})
