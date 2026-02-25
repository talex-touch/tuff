import { Buffer } from 'node:buffer'
import { createHash, timingSafeEqual } from 'node:crypto'
import { useRuntimeConfig } from '#imports'
import { createError, readBody, type H3Event } from 'h3'
import { requireSessionAuth } from '../../../utils/auth'
import { logAdminAudit } from '../../../utils/adminAuditStore'
import { getAdminBootstrapState, getUserById, promoteFirstUserToAdmin } from '../../../utils/authStore'

interface PromoteRequestBody {
  secret?: string
}

function toSafeBuffer(value: string) {
  return Buffer.from(value, 'utf8')
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(toSafeBuffer(left)).digest()
  const rightDigest = createHash('sha256').update(toSafeBuffer(right)).digest()
  return timingSafeEqual(leftDigest, rightDigest) && left.length === right.length
}

function getExpectedSecret(event: H3Event) {
  const config = useRuntimeConfig(event)
  const secret = typeof config.adminBootstrap?.secret === 'string'
    ? config.adminBootstrap.secret.trim()
    : ''
  if (!secret) {
    throw createError({
      statusCode: 503,
      statusMessage: 'ADMINSECRET is not configured.',
    })
  }
  return secret
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const body = await readBody<PromoteRequestBody>(event)
  const providedSecret = typeof body?.secret === 'string' ? body.secret : ''
  const expectedSecret = getExpectedSecret(event)

  if (!constantTimeEqual(providedSecret, expectedSecret)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Invalid admin bootstrap secret.',
    })
  }

  const currentState = await getAdminBootstrapState(event, userId)
  if (!currentState.requiresBootstrap) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Administrator already exists.',
    })
  }
  if (!currentState.isFirstUser) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only the first active user can bootstrap administrator.',
    })
  }

  const promoted = await promoteFirstUserToAdmin(event, userId)
  if (!promoted) {
    const latestState = await getAdminBootstrapState(event, userId)
    if (!latestState.requiresBootstrap) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Administrator already exists.',
      })
    }
    throw createError({
      statusCode: 409,
      statusMessage: 'Admin bootstrap conditions no longer match.',
    })
  }

  const user = await getUserById(event, userId)
  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found.',
    })
  }

  await logAdminAudit(event, {
    adminUserId: userId,
    action: 'user.role.bootstrap',
    targetType: 'user',
    targetId: user.id,
    targetLabel: user.email,
    metadata: {
      role: user.role,
    },
  })

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  }
})
