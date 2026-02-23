import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'
import { useRuntimeConfig } from '#imports'
import { requireAdmin } from './auth'
import { consumeLoginToken } from './authStore'
import { appendAdminBreakglassAudit, type AdminControlChannel } from './adminBreakglassAuditStore'
import { consumeEmergencyJti, hashDeviceFingerprint, hashIpValue } from './adminEmergencyStore'
import type { AdminRiskScope } from './adminEmergencyToken'
import { parseBearerToken, verifyAdminEmergencyToken } from './adminEmergencyToken'
import { requireAdminOobAuth } from './adminOobGuard'
import { enforceAdminRateLimit } from './adminRateLimitStore'
import { isControlPlanePreservedPath, isExtremeMode } from './defenseModeController'
import { assertRiskControlEnabled } from './featureFlags'
import { resolveRequestIp } from './ipSecurityStore'

export interface AdminControlContext {
  adminId: string | null
  actorId: string
  channel: AdminControlChannel
  scope: AdminRiskScope[]
  restricted: boolean
  tokenJti?: string
}

interface GuardOptions {
  requireStepUp?: boolean
  consumeEmergencyJti?: boolean
  applyWriteRateLimit?: boolean
  allowedChannels?: AdminControlChannel[]
  auditAction?: string
}

const ALL_RISK_SCOPES: AdminRiskScope[] = [
  'risk.mode.override',
  'risk.actor.unblock',
  'risk.case.review',
]

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean')
    return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true')
      return true
    if (normalized === 'false')
      return false
  }
  return fallback
}

function isProtectionEnabled(event: H3Event) {
  const config = useRuntimeConfig(event)
  return asBoolean(config.adminControl?.controlPlaneProtectedEnabled, true)
}

function isPreserveInExtremeEnabled(event: H3Event) {
  const config = useRuntimeConfig(event)
  return asBoolean(config.adminControl?.preserveInExtremeEnabled, true)
}

function isBreakglassEnabled(event: H3Event) {
  const config = useRuntimeConfig(event)
  return asBoolean(config.adminControl?.breakglassEnabled, true)
}

function resolveRequiredScopeSet(requiredScope?: AdminRiskScope): AdminRiskScope[] {
  return requiredScope ? [requiredScope] : []
}

function ensureScope(requiredScope: AdminRiskScope | undefined, granted: AdminRiskScope[]) {
  if (!requiredScope)
    return
  if (!granted.includes(requiredScope)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Insufficient admin scope.',
    })
  }
}

function ensureAllowedChannel(channel: AdminControlChannel, options?: GuardOptions) {
  if (!options?.allowedChannels || options.allowedChannels.length === 0)
    return
  if (!options.allowedChannels.includes(channel)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Channel not allowed.',
    })
  }
}

async function enforceAdminRiskWriteRateLimit(event: H3Event, adminId: string | null, actorId: string) {
  const ip = resolveRequestIp(event)
  if (adminId) {
    await enforceAdminRateLimit(event, {
      key: `admin-risk-write:admin:${adminId}`,
      limit: 20,
      windowMs: 60_000,
    })
  }
  if (ip) {
    await enforceAdminRateLimit(event, {
      key: `admin-risk-write:ip:${ip}`,
      limit: 60,
      windowMs: 60_000,
    })
  }
  await enforceAdminRateLimit(event, {
    key: `admin-risk-write:actor:${actorId}`,
    limit: 40,
    windowMs: 60_000,
  })
}

async function buildAdminActorId(event: H3Event, channel: AdminControlChannel, adminId: string): Promise<string> {
  const ip = resolveRequestIp(event)
  const ipHash = ip ? hashIpValue(event, ip) : 'no-ip'
  return `${channel}:${adminId}:${ipHash}`
}

async function tryEmergencyChannel(
  event: H3Event,
  requiredScope: AdminRiskScope | undefined,
  options?: GuardOptions,
): Promise<AdminControlContext | null> {
  const bearer = parseBearerToken(event)
  if (!bearer)
    return null

  if (!isBreakglassEnabled(event)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin break-glass is disabled.',
    })
  }

  const claims = verifyAdminEmergencyToken(event, bearer)
  if (!claims)
    return null

  ensureAllowedChannel('B', options)
  ensureScope(requiredScope, claims.scope)

  const deviceFingerprint = (getHeader(event, 'x-device-fingerprint') || '').trim()
  if (!deviceFingerprint) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Emergency token device fingerprint missing.',
    })
  }
  const currentHash = hashDeviceFingerprint(event, deviceFingerprint)
  if (currentHash !== claims.dfp_hash) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Emergency token device mismatch.',
    })
  }

  if (options?.consumeEmergencyJti !== false) {
    const consumed = await consumeEmergencyJti(event, claims.jti)
    if (!consumed) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Emergency token already used.',
      })
    }
  }

  const context: AdminControlContext = {
    adminId: claims.admin_id,
    actorId: await buildAdminActorId(event, 'B', claims.admin_id),
    channel: 'B',
    scope: claims.scope,
    restricted: true,
    tokenJti: claims.jti,
  }

  if (options?.applyWriteRateLimit !== false) {
    await enforceAdminRiskWriteRateLimit(event, context.adminId, context.actorId)
  }

  await appendAdminBreakglassAudit(event, {
    actorId: context.actorId,
    actorAdminId: context.adminId,
    channel: context.channel,
    action: options?.auditAction || 'admin.control.auth',
    scope: requiredScope ?? null,
    decision: 'authorized',
  })

  return context
}

async function requireOobChannel(
  event: H3Event,
  requiredScope: AdminRiskScope | undefined,
  options?: GuardOptions,
): Promise<AdminControlContext> {
  ensureAllowedChannel('C', options)
  const oob = requireAdminOobAuth(event)
  const scope = requiredScope ? [requiredScope] : [...ALL_RISK_SCOPES]
  const context: AdminControlContext = {
    adminId: null,
    actorId: oob.actorId,
    channel: 'C',
    scope,
    restricted: true,
  }

  if (options?.applyWriteRateLimit !== false) {
    await enforceAdminRiskWriteRateLimit(event, null, context.actorId)
  }

  await appendAdminBreakglassAudit(event, {
    actorId: context.actorId,
    actorAdminId: null,
    channel: context.channel,
    action: options?.auditAction || 'admin.control.auth',
    scope: requiredScope ?? null,
    decision: 'authorized',
    evidenceRef: oob.mtlsFingerprint ?? null,
  })

  return context
}

async function requireAdminSessionChannel(
  event: H3Event,
  requiredScope: AdminRiskScope | undefined,
  options?: GuardOptions,
): Promise<AdminControlContext> {
  ensureAllowedChannel('A', options)
  const { userId } = await requireAdmin(event)
  const requireStepUp = options?.requireStepUp !== false
  if (requireStepUp) {
    const loginToken = (getHeader(event, 'x-login-token') || '').trim()
    if (!loginToken) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Passkey step-up required.',
      })
    }
    const stepUpUser = await consumeLoginToken(event, loginToken, 'passkey')
    if (!stepUpUser || stepUpUser.id !== userId) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Passkey step-up required.',
      })
    }
  }

  const scope = resolveRequiredScopeSet(requiredScope)
  const context: AdminControlContext = {
    adminId: userId,
    actorId: await buildAdminActorId(event, 'A', userId),
    channel: 'A',
    scope,
    restricted: false,
  }

  if (options?.applyWriteRateLimit !== false) {
    await enforceAdminRiskWriteRateLimit(event, context.adminId, context.actorId)
  }

  await appendAdminBreakglassAudit(event, {
    actorId: context.actorId,
    actorAdminId: context.adminId,
    channel: context.channel,
    action: options?.auditAction || 'admin.control.auth',
    scope: requiredScope ?? null,
    decision: 'authorized',
  })

  return context
}

export async function requireAdminControlPlaneAuth(
  event: H3Event,
  requiredScope?: AdminRiskScope,
  options?: GuardOptions,
): Promise<AdminControlContext> {
  assertRiskControlEnabled(event)
  const path = event.path || event.node.req.url || ''
  const shouldUseOob = path.startsWith('/api/admin/oob/risk/')

  if (isPreserveInExtremeEnabled(event) && await isExtremeMode(event)) {
    if (!isControlPlanePreservedPath(path)) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Control plane restricted in EXTREME mode.',
      })
    }
  }

  if (!isProtectionEnabled(event)) {
    if (shouldUseOob)
      return requireOobChannel(event, requiredScope, options)
    return requireAdminSessionChannel(event, requiredScope, {
      ...options,
      requireStepUp: false,
      applyWriteRateLimit: false,
      consumeEmergencyJti: false,
    })
  }

  if (shouldUseOob) {
    return requireOobChannel(event, requiredScope, options)
  }

  const emergencyContext = await tryEmergencyChannel(event, requiredScope, options)
  if (emergencyContext)
    return emergencyContext

  return requireAdminSessionChannel(event, requiredScope, options)
}
