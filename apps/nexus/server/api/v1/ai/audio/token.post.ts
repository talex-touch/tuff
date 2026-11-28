import { randomUUID } from 'node:crypto'
import { createError, defineEventHandler } from 'h3'
import { requireAppAuth, requireVerifiedEmail } from '../../../../utils/auth'
import { enforceAdminRateLimit } from '../../../../utils/adminRateLimitStore'
import {
  countActiveRealtimeAsrSessions,
  createRealtimeAsrSession,
  expireStaleRealtimeAsrSessions,
  markRealtimeAsrSessionReleased,
  REALTIME_ASR_MAX_CONCURRENT_SESSIONS,
  REALTIME_ASR_TTL_SECONDS,
} from '../../../../utils/asrRealtimeSessionStore'
import { resolveDashScopeAsrProvider } from '../../../../utils/asrTranscriptionService'
import { computeCreditReservation, resolveSellableCreditPricingRule } from '../../../../utils/creditPricingStore'
import { consumeCredits, releaseConsumedCredits } from '../../../../utils/creditsStore'
import { createDashScopeEphemeralToken } from '../../../../utils/dashscopeAsrProvider'

const ASR_TOKEN_RATE_LIMIT = { limit: 10, windowMs: 60_000, blockMs: 60_000 } as const

function isCreditsExceededError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /credits exceeded/i.test(message)
}

export default defineEventHandler(async (event) => {
  const appAuth = await requireAppAuth(event)
  const { userId } = await requireVerifiedEmail(event, appAuth)

  await enforceAdminRateLimit(event, {
    key: `asr-token:user:${userId}`,
    ...ASR_TOKEN_RATE_LIMIT,
  })

  await expireStaleRealtimeAsrSessions(event, userId)
  const activeCount = await countActiveRealtimeAsrSessions(event, userId)
  if (activeCount >= REALTIME_ASR_MAX_CONCURRENT_SESSIONS) {
    throw createError({
      statusCode: 429,
      statusMessage: 'ASR_CONCURRENT_LIMIT_EXCEEDED',
      data: { errorCode: 'ASR_CONCURRENT_LIMIT_EXCEEDED' },
    })
  }

  const [{ provider }, pricing] = await Promise.all([
    resolveDashScopeAsrProvider(event, userId),
    resolveSellableCreditPricingRule(event, 'audio.stt'),
  ])

  const sessionId = randomUUID()
  const reservedCredits = computeCreditReservation(pricing, { seconds: REALTIME_ASR_TTL_SECONDS })

  let reservationLedgerId: string
  try {
    const reservation = await consumeCredits(
      event,
      userId,
      reservedCredits,
      'asr-realtime-reservation',
      {
        sessionId,
        providerId: provider.id,
        capability: 'audio.stt',
        ttlSeconds: REALTIME_ASR_TTL_SECONDS,
        reservedCredits,
      },
      { idempotencyKey: `asr-rt-reserve:${sessionId}` },
    )
    reservationLedgerId = reservation.ledgerId
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

  const releaseHold = async (reasonCode: string) => {
    await releaseConsumedCredits(
      event,
      userId,
      reservedCredits,
      'asr-realtime-reservation-release',
      {
        sessionId,
        providerId: provider.id,
        capability: 'audio.stt',
        reasonCode,
      },
      {
        idempotencyKey: `asr-rt-release:${sessionId}:0`,
        reservationLedgerId,
      },
    ).catch(() => {})
  }

  const created = await createRealtimeAsrSession(event, {
    sessionId,
    userId,
    providerId: provider.id,
    ttlSeconds: REALTIME_ASR_TTL_SECONDS,
    reservedCredits,
    reservationLedgerId,
    pricing,
    maxConcurrent: REALTIME_ASR_MAX_CONCURRENT_SESSIONS,
  })
  if (!created.created) {
    await releaseHold('concurrent_limit')
    throw createError({
      statusCode: 429,
      statusMessage: 'ASR_CONCURRENT_LIMIT_EXCEEDED',
      data: { errorCode: 'ASR_CONCURRENT_LIMIT_EXCEEDED' },
    })
  }

  let ephemeral: { token: string, expiresAt: number }
  try {
    ephemeral = await createDashScopeEphemeralToken(event, provider, REALTIME_ASR_TTL_SECONDS)
  }
  catch (error) {
    await releaseHold('provider_token_failed')
    await markRealtimeAsrSessionReleased(event, sessionId).catch(() => {})
    throw error
  }

  return {
    token: ephemeral.token,
    expiresAt: ephemeral.expiresAt,
    websocketUrl: 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime',
    model: 'qwen3-asr-flash-realtime',
    sessionId,
    reservedCredits,
  }
})
