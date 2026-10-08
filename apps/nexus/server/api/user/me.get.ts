import type { H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import { requireSessionAuth } from '../../utils/auth'
import { getUserAccountOverview, getUserById } from '../../utils/authStore'
import { normalizeLocaleCode } from '../../utils/locale'

function hasBootstrapSecret(event: H3Event) {
  const config = useRuntimeConfig(event)
  const secret = typeof config.adminBootstrap?.secret === 'string'
    ? config.adminBootstrap.secret.trim()
    : ''
  return secret.length > 0
}

export default defineEventHandler(async (event) => {
  // Two round trips in all: authentication (which already read the user row) and one batch for the
  // rest. It was eleven, one after another.
  const auth = await requireSessionAuth(event)
  const user = auth.user ?? await getUserById(event, auth.userId)
  if (!user)
    return null

  const overview = await getUserAccountOverview(event, user)
  const linkedProviders = [...new Set(overview.linkedAccounts.map(account => account.provider))]
  const bootstrap = overview.bootstrap
  const bootstrapEnabled = hasBootstrapSecret(event)

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    role: user.role,
    locale: normalizeLocaleCode(user.locale),
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: overview.updatedAt,
    emailVerified: Boolean(user.emailVerified),
    emailState: user.emailState,
    isRestricted: user.emailState !== 'verified',
    passkeyCount: overview.passkeyCount,
    linkedProviders,
    linkedAccounts: overview.linkedAccounts,
    adminBootstrap: {
      enabled: bootstrapEnabled,
      required: bootstrap.requiresBootstrap,
      canPromote: bootstrapEnabled && bootstrap.requiresBootstrap && bootstrap.isFirstUser,
      isFirstUser: bootstrap.isFirstUser,
    },
  }
})
