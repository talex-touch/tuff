import { createError, readBody } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { getUserById, updateUserProfile } from '../../../../utils/authStore'
import { logAdminAudit } from '../../../../utils/adminAuditStore'

export default defineEventHandler(async (event) => {
  const { userId: adminId } = await requireAdmin(event)
  const id = event.context.params?.id

  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'User id is required.' })

  const body = await readBody<{
    name?: string | null
    image?: string | null
    locale?: string | null
  }>(event)

  const existing = await getUserById(event, id)
  if (!existing)
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  if (existing.status === 'merged')
    throw createError({ statusCode: 400, statusMessage: 'Merged users cannot be updated.' })

  const payload = {
    name: typeof body?.name === 'string' ? body.name.trim() || null : body?.name ?? null,
    image: typeof body?.image === 'string' ? body.image.trim() || null : body?.image ?? null,
    locale: typeof body?.locale === 'string' ? body.locale.trim() || null : body?.locale ?? null,
  }

  const updated = await updateUserProfile(event, id, payload)
  if (!updated)
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })

  await logAdminAudit(event, {
    adminUserId: adminId,
    action: 'user.profile.update',
    targetType: 'user',
    targetId: updated.id,
    targetLabel: updated.email,
    metadata: {
      before: { name: existing.name, image: existing.image, locale: existing.locale },
      after: { name: updated.name, image: updated.image, locale: updated.locale },
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
