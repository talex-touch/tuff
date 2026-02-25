import { requireAuth } from '../../utils/auth'
import { ensureDeviceForRequest, getAdminBootstrapState, getUserById, listPasskeys } from '../../utils/authStore'
import { useRuntimeConfig } from '#imports'
import type { H3Event } from 'h3'

function hasBootstrapSecret(event: H3Event) {
  const config = useRuntimeConfig(event)
  const secret = typeof config.adminBootstrap?.secret === 'string'
    ? config.adminBootstrap.secret.trim()
    : ''
  return secret.length > 0
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  await ensureDeviceForRequest(event, userId)
  const user = await getUserById(event, userId)
  if (!user)
    return null

  const passkeys = await listPasskeys(event, userId)
  const bootstrap = await getAdminBootstrapState(event, userId)
  const bootstrapEnabled = hasBootstrapSecret(event)

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    role: user.role,
    locale: user.locale,
    emailVerified: Boolean(user.emailVerified),
    emailState: user.emailState,
    isRestricted: user.emailState !== 'verified',
    passkeyCount: passkeys.length,
    adminBootstrap: {
      enabled: bootstrapEnabled,
      required: bootstrap.requiresBootstrap,
      canPromote: bootstrapEnabled && bootstrap.requiresBootstrap && bootstrap.isFirstUser,
      isFirstUser: bootstrap.isFirstUser,
    },
  }
})
