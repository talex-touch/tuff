import { createError, defineEventHandler, readBody } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { getUserById, setUserRole } from '../../../../utils/authStore'

const ALLOWED_ROLES = ['admin', 'user'] as const

export default defineEventHandler(async (event) => {
  const { userId: adminId } = await requireAdmin(event)
  const id = event.context.params?.id

  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'User id is required.' })

  if (id === adminId)
    throw createError({ statusCode: 400, statusMessage: 'Cannot change your own role.' })

  const body = await readBody<{ role?: string }>(event)
  const role = body?.role?.trim().toLowerCase()

  if (!role || !(ALLOWED_ROLES as readonly string[]).includes(role))
    throw createError({ statusCode: 400, statusMessage: 'Invalid role.' })

  const existing = await getUserById(event, id)
  if (!existing)
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  if (existing.status === 'merged')
    throw createError({ statusCode: 400, statusMessage: 'Merged users cannot be updated.' })
  if (existing.status === 'deletion_pending')
    throw createError({ statusCode: 409, statusMessage: 'Users pending deletion cannot be updated.' })

  const updated = await setUserRole(event, id, role)
  if (!updated)
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })

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
