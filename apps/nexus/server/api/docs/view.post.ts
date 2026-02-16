import { getHeader, setCookie } from 'h3'
import { resolveRequestIp } from '../../utils/ipSecurityStore'
import {
  createDocChallenge,
  createDocEngagementSession,
  createDocToken,
  ensureDocAnalyticsSchema,
  expirePendingSessions,
  getDocSecurityState,
  incrementDocView,
  isAllowedDocPathForSource,
  normalizeDocPath,
  normalizeDocSourceType,
  recordDocViolation,
} from '../../utils/docAnalyticsStore'
import { readCloudflareBindings } from '../../utils/cloudflare'

const SESSION_TTL_MS = 10 * 60_000
const CHALLENGE_TTL_MS = 10 * 60_000
const CHALLENGE_COOKIE = 'nexus_doc_challenge'
const EXPIRED_SESSION_VIOLATION_WEIGHT_CAP = 2
const ENFORCE_DOC_SECURITY = process.env.NODE_ENV === 'production'
  || process.env.DOC_ANALYTICS_ENFORCE_SECURITY === 'true'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ path: string, clientId?: string, title?: string, source?: string }>(event)
  const docPath = body?.path
  const sourceType = normalizeDocSourceType(body?.source)
  const headerDeviceId = getHeader(event, 'x-device-id')
  const clientId = typeof body?.clientId === 'string' && body.clientId.trim()
    ? body.clientId.trim()
    : (typeof headerDeviceId === 'string' ? headerDeviceId.trim() : '')
  const title = typeof body?.title === 'string' ? body.title : ''

  if (!docPath || typeof docPath !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing or invalid path parameter',
    })
  }

  if (!clientId || typeof clientId !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing client id',
    })
  }

  const normalizedPath = normalizeDocPath(docPath)
  if (!isAllowedDocPathForSource(normalizedPath, sourceType)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid doc path',
    })
  }

  const bindings = readCloudflareBindings(event)
  if (!bindings?.DB) {
    return {
      success: true,
      views: 1,
      source: 'memory',
      riskLevel: 0,
      sessionId: null,
      token: null,
      challenge: null,
    }
  }

  const db = bindings.DB
  await ensureDocAnalyticsSchema(db)

  const ip = resolveRequestIp(event) || ''

  // TODO-SEC-1: 接入全局风险引擎后，替换当前 docs 独立风险状态读取逻辑。
  if (ip) {
    if (ENFORCE_DOC_SECURITY) {
      const security = await getDocSecurityState(db, ip, clientId)
      if (security?.blockedUntil && security.blockedUntil > Date.now()) {
        throw createError({ statusCode: 403, statusMessage: 'IP blocked' })
      }
    }

    const expiredCount = await expirePendingSessions(db, {
      ip,
      clientId,
      now: Date.now(),
    })
    if (ENFORCE_DOC_SECURITY && expiredCount > 0) {
      const updated = await recordDocViolation(db, {
        ip,
        clientId,
        weight: Math.min(expiredCount, EXPIRED_SESSION_VIOLATION_WEIGHT_CAP),
      })
      if (updated.blockedUntil && updated.blockedUntil > Date.now()) {
        throw createError({ statusCode: 403, statusMessage: 'IP blocked' })
      }
    }
  }

  const views = await incrementDocView(db, {
    path: normalizedPath,
    title,
  })

  const security = ip && ENFORCE_DOC_SECURITY ? await getDocSecurityState(db, ip, clientId) : null
  const riskLevel = security?.riskLevel ?? 0

  const session = await createDocEngagementSession(db, {
    path: normalizedPath,
    sourceType,
    clientId,
    ip: ip || null,
    riskLevel,
    ttlMs: SESSION_TTL_MS,
  })

  const token = createDocToken({
    sid: session.sessionId,
    path: session.path,
    cid: session.clientId,
    src: session.sourceType,
    rl: session.riskLevel,
  })

  let challengeInfo: { challengeId: string, seed: string, difficulty: number } | null = null
  if (riskLevel >= 1) {
    const challenge = await createDocChallenge(db, {
      sessionId: session.sessionId,
      riskLevel,
      ttlMs: CHALLENGE_TTL_MS,
    })
    challengeInfo = {
      challengeId: challenge.challengeId,
      seed: challenge.seed,
      difficulty: challenge.difficulty,
    }

    setCookie(event, CHALLENGE_COOKIE, challenge.challengeId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: Math.floor(CHALLENGE_TTL_MS / 1000),
      path: '/',
    })
  }

  return {
    success: true,
    views,
    source: 'd1',
    riskLevel,
    sessionId: session.sessionId,
    token,
    challenge: challengeInfo,
  }
})
