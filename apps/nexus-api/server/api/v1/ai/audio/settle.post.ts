import { createError, defineEventHandler, readBody } from 'h3'
import { requireAppAuth } from '../../../../utils/auth'
import { consumeCredits } from '../../../../utils/creditsStore'
import { resolveSellableCreditPricingRule } from '../../../../utils/creditPricingStore'

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

  const durationSeconds = Math.max(0, Math.ceil(durationMs / 1000))
  const units = Number.isFinite(transcriptUnits) && transcriptUnits > 0 ? Math.ceil(transcriptUnits) : 0

  const pricing = await resolveSellableCreditPricingRule(event, 'audio.stt')
  const creditsPerSecond = pricing.creditsPerUnit ?? 4
  const secondaryCreditsPerUnit = pricing.secondaryCreditsPerUnit ?? 1
  const minCredits = pricing.minCredits ?? 1

  const baseCredits = Math.max(
    durationSeconds * creditsPerSecond,
    units * secondaryCreditsPerUnit,
    durationMs > 0 ? minCredits : 0
  )

  if (baseCredits <= 0) {
    return { settled: true, creditsCharged: 0 }
  }

  const result = await consumeCredits(
    event,
    userId,
    baseCredits,
    'asr:qwen-realtime',
    {
      sessionId,
      durationMs,
      durationSeconds,
      transcriptUnits: units,
      requestId,
    },
    { idempotencyKey: `asr-settle:${sessionId}` },
  )

  return {
    settled: true,
    creditsCharged: baseCredits,
    ledgerId: result.ledgerId,
  }
})
