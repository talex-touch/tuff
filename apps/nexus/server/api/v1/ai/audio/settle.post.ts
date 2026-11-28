import { createError, defineEventHandler, readBody } from 'h3'
import { requireAppAuth } from '../../../../utils/auth'
import {
  claimRealtimeAsrSessionForSettlement,
  getRealtimeAsrSession,
  markRealtimeAsrSessionExpired,
  REALTIME_ASR_SETTLE_GRACE_MS,
} from '../../../../utils/asrRealtimeSessionStore'
import { consumeCredits } from '../../../../utils/creditsStore'
import { resolveSellableCreditPricingRule } from '../../../../utils/creditPricingStore'

function isCreditsExceededError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /credits exceeded/i.test(message)
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAppAuth(event)
  const body = await readBody(event)

  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_REQUEST_BODY' })
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  const durationMs = Number(body.durationMs)
  const transcriptUnits = Number(body.transcriptUnits)
  const requestId = typeof body.requestId === 'string' && body.requestId.trim() ? body.requestId.trim() : sessionId

  if (!sessionId || !Number.isFinite(durationMs) || durationMs < 0) {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_USAGE_PARAMETERS' })
  }

  const session = await getRealtimeAsrSession(event, userId, sessionId)
  if (!session) {
    throw createError({ statusCode: 404, statusMessage: 'ASR_SESSION_NOT_FOUND' })
  }

  if (session.status === 'released') {
    throw createError({ statusCode: 409, statusMessage: 'ASR_SESSION_CLOSED' })
  }

  const expiresAtMs = Date.parse(session.expiresAt)
  if (session.status === 'expired' || (Number.isFinite(expiresAtMs) && Date.now() > expiresAtMs + REALTIME_ASR_SETTLE_GRACE_MS)) {
    if (session.status === 'active') {
      await markRealtimeAsrSessionExpired(event, userId, sessionId)
    }
    return {
      settled: true,
      creditsCharged: Math.max(session.reservedCredits, session.chargedCredits ?? session.reservedCredits),
      creditsRefunded: 0,
      ledgerId: session.reservationLedgerId,
    }
  }

  const createdAtMs = Date.parse(session.createdAt)
  const elapsedSeconds = Number.isFinite(createdAtMs)
    ? Math.max(0, Math.min(session.ttlSeconds, Math.floor((Date.now() - createdAtMs) / 1000)))
    : session.ttlSeconds
  const units = Number.isFinite(transcriptUnits) && transcriptUnits > 0 ? Math.ceil(transcriptUnits) : 0
  const cumulativeDurationMs = (session.durationMs ?? 0) + Math.round(durationMs)
  const cumulativeUnits = (session.transcriptUnits ?? 0) + units
  const reportedSeconds = Math.max(0, Math.ceil(cumulativeDurationMs / 1000))
  const effectiveDurationSeconds = Math.max(reportedSeconds, elapsedSeconds)

  const pricing = session.pricing ?? await resolveSellableCreditPricingRule(event, 'audio.stt')
  const creditsPerSecond = pricing.creditsPerUnit ?? 4
  const secondaryCreditsPerUnit = pricing.secondaryCreditsPerUnit ?? 1
  const minCredits = pricing.minCredits ?? 1

  const rawCredits = Math.max(
    effectiveDurationSeconds * creditsPerSecond,
    cumulativeUnits * secondaryCreditsPerUnit,
    (cumulativeDurationMs > 0 || effectiveDurationSeconds > 0 || cumulativeUnits > 0) ? minCredits : 0,
  )

  // DashScope ephemeral tokens cannot be revoked once issued; treat the upfront reservation
  // as a non-refundable floor and only settle upward if cumulative usage exceeds it.
  const prevCharged = Math.max(session.reservedCredits, session.chargedCredits ?? session.reservedCredits)
  const targetChargedCredits = Math.max(prevCharged, Math.ceil(rawCredits))

  const claimed = await claimRealtimeAsrSessionForSettlement(event, userId, sessionId, {
    expectedChargedCredits: session.chargedCredits,
    chargedCredits: targetChargedCredits,
    durationMs: cumulativeDurationMs,
    transcriptUnits: cumulativeUnits,
  })
  if (!claimed) {
    const current = await getRealtimeAsrSession(event, userId, sessionId)
    if (!current || current.status === 'released') {
      throw createError({ statusCode: 409, statusMessage: 'ASR_SESSION_CLOSED' })
    }
    return {
      settled: true,
      creditsCharged: Math.max(current.reservedCredits, current.chargedCredits ?? current.reservedCredits),
      creditsRefunded: 0,
      ledgerId: current.reservationLedgerId,
    }
  }

  const finalCharged = Math.max(claimed.reservedCredits, claimed.chargedCredits ?? targetChargedCredits)
  const overageCredits = Math.max(0, finalCharged - prevCharged)
  let ledgerId = claimed.reservationLedgerId

  if (overageCredits > 0) {
    try {
      const overage = await consumeCredits(
        event,
        userId,
        overageCredits,
        'asr-realtime-overage',
        {
          sessionId,
          requestId,
          durationMs: cumulativeDurationMs,
          durationSeconds: effectiveDurationSeconds,
          transcriptUnits: cumulativeUnits,
          previousChargedCredits: prevCharged,
          chargedCredits: finalCharged,
          reservedCredits: claimed.reservedCredits,
        },
        {
          idempotencyKey: `asr-rt-overage:${sessionId}:${prevCharged}:${finalCharged}`,
        },
      )
      ledgerId = overage.ledgerId
    }
    catch (error) {
      if (isCreditsExceededError(error)) {
        throw createError({
          statusCode: 402,
          statusMessage: 'INSUFFICIENT_CREDITS',
          data: { errorCode: 'INSUFFICIENT_CREDITS' },
        })
      }
      throw error
    }
  }

  return {
    settled: true,
    creditsCharged: finalCharged,
    creditsRefunded: 0,
    ledgerId,
  }
})
