import { randomUUID } from 'node:crypto'
import { createError, defineEventHandler } from 'h3'
import { requireAppAuth } from '../../../../utils/auth'
import { resolveDashScopeAsrProvider } from '../../../../utils/asrTranscriptionService'
import { getCreditSummary } from '../../../../utils/creditsStore'
import { createDashScopeEphemeralToken } from '../../../../utils/dashscopeAsrProvider'
import { enforceRateLimit } from '../../../../utils/rateLimit'

const ASR_TOKEN_RATE_LIMIT = { limit: 30, windowMs: 60_000 } as const

export default defineEventHandler(async (event) => {
  const { userId } = await requireAppAuth(event)
  await enforceRateLimit(event, {
    key: `asr-token:user:${userId}`,
    ...ASR_TOKEN_RATE_LIMIT,
  })

  const summary = await getCreditSummary(event, userId)
  const userRemaining = Number(summary.user?.quota ?? 0) - Number(summary.user?.used ?? 0)
  const teamRemaining = Number(summary.team?.quota ?? 0) - Number(summary.team?.used ?? 0)
  if (!(userRemaining > 0 && teamRemaining > 0)) {
    throw createError({
      statusCode: 402,
      statusMessage: 'INSUFFICIENT_CREDITS',
      data: { errorCode: 'INSUFFICIENT_CREDITS' },
    })
  }

  const { provider } = await resolveDashScopeAsrProvider(event, userId)
  const ephemeral = await createDashScopeEphemeralToken(event, provider, 300)

  return {
    token: ephemeral.token,
    expiresAt: ephemeral.expiresAt,
    websocketUrl: 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime',
    model: 'qwen3-asr-flash-realtime',
    sessionId: randomUUID(),
  }
})
