import { requireSessionAuth } from '../../utils/auth'
import { ensureDeviceForRequest, getUserById, listPasskeys, listUserLinkedAccounts } from '../../utils/authStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  await ensureDeviceForRequest(event, userId)

  const user = await getUserById(event, userId)
  if (!user)
    return null

  const passkeys = await listPasskeys(event, userId)
  const linkedAccounts = await listUserLinkedAccounts(event, userId)
  const linkedProviders = [...new Set(linkedAccounts.map(account => account.provider))]

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
    linkedProviders,
    linkedAccounts,
  }
})
