import { requireSessionAuth } from '../../../utils/auth'
import {
  ACCOUNT_DELETION_CONFIRM_PHRASE,
  ACCOUNT_DELETION_TERMS_MIN_READ_SECONDS,
  createAccountDeletionTermsSession,
} from '../../../utils/privacyDataStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const session = await createAccountDeletionTermsSession(event, userId)

  return {
    sessionId: session.id,
    startedAt: session.startedAt,
    earliestConfirmAt: session.earliestConfirmAt,
    expiresAt: session.expiresAt,
    termsVersion: session.termsVersion,
    minReadSeconds: ACCOUNT_DELETION_TERMS_MIN_READ_SECONDS,
    confirmPhrase: ACCOUNT_DELETION_CONFIRM_PHRASE,
  }
})
