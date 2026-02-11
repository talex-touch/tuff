import { requireAuth } from '../../../utils/auth'
import {
  getUserById,
  hasUserPasswordCredential,
  listPasskeys,
  listUserLinkedAccounts,
  unlinkAccount,
} from '../../../utils/authStore'

const OAUTH_PROVIDERS = new Set(['github', 'linuxdo'])

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const provider = (getRouterParam(event, 'provider') || '').toLowerCase()

  if (!OAUTH_PROVIDERS.has(provider)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported provider' })
  }

  const linkedAccounts = await listUserLinkedAccounts(event, userId)
  const hasTargetLink = linkedAccounts.some(account => account.provider === provider)
  if (!hasTargetLink) {
    return { success: true, unlinked: false }
  }

  const remainingOauthCount = linkedAccounts.filter(account => account.provider !== provider).length
  const passkeys = await listPasskeys(event, userId)
  const hasPassword = await hasUserPasswordCredential(event, userId)
  const user = await getUserById(event, userId)

  const config = useRuntimeConfig()
  const emailProviderEnabled = Boolean(config.auth?.email?.server && config.auth?.email?.from)
  const hasEmailFallback = Boolean(emailProviderEnabled && user?.emailState !== 'missing')

  if (!hasPassword && !hasEmailFallback && passkeys.length === 0 && remainingOauthCount === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Cannot unbind last sign-in method. Please add password, email, passkey, or another OAuth provider first.',
    })
  }

  await unlinkAccount(event, userId, provider)
  return { success: true, unlinked: true }
})
