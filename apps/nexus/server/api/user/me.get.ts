import type { H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import { requireSessionAuth } from '../../utils/auth'
import {
  getAdminBootstrapState,
  getUserAccountActivitySummary,
  getUserById,
  hasUserPasswordCredential,
  listPasskeys,
  listUserLinkedAccounts,
} from '../../utils/authStore'
import { normalizeLocaleCode } from '../../utils/locale'

function hasBootstrapSecret(event: H3Event) {
  const config = useRuntimeConfig(event)
  const secret = typeof config.adminBootstrap?.secret === 'string'
    ? config.adminBootstrap.secret.trim()
    : ''
  return secret.length > 0
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)

  const user = await getUserById(event, userId)
  if (!user)
    return null

  const passkeys = await listPasskeys(event, userId)
  const linkedAccounts = await listUserLinkedAccounts(event, userId)
  const linkedProviders = [...new Set(linkedAccounts.map(account => account.provider))]
  const hasPassword = await hasUserPasswordCredential(event, userId)
  const accountActivity = await getUserAccountActivitySummary(event, userId)
  const bootstrap = await getAdminBootstrapState(event, userId)
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
    updatedAt: accountActivity.updatedAt,
    emailVerified: Boolean(user.emailVerified),
    emailState: user.emailState,
    isRestricted: user.emailState !== 'verified',
    passkeyCount: passkeys.length,
    hasPassword,
    linkedProviders,
    linkedAccounts,
    adminBootstrap: {
      enabled: bootstrapEnabled,
      required: bootstrap.requiresBootstrap,
      canPromote: bootstrapEnabled && bootstrap.requiresBootstrap && bootstrap.isFirstUser,
      isFirstUser: bootstrap.isFirstUser,
    },
  }
})
