import { getCookie, getHeader } from 'h3'
import type { H3Event } from 'h3'
import { resolveRequestIp } from '../../utils/ipSecurityStore'
import { readCloudflareBindings } from '../../utils/cloudflare'
import {
  buildPayloadHash,
  ensureDocAnalyticsSchema,
  getDocChallenge,
  getDocEngagementSession,
  getDocSecurityState,
  isAllowedDocPathForSource,
  markDocSessionReported,
  normalizeDocPath,
  normalizeDocSourceType,
  recordDocEngagement,
  recordDocViolation,
  registerDocNonce,
  sha256Hex,
  validatePow,
  verifyDocToken,
} from '../../utils/docAnalyticsStore'

const NONCE_TTL_MS = 15 * 60_000
const CHALLENGE_COOKIE = 'nexus_doc_challenge'
const MAX_ACTIONS = 80
const MAX_HEAT_BUCKETS = 200
const ENFORCE_DOC_SECURITY = process.env.NODE_ENV === 'production'
  || process.env.DOC_ANALYTICS_ENFORCE_SECURITY === 'true'

function sanitizeSections(input: unknown): { sections: any[], truncated: boolean } {
  const list = Array.isArray(input) ? input : []
  let truncated = false
  let heatBucketCount = 0

  const sections = list
    .slice(0, 80)
    .map((entry) => {
      const section = typeof entry === 'object' && entry ? entry as Record<string, any> : {}
      const bucketsRaw = Array.isArray(section.buckets) ? section.buckets : []
      const buckets: Array<{ bucket: number, activeMs: number, totalMs: number }> = []

      for (const bucketEntry of bucketsRaw) {
        if (heatBucketCount >= MAX_HEAT_BUCKETS) {
          truncated = true
          break
        }

        const raw = typeof bucketEntry === 'object' && bucketEntry ? bucketEntry as Record<string, any> : {}
        const bucket = Math.max(0, Math.min(19, Math.round(Number(raw.bucket ?? 0) || 0)))
        const activeMs = Math.max(0, Math.round(Number(raw.activeMs ?? 0) || 0))
        const totalMs = Math.max(0, Math.round(Number(raw.totalMs ?? 0) || 0))

        if (!activeMs && !totalMs)
          continue

        buckets.push({ bucket, activeMs, totalMs })
        heatBucketCount++
      }

      return {
        id: typeof section.id === 'string' ? section.id : '',
        title: typeof section.title === 'string' ? section.title : '',
        activeMs: Math.max(0, Math.round(Number(section.activeMs ?? 0) || 0)),
        totalMs: Math.max(0, Math.round(Number(section.totalMs ?? 0) || 0)),
        buckets,
      }
    })

  if (list.length > sections.length)
    truncated = true

  return { sections, truncated }
}

function sanitizeActions(input: unknown): { actions: any[], truncated: boolean } {
  const list = Array.isArray(input) ? input : []
  const truncated = list.length > MAX_ACTIONS
  const actions = list.slice(0, MAX_ACTIONS).map((entry) => {
    const action = typeof entry === 'object' && entry ? entry as Record<string, any> : {}
    const anchorBucketRaw = Number(action.anchorBucket ?? -1)

    return {
      type: typeof action.type === 'string' ? action.type : '',
      source: typeof action.source === 'string' ? action.source : '',
      sectionId: typeof action.sectionId === 'string' ? action.sectionId : 'root',
      sectionTitle: typeof action.sectionTitle === 'string' ? action.sectionTitle : '',
      count: Math.max(0, Math.round(Number(action.count ?? 0) || 0)),
      textHash: typeof action.textHash === 'string' ? action.textHash : '',
      textLength: Math.max(0, Math.round(Number(action.textLength ?? 0) || 0)),
      anchorStart: Math.max(0, Math.round(Number(action.anchorStart ?? 0) || 0)),
      anchorEnd: Math.max(0, Math.round(Number(action.anchorEnd ?? 0) || 0)),
      anchorBucket: Math.max(-1, Math.min(19, Math.round(Number.isFinite(anchorBucketRaw) ? anchorBucketRaw : -1))),
    }
  })

  return { actions, truncated }
}

function resolveClientId(event: H3Event, bodyClientId: unknown): string {
  if (typeof bodyClientId === 'string' && bodyClientId.trim())
    return bodyClientId.trim()
  const header = getHeader(event, 'x-device-id')
  return typeof header === 'string' ? header.trim() : ''
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
  const token = typeof body?.token === 'string' ? body.token : ''
  const clientId = resolveClientId(event, body?.clientId)
  const nonce = typeof body?.nonce === 'string' ? body.nonce : ''
  const payloadHash = typeof body?.payloadHash === 'string' ? body.payloadHash : ''
  const proof = typeof body?.proof === 'string' ? body.proof : ''
  const powNonce = typeof body?.powNonce === 'string' ? body.powNonce : ''
  const sourceType = normalizeDocSourceType(body?.source)

  if (!sessionId || !token || !clientId || !nonce || !payloadHash) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }

  const payload = verifyDocToken(token)
  if (!payload || payload.sid !== sessionId || payload.cid !== clientId || payload.src !== sourceType) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid token' })
  }

  const bindings = readCloudflareBindings(event)
  if (!bindings?.DB)
    return { success: true, source: 'memory', truncated: false }

  const db = bindings.DB
  await ensureDocAnalyticsSchema(db)

  const session = await getDocEngagementSession(db, sessionId)
  if (!session || (session.status !== 'pending' && session.status !== 'reported')) {
    throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  }

  if (session.sourceType !== sourceType) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid source' })
  }

  const normalizedPath = normalizeDocPath(body?.path || session.path)
  if (normalizedPath !== session.path || normalizedPath !== payload.path || !isAllowedDocPathForSource(normalizedPath, sourceType)) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid path' })
  }

  const ip = resolveRequestIp(event) || session.ip || ''

  // TODO-SEC-2: 回源 IP 信任边界与全局链路合并后，统一使用全局可信 IP 解析结果。
  if (ip && ENFORCE_DOC_SECURITY) {
    const security = await getDocSecurityState(db, ip, clientId)
    if (security?.blockedUntil && security.blockedUntil > Date.now()) {
      throw createError({ statusCode: 403, statusMessage: 'IP blocked' })
    }
  }

  const nonceHash = sha256Hex(`${sessionId}:${nonce}`)
  const nonceInserted = await registerDocNonce(db, {
    sessionId,
    nonceHash,
    ttlMs: NONCE_TTL_MS,
  })
  if (!nonceInserted) {
    if (ip && ENFORCE_DOC_SECURITY)
      await recordDocViolation(db, { ip, clientId, weight: 2 })
    throw createError({ statusCode: 409, statusMessage: 'Nonce already used' })
  }

  const { sections, truncated: sectionTruncated } = sanitizeSections(body?.sections)
  const { actions, truncated: actionTruncated } = sanitizeActions(body?.actions)

  const engagementPayload = {
    path: normalizedPath,
    title: typeof body?.title === 'string' ? body.title : '',
    source: sourceType,
    activeMs: Math.max(0, Math.round(Number(body?.activeDurationMs ?? 0) || 0)),
    totalMs: Math.max(0, Math.round(Number(body?.totalDurationMs ?? 0) || 0)),
    sections,
    actions,
  }

  const expectedHash = buildPayloadHash(engagementPayload)
  if (payloadHash !== expectedHash) {
    if (ip && ENFORCE_DOC_SECURITY)
      await recordDocViolation(db, { ip, clientId, weight: 2 })
    throw createError({ statusCode: 403, statusMessage: 'Payload hash mismatch' })
  }

  if (session.riskLevel >= 1) {
    const cookieChallenge = getCookie(event, CHALLENGE_COOKIE) || ''
    const challengeId = session.challengeId || ''
    if (!cookieChallenge || cookieChallenge !== challengeId) {
      if (ip && ENFORCE_DOC_SECURITY)
        await recordDocViolation(db, { ip, clientId, weight: 2 })
      throw createError({ statusCode: 403, statusMessage: 'Challenge cookie mismatch' })
    }

    const challenge = await getDocChallenge(db, challengeId)
    if (!challenge || challenge.expiresAt < Date.now()) {
      if (ip && ENFORCE_DOC_SECURITY)
        await recordDocViolation(db, { ip, clientId, weight: 2 })
      throw createError({ statusCode: 403, statusMessage: 'Challenge expired' })
    }

    const expectedProof = sha256Hex(`${challenge.seed}${nonce}${payloadHash}`)
    if (proof !== expectedProof) {
      if (ip && ENFORCE_DOC_SECURITY)
        await recordDocViolation(db, { ip, clientId, weight: 2 })
      throw createError({ statusCode: 403, statusMessage: 'Proof mismatch' })
    }

    if (session.riskLevel >= 2 && !validatePow(proof, powNonce, challenge.difficulty)) {
      if (ip && ENFORCE_DOC_SECURITY)
        await recordDocViolation(db, { ip, clientId, weight: 2 })
      throw createError({ statusCode: 403, statusMessage: 'PoW invalid' })
    }
  }

  await recordDocEngagement(db, {
    path: normalizedPath,
    title: engagementPayload.title,
    sourceType,
    activeMs: engagementPayload.activeMs,
    totalMs: engagementPayload.totalMs,
    sections,
    actions,
  })

  await markDocSessionReported(db, sessionId)

  return { success: true, source: 'd1', truncated: sectionTruncated || actionTruncated }
})
