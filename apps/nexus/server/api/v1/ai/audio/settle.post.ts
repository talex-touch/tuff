import { createError, defineEventHandler, readBody } from 'h3'
import { requireAppAuth } from '../../../../utils/auth'
import {
  claimRealtimeAsrSessionForSettlement,
  getRealtimeAsrSession,
  markRealtimeAsrSessionCreditsReleased,
  markRealtimeAsrSessionExpired,
  REALTIME_ASR_SETTLE_GRACE_MS,
  type RealtimeAsrSessionRecord,
} from '../../../../utils/asrRealtimeSessionStore'
import { releaseConsumedCredits } from '../../../../utils/creditsStore'
import { resolveSellableCreditPricingRule } from '../../../../utils/creditPricingStore'

async function finishSessionRefund(
  event: Parameters<typeof releaseConsumedCredits>[0],
  session: RealtimeAsrSessionRecord,
  chargedCredits: number,
  meta: Record<string, unknown>,
): Promise<number> {
  if (session.creditsReleasedAt)
    return Math.max(0, session.reservedCredits - chargedCredits)

  const refundCredits = Math.max(0, session.reservedCredits - chargedCredits)
  if (refundCredits > 0) {
    await releaseConsumedCredits(
      event,
      session.userId,
      refundCredits,
      'asr-realtime-reservation-release',
      meta,
      {
        idempotencyKey: `asr-rt-release:${session.id}:${chargedCredits}`,
        reservationLedgerId: session.reservationLedgerId,
      },
    )
  }
  await markRealtimeAsrSessionCreditsReleased(event, session.id)
  return refundCredits
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
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : sessionId

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

  if (session.status === 'settled') {
    const settledCharge = session.chargedCredits ?? session.reservedCredits
    const refunded = await finishSessionRefund(event, session, settledCharge, {
      sessionId,
      requestId,
      chargedCredits: settledCharge,
      reservedCredits: session.reservedCredits,
    })
    return {
      settled: true,
      creditsCharged: settledCharge,
      creditsRefunded: refunded,
      ledgerId: session.reservationLedgerId,
    }
  }

  const expiresAtMs = Date.parse(session.expiresAt)
  if (session.status === 'expired' || (Number.isFinite(expiresAtMs) && Date.now() > expiresAtMs + REALTIME_ASR_SETTLE_GRACE_MS)) {
    if (session.status === 'active') {
      await markRealtimeAsrSessionExpired(event, userId, sessionId)
    }
    return {
      settled: true,
      creditsCharged: session.reservedCredits,
      creditsRefunded: 0,
      ledgerId: session.reservationLedgerId,
    }
  }

  const createdAtMs = Date.parse(session.createdAt)
  const elapsedSeconds = Number.isFinite(createdAtMs)
    ? Math.max(0, Math.min(session.ttlSeconds, Math.floor((Date.now() - createdAtMs) / 1000)))
    : session.ttlSeconds
  const reportedSeconds = Math.min(session.ttlSeconds, Math.max(0, Math.ceil(durationMs / 1000)))
  // Enforce a server-side wall-clock floor so a client cannot hold a token for minutes and report 0ms.
  const effectiveDurationSeconds = Math.max(reportedSeconds, elapsedSeconds)
  const units = Number.isFinite(transcriptUnits) && transcriptUnits > 0 ? Math.ceil(transcriptUnits) : 0

  const pricing = session.pricing ?? await resolveSellableCreditPricingRule(event, 'audio.stt')
  const creditsPerSecond = pricing.creditsPerUnit ?? 4
  const secondaryCreditsPerUnit = pricing.secondaryCreditsPerUnit ?? 1
  const minCredits = pricing.minCredits ?? 1

  const rawCredits = Math.max(
    effectiveDurationSeconds * creditsPerSecond,
    units * secondaryCreditsPerUnit,
    (durationMs > 0 || effectiveDurationSeconds > 0 || units > 0) ? minCredits : 0,
  )
  const chargedCredits = Math.min(session.reservedCredits, Math.max(0, Math.ceil(rawCredits)))

  const claimed = await claimRealtimeAsrSessionForSettlement(event, userId, sessionId, {
    chargedCredits,
    durationMs: Math.round(durationMs),
    transcriptUnits: units,
  })
  if (!claimed) {
    const current = await getRealtimeAsrSession(event, userId, sessionId)
    if (!current || current.status === 'released') {
      throw createError({ statusCode: 409, statusMessage: 'ASR_SESSION_CLOSED' })
    }
    const finalCharge = current.chargedCredits ?? current.reservedCredits
    const refunded = current.status === 'settled'
      ? await finishSessionRefund(event, current, finalCharge, {
          sessionId,
          requestId,
          chargedCredits: finalCharge,
          reservedCredits: current.reservedCredits,
        })
      : 0
    return {
      settled: true,
      creditsCharged: finalCharge,
      creditsRefunded: refunded,
      ledgerId: current.reservationLedgerId,
    }
  }

  const creditsRefunded = await finishSessionRefund(event, claimed, chargedCredits, {
    sessionId,
    durationMs,
    durationSeconds: effectiveDurationSeconds,
    transcriptUnits: units,
    requestId,
    chargedCredits,
    reservedCredits: claimed.reservedCredits,
  })

  return {
    settled: true,
    creditsCharged: chargedCredits,
    creditsRefunded,
    ledgerId: claimed.reservationLedgerId,
  }
})
