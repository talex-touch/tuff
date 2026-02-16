import { getCookie } from 'h3'
import { resolveRequestIp } from '../../utils/ipSecurityStore'
import { readCloudflareBindings } from '../../utils/cloudflare'
import {
  buildPayloadHash,
  ensureDocAnalyticsSchema,
  getDocChallenge,
  getDocEngagementSession,
  getDocSecurityState,
  markDocSessionReported,
  normalizeDocPath,
  recordDocEngagement,
  recordDocViolation,
  registerDocNonce,
  sha256Hex,
  validatePow,
  verifyDocToken,
} from '../../utils/docAnalyticsStore'

const NONCE_TTL_MS = 15 * 60_000
const CHALLENGE_COOKIE = 'nexus_doc_challenge'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
  const token = typeof body?.token === 'string' ? body.token : ''
  const clientId = typeof body?.clientId === 'string' ? body.clientId : ''
  const nonce = typeof body?.nonce === 'string' ? body.nonce : ''
  const payloadHash = typeof body?.payloadHash === 'string' ? body.payloadHash : ''
  const proof = typeof body?.proof === 'string' ? body.proof : ''
  const powNonce = typeof body?.powNonce === 'string' ? body.powNonce : ''

  if (!sessionId || !token || !clientId || !nonce || !payloadHash) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }

  const payload = verifyDocToken(token)
  if (!payload || payload.sid !== sessionId || payload.cid !== clientId) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid token' })
  }

  const bindings = readCloudflareBindings(event)
  if (!bindings?.DB) {
    return { success: true, source: 'memory' }
  }

  const db = bindings.DB
  await ensureDocAnalyticsSchema(db)

  const session = await getDocEngagementSession(db, sessionId)
  if (!session || session.status !== 'pending') {
    throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  }

  const ip = resolveRequestIp(event) || session.ip || ''

  if (ip) {
    const security = await getDocSecurityState(db, ip, clientId)
    if (security?.blockedUntil && security.blockedUntil > Date.now()) {
      throw createError({ statusCode: 403, statusMessage: 'IP blocked' })
    }
  }

  if (session.path !== payload.path) {
    if (ip)
      await recordDocViolation(db, { ip, clientId, weight: 2 })
    throw createError({ statusCode: 403, statusMessage: 'Invalid path' })
  }

  const nonceHash = sha256Hex(`${sessionId}:${nonce}`)
  const nonceInserted = await registerDocNonce(db, {
    sessionId,
    nonceHash,
    ttlMs: NONCE_TTL_MS,
  })
  if (!nonceInserted) {
    if (ip)
      await recordDocViolation(db, { ip, clientId, weight: 2 })
    throw createError({ statusCode: 409, statusMessage: 'Nonce already used' })
  }

  const normalizedPath = normalizeDocPath(body?.path || session.path)
  const engagementPayload = {
    path: normalizedPath,
    title: typeof body?.title === 'string' ? body.title : '',
    activeMs: Number(body?.activeDurationMs ?? 0) || 0,
    totalMs: Number(body?.totalDurationMs ?? 0) || 0,
    sections: Array.isArray(body?.sections) ? body.sections : [],
    actions: Array.isArray(body?.actions) ? body.actions : [],
  }

  const expectedHash = buildPayloadHash(engagementPayload)
  if (payloadHash !== expectedHash) {
    if (ip)
      await recordDocViolation(db, { ip, clientId, weight: 2 })
    throw createError({ statusCode: 403, statusMessage: 'Payload hash mismatch' })
  }

  if (session.riskLevel >= 1) {
    const cookieChallenge = getCookie(event, CHALLENGE_COOKIE) || ''
    const challengeId = session.challengeId || ''
    if (!cookieChallenge || cookieChallenge !== challengeId) {
      if (ip)
        await recordDocViolation(db, { ip, clientId, weight: 2 })
      throw createError({ statusCode: 403, statusMessage: 'Challenge cookie mismatch' })
    }

    const challenge = await getDocChallenge(db, challengeId)
    if (!challenge || challenge.expiresAt < Date.now()) {
      if (ip)
        await recordDocViolation(db, { ip, clientId, weight: 2 })
      throw createError({ statusCode: 403, statusMessage: 'Challenge expired' })
    }

    const expectedProof = sha256Hex(`${challenge.seed}${nonce}${payloadHash}`)
    if (proof !== expectedProof) {
      if (ip)
        await recordDocViolation(db, { ip, clientId, weight: 2 })
      throw createError({ statusCode: 403, statusMessage: 'Proof mismatch' })
    }

    if (session.riskLevel >= 2 && !validatePow(proof, powNonce, challenge.difficulty)) {
      if (ip)
        await recordDocViolation(db, { ip, clientId, weight: 2 })
      throw createError({ statusCode: 403, statusMessage: 'PoW invalid' })
    }
  }

  await recordDocEngagement(db, {
    path: normalizedPath,
    title: engagementPayload.title,
    activeMs: Math.max(0, Math.round(engagementPayload.activeMs)),
    totalMs: Math.max(0, Math.round(engagementPayload.totalMs)),
    sections: engagementPayload.sections.map((section: any) => ({
      id: typeof section.id === 'string' ? section.id : '',
      title: typeof section.title === 'string' ? section.title : '',
      activeMs: Number(section.activeMs ?? 0) || 0,
      totalMs: Number(section.totalMs ?? 0) || 0,
    })),
    actions: engagementPayload.actions.map((action: any) => ({
      type: typeof action.type === 'string' ? action.type : '',
      source: typeof action.source === 'string' ? action.source : '',
      sectionId: typeof action.sectionId === 'string' ? action.sectionId : 'root',
      sectionTitle: typeof action.sectionTitle === 'string' ? action.sectionTitle : '',
      count: Number(action.count ?? 0) || 0,
    })),
  })

  await markDocSessionReported(db, sessionId)

  return { success: true, source: 'd1' }
})
