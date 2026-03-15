import { requirePilotAuth } from '../../utils/auth'
import { resolvePilotAdmin } from '../../utils/pilot-admin-auth'
import { getPilotCompatEntity } from '../../utils/pilot-compat-store'
import { ensurePilotLocalAuthSchema, getPilotLocalUserByUserId, isPilotLocalUserId } from '../../utils/pilot-local-auth'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  if (!auth.isAuthenticated) {
    return quotaOk(null)
  }

  const isLocal = isPilotLocalUserId(auth.userId)
  let localProfile: Awaited<ReturnType<typeof getPilotLocalUserByUserId>> = null
  if (isLocal) {
    try {
      await ensurePilotLocalAuthSchema(event)
      localProfile = await getPilotLocalUserByUserId(event, auth.userId)
    }
    catch {
      localProfile = null
    }
  }
  const nickname = localProfile?.nickname || `Pilot-${auth.userId.slice(-6)}`
  const email = localProfile?.email || ''
  const profilePatch = await getPilotCompatEntity(event, 'account.profile', auth.userId)
  const admin = await resolvePilotAdmin(event)
  const roles = admin.isAdmin ? ['admin'] : []
  const permissions = admin.isAdmin ? ['pilot:admin'] : []

  return quotaOk({
    id: 0,
    username: auth.userId,
    nickname: String(profilePatch?.nickname || nickname),
    avatar: String(profilePatch?.avatar || ''),
    phone: '',
    email,
    roles,
    permissions,
    status: 1,
    token: {
      accessToken: '',
      refreshToken: '',
    },
    isLogin: true,
    isAdmin: admin.isAdmin,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date().toISOString(),
  })
})
