import { createError, getRequestURL, readBody } from 'h3'
import { useRuntimeConfig } from '#imports'
import { requireAdmin } from '../../../../utils/auth'
import { createPasswordResetToken, getUserById } from '../../../../utils/authStore'
import { normalizeAuthOrigin } from '../../../../utils/authOrigin'
import { logAdminAudit } from '../../../../utils/adminAuditStore'

const DEFAULT_TTL_MINUTES = 30
const MAX_TTL_MINUTES = 24 * 60
const ERROR_CODES = {
  INVALID_TTL: 'ADMIN_PASSWORD_RESET_INVALID_TTL',
  MISSING_USER_ID: 'ADMIN_PASSWORD_RESET_USER_ID_REQUIRED',
  USER_NOT_FOUND: 'ADMIN_PASSWORD_RESET_USER_NOT_FOUND',
  MERGED_USER: 'ADMIN_PASSWORD_RESET_MERGED_USER',
  INACTIVE_USER: 'ADMIN_PASSWORD_RESET_INACTIVE_USER',
} as const

function readTtlMinutes(value: unknown): number {
  if (value == null || value === '')
    return DEFAULT_TTL_MINUTES
  const ttl = Number(value)
  if (!Number.isFinite(ttl) || ttl <= 0)
    throw createError({ statusCode: 400, statusMessage: 'Invalid reset link TTL.', data: { errorCode: ERROR_CODES.INVALID_TTL } })
  return Math.min(MAX_TTL_MINUTES, Math.max(1, Math.round(ttl)))
}

function resolveOrigin(event: any): string {
  const configuredOrigin = normalizeAuthOrigin(useRuntimeConfig(event).auth?.origin)
  if (configuredOrigin)
    return configuredOrigin
  return getRequestURL(event).origin
}

export default defineEventHandler(async (event) => {
  const { userId: adminId } = await requireAdmin(event)
  const id = event.context.params?.id

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User id is required.',
      data: { errorCode: ERROR_CODES.MISSING_USER_ID },
    })
  }

  const body = await readBody<{ ttlMinutes?: unknown }>(event)
  const ttlMinutes = readTtlMinutes(body?.ttlMinutes)

  const user = await getUserById(event, id)
  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found.',
      data: { errorCode: ERROR_CODES.USER_NOT_FOUND },
    })
  }
  if (user.status === 'merged') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Merged users cannot reset password.',
      data: { errorCode: ERROR_CODES.MERGED_USER },
    })
  }
  if (user.status !== 'active') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Only active users can reset password.',
      data: { errorCode: ERROR_CODES.INACTIVE_USER },
    })
  }

  const token = await createPasswordResetToken(event, user.id, ttlMinutes * 60 * 1000)
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString()
  const resetUrl = new URL('/reset-password', resolveOrigin(event))
  resetUrl.searchParams.set('email', user.email)
  resetUrl.searchParams.set('token', token)

  await logAdminAudit(event, {
    adminUserId: adminId,
    action: 'user.password_reset_link.create',
    targetType: 'user',
    targetId: user.id,
    targetLabel: user.email,
    metadata: {
      expiresAt,
      ttlMinutes,
    },
  })

  return {
    resetUrl: resetUrl.toString(),
    expiresAt,
    ttlMinutes,
  }
})
