import { setCookie } from 'h3'
import { resolveRequestIp } from '../../utils/ipSecurityStore'
import {
  createDocChallenge,
  createDocEngagementSession,
  createDocToken,
  ensureDocAnalyticsSchema,
  expirePendingSessions,
  getDocSecurityState,
  incrementDocView,
  normalizeDocPath,
  recordDocViolation,
} from '../../utils/docAnalyticsStore'
import { readCloudflareBindings } from '../../utils/cloudflare'

const SESSION_TTL_MS = 10 * 60_000
const CHALLENGE_TTL_MS = 10 * 60_000
const CHALLENGE_COOKIE = 'nexus_doc_challenge'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ path: string, clientId?: string, title?: string }>(event)
  const docPath = body?.path
  const clientId = body?.clientId
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
  if (!normalizedPath.startsWith('docs/')) {
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
    }
  }

  const db = bindings.DB
  await ensureDocAnalyticsSchema(db)

  const ip = resolveRequestIp(event) || ''

  if (ip) {
    const security = await getDocSecurityState(db, ip, clientId)
    if (security?.blockedUntil && security.blockedUntil > Date.now()) {
      throw createError({ statusCode: 403, statusMessage: 'IP blocked' })
    }

    const expiredCount = await expirePendingSessions(db, {
      ip,
      clientId,
      now: Date.now(),
    })
    if (expiredCount > 0) {
      const updated = await recordDocViolation(db, { ip, clientId, weight: expiredCount })
      if (updated.blockedUntil && updated.blockedUntil > Date.now()) {
        throw createError({ statusCode: 403, statusMessage: 'IP blocked' })
      }
    }
  }

  const views = await incrementDocView(db, {
    path: normalizedPath,
    title,
  })

  const security = ip ? await getDocSecurityState(db, ip, clientId) : null
  const riskLevel = security?.riskLevel ?? 0

  const session = await createDocEngagementSession(db, {
    path: normalizedPath,
    clientId,
    ip: ip || null,
    riskLevel,
    ttlMs: SESSION_TTL_MS,
  })

  const token = createDocToken({
    sid: session.sessionId,
    path: session.path,
    cid: session.clientId,
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
