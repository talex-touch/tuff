import { createError, defineEventHandler, readBody } from 'h3'
import { requirePilotAuth } from '../../../utils/auth'
import { discoverPilotChannelModels } from '../../../utils/pilot-channel-model-sync'
import { quotaOk } from '../../../utils/quota-api'

interface RuntimeImageModelsBody {
  baseUrl?: string
  apiKey?: string
  timeoutMs?: number
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeTimeoutMs(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return undefined
  }
  return Math.min(Math.max(Math.floor(parsed), 3_000), 120_000)
}

export default defineEventHandler(async (event) => {
  requirePilotAuth(event)
  const body = await readBody<RuntimeImageModelsBody>(event)

  const baseUrl = normalizeText(body?.baseUrl)
  const apiKey = normalizeText(body?.apiKey)
  if (!baseUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Base URL 不能为空',
    })
  }
  if (!apiKey) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'API Key 不能为空',
    })
  }

  try {
    const result = await discoverPilotChannelModels(event, {
      baseUrl,
      apiKey,
      timeoutMs: normalizeTimeoutMs(body?.timeoutMs),
    })
    return quotaOk({
      models: result.models,
    })
  }
  catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Bad Gateway',
      message: error instanceof Error ? error.message : '拉取模型失败',
    })
  }
})
