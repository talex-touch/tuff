import { requirePilotAuth } from '../../utils/auth'
import { resolvePilotAdmin } from '../../utils/pilot-admin-auth'
import { getPilotCompatEntity } from '../../utils/pilot-compat-store'
import { ensurePilotLocalAuthSchema, getPilotLocalUserByUserId, isPilotLocalUserId } from '../../utils/pilot-local-auth'
import { quotaOk } from '../../utils/quota-api'

type AuthStatusSource = 'guest' | 'local' | 'nexus'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const isLogin = auth.isAuthenticated
  const source: AuthStatusSource = !isLogin
    ? 'guest'
    : (isPilotLocalUserId(auth.userId) ? 'local' : 'nexus')
  let localProfile: Awaited<ReturnType<typeof getPilotLocalUserByUserId>> = null
  if (source === 'local') {
    try {
      await ensurePilotLocalAuthSchema(event)
      localProfile = await getPilotLocalUserByUserId(event, auth.userId)
    }
    catch {
      localProfile = null
    }
  }
  const admin = await resolvePilotAdmin(event)
  const profilePatch = await getPilotCompatEntity(event, 'account.profile', auth.userId)
  const roles = admin.isAdmin ? ['admin'] : []
  const permissions = admin.isAdmin ? ['pilot:admin'] : []

  return quotaOk({
    isLogin,
    source,
    userId: auth.userId,
    profile: isLogin
      ? {
          nickname: String(profilePatch?.nickname || localProfile?.nickname || `Pilot-${auth.userId.slice(-6)}`),
          avatar: String(profilePatch?.avatar || ''),
          email: localProfile?.email || '',
          roles,
          permissions,
          isAdmin: admin.isAdmin,
        }
      : null,
  })
})
