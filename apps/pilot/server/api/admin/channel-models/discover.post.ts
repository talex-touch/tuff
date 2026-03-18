import { createError } from 'h3'
import { requirePilotAdmin } from '../../../utils/pilot-admin-auth'
import { discoverPilotChannelModels } from '../../../utils/pilot-channel-model-sync'

interface DiscoverChannelModelsBody {
  channelId?: string
  baseUrl?: string
  apiKey?: string
  timeoutMs?: number
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  await requirePilotAdmin(event)
  const body = await readBody<DiscoverChannelModelsBody>(event)

  try {
    const result = await discoverPilotChannelModels(event, {
      channelId: normalizeText(body?.channelId),
      baseUrl: normalizeText(body?.baseUrl),
      apiKey: normalizeText(body?.apiKey),
      timeoutMs: body?.timeoutMs,
    })

    return {
      ok: true,
      channelId: result.channelId,
      models: result.models,
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : '获取渠道模型失败'
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message,
    })
  }
})
