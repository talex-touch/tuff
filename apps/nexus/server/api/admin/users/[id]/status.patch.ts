import { createError, readBody } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { getUserById, setUserStatus } from '../../../../utils/authStore'
import { logAdminAudit } from '../../../../utils/adminAuditStore'

const ALLOWED_STATUSES = ['active', 'disabled'] as const

export default defineEventHandler(async (event) => {
  const { userId: adminId } = await requireAdmin(event)
  const id = event.context.params?.id

  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'User id is required.' })

  if (id === adminId)
    throw createError({ statusCode: 400, statusMessage: 'Cannot change your own status.' })

  const body = await readBody<{ status?: string }>(event)
  const status = body?.status?.trim().toLowerCase()

  if (!status || !(ALLOWED_STATUSES as readonly string[]).includes(status))
    throw createError({ statusCode: 400, statusMessage: 'Invalid status.' })

  const existing = await getUserById(event, id)
  if (!existing)
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  if (existing.status === 'merged')
    throw createError({ statusCode: 400, statusMessage: 'Merged users cannot be updated.' })

  const updated = await setUserStatus(event, id, status)
  if (!updated)
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })

  await logAdminAudit(event, {
    adminUserId: adminId,
    action: 'user.status.update',
    targetType: 'user',
    targetId: updated.id,
    targetLabel: updated.email,
    metadata: {
      before: { status: existing.status },
      after: { status: updated.status },
    },
  })

  return {
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      image: updated.image,
      role: updated.role,
      status: updated.status,
      emailState: updated.emailState,
      locale: updated.locale,
      disabledAt: updated.disabledAt,
      createdAt: updated.createdAt,
    },
  }
})
