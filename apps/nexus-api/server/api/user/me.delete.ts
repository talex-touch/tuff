import { createError, defineEventHandler, getHeader, readBody } from 'h3'
import { requireSessionAuth } from '../../utils/auth'
import { consumeLoginToken } from '../../utils/authStore'
import {
  ACCOUNT_DELETION_CONFIRM_PHRASE,
  ACCOUNT_DELETION_RECENT_AUTH_WINDOW_SECONDS,
  deleteUserAccountSingleStep,
} from '../../utils/privacyDataStore'
import { clearBrowserSessionCookies } from '../../utils/sessionJwt'

export default defineEventHandler(async (event) => {
  const { userId, sessionAuthenticatedAt } = await requireSessionAuth(event)
  const body = await readBody<{ confirm?: unknown, confirmation?: unknown, confirmPhrase?: unknown }>(event)
    .catch(() => ({} as { confirm?: unknown, confirmation?: unknown, confirmPhrase?: unknown }))
  const rawConfirm = body?.confirm ?? body?.confirmation ?? body?.confirmPhrase
  const confirm = typeof rawConfirm === 'string' ? rawConfirm.trim() : ''

  if (confirm !== ACCOUNT_DELETION_CONFIRM_PHRASE) {
    throw createError({
      statusCode: 400,
      statusMessage: `Confirmation phrase must equal ${ACCOUNT_DELETION_CONFIRM_PHRASE}.`,
    })
  }

  const loginToken = getHeader(event, 'x-login-token')?.trim()
  let recentAuthVerified = false

  if (loginToken) {
    const stepUpUser = await consumeLoginToken(event, loginToken, 'passkey')
    if (stepUpUser && stepUpUser.id === userId)
      recentAuthVerified = true
  }

  if (!recentAuthVerified && typeof sessionAuthenticatedAt === 'number') {
    const ageSeconds = Math.floor(Date.now() / 1000) - sessionAuthenticatedAt
    if (ageSeconds >= 0 && ageSeconds <= ACCOUNT_DELETION_RECENT_AUTH_WINDOW_SECONDS)
      recentAuthVerified = true
  }

  if (!recentAuthVerified) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Recent authentication or passkey confirmation is required.',
      data: {
        code: 'RECENT_AUTH_REQUIRED',
        maxAgeSeconds: ACCOUNT_DELETION_RECENT_AUTH_WINDOW_SECONDS,
      },
    })
  }

  const result = await deleteUserAccountSingleStep(event, { userId, confirm })
  clearBrowserSessionCookies(event)
  return result
})
