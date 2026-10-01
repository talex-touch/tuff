import { createError, readBody } from 'h3'
import { logAdminAudit } from '../../../../utils/adminAuditStore'
import { requireAdmin } from '../../../../utils/auth'
import { getUserById } from '../../../../utils/authStore'
import {
  ACCOUNT_DELETION_TERMS_VERSION,
  requestAccountDeletionWithCleanup,
} from '../../../../utils/privacyDataStore'

export default defineEventHandler(async (event) => {
  const { userId: adminId } = await requireAdmin(event)
  const id = event.context.params?.id

  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'User id is required.' })
  if (id === adminId)
    throw createError({ statusCode: 400, statusMessage: 'Cannot request deletion for your own account.' })

  const targetUser = await getUserById(event, id)
  if (!targetUser)
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  if (targetUser.status === 'merged')
    throw createError({ statusCode: 409, statusMessage: 'Merged users cannot be deleted.' })
  if (targetUser.status === 'deletion_pending')
    throw createError({ statusCode: 409, statusMessage: 'User deletion is already pending.' })
  if (targetUser.status !== 'active')
    throw createError({ statusCode: 409, statusMessage: 'Only active users can enter the deletion lifecycle.' })

  const body = await readBody<{ confirmEmail?: unknown }>(event)
  const confirmEmail = typeof body?.confirmEmail === 'string' ? body.confirmEmail.trim().toLowerCase() : ''
  if (!confirmEmail || confirmEmail !== targetUser.email.trim().toLowerCase()) {
    throw createError({ statusCode: 400, statusMessage: 'Confirmation email does not match the target user.' })
  }

  const result = await requestAccountDeletionWithCleanup(
    event,
    targetUser.id,
    ACCOUNT_DELETION_TERMS_VERSION,
  )
  if (!result.user || result.user.status !== 'deletion_pending')
    throw createError({ statusCode: 409, statusMessage: 'User deletion request could not be started.' })

  await logAdminAudit(event, {
    adminUserId: adminId,
    action: 'user.deletion.request',
    targetType: 'user',
    targetId: targetUser.id,
    targetLabel: targetUser.email,
    metadata: {
      scheduledAt: result.user.deletionScheduledAt,
      termsVersion: result.user.deletionTermsVersion,
      revokedDevices: result.revokedDevices,
      deletedApiKeys: result.deletedApiKeys,
      financialRecordsPreserved: true,
    },
  })

  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      image: result.user.image,
      role: result.user.role,
      status: result.user.status,
      emailState: result.user.emailState,
      locale: result.user.locale,
      disabledAt: result.user.disabledAt,
      deletionRequestedAt: result.user.deletionRequestedAt,
      deletionScheduledAt: result.user.deletionScheduledAt,
      createdAt: result.user.createdAt,
    },
    revokedDevices: result.revokedDevices,
    deletedApiKeys: result.deletedApiKeys,
  }
})
