import { requirePilotAuth } from '../../utils/auth'
import { updatePilotLocalUserProfile, isPilotLocalUserId } from '../../utils/pilot-local-auth'
import { getPilotCompatEntity, upsertPilotCompatEntity } from '../../utils/pilot-compat-store'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const body = await readBody<Record<string, any>>(event)
  const nickname = String(body?.nickname || '').trim()
  const avatar = String(body?.avatar || '').trim()

  let profile: Record<string, any> | null = null
  if (auth.isAuthenticated && isPilotLocalUserId(auth.userId)) {
    const localProfile = await updatePilotLocalUserProfile(event, auth.userId, {
      nickname,
    })
    if (localProfile) {
      profile = {
        id: localProfile.userId,
        nickname: localProfile.nickname,
        avatar,
        email: localProfile.email,
        updatedAt: localProfile.updatedAt,
      }
    }
  }

  if (!profile) {
    const existing = await getPilotCompatEntity(event, 'account.profile', auth.userId)
    profile = await upsertPilotCompatEntity(event, {
      domain: 'account.profile',
      id: auth.userId,
      payload: {
        ...(existing || {}),
        id: auth.userId,
        nickname: nickname || existing?.nickname || `Pilot-${auth.userId.slice(-6)}`,
        avatar: avatar || existing?.avatar || '',
        updatedAt: new Date().toISOString(),
      },
    })
  }

  return quotaOk(profile)
})
