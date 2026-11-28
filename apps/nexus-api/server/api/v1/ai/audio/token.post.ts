import { randomUUID } from 'node:crypto'
import { defineEventHandler } from 'h3'
import { requireAppAuth } from '../../../../utils/auth'
import { resolveDashScopeAsrProvider } from '../../../../utils/asrTranscriptionService'
import { createDashScopeEphemeralToken } from '../../../../utils/dashscopeAsrProvider'
import { enforceRateLimit } from '../../../../utils/rateLimit'

const ASR_TOKEN_RATE_LIMIT = { limit: 30, windowMs: 60_000 } as const

export default defineEventHandler(async (event) => {
  const { userId } = await requireAppAuth(event)
  await enforceRateLimit(event, {
    key: `asr-token:user:${userId}`,
    ...ASR_TOKEN_RATE_LIMIT,
  })

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
