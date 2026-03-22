import { createError, defineEventHandler, readBody } from 'h3'
import { requirePilotAuth } from '../../../utils/auth'
import { executePilotImageGenerateTool } from '../../../utils/pilot-tool-gateway'
import { quotaOk } from '../../../utils/quota-api'

interface RuntimeImageGenerateBody {
  baseUrl?: string
  apiKey?: string
  model?: string
  prompt?: string
  size?: string
  count?: number
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
  return Math.min(Math.max(Math.floor(parsed), 3_000), 10 * 60 * 1000)
}

function normalizeCount(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return NaN
  }
  return Math.floor(parsed)
}

function assertInput(condition: boolean, message: string): asserts condition {
  if (condition) {
    return
  }
  throw createError({
    statusCode: 400,
    statusMessage: 'Bad Request',
    message,
  })
}

function randomRequestId(): string {
  return `image_lab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const body = await readBody<RuntimeImageGenerateBody>(event)

  const baseUrl = normalizeText(body?.baseUrl)
  const apiKey = normalizeText(body?.apiKey)
  const model = normalizeText(body?.model)
  const prompt = normalizeText(body?.prompt)
  const size = normalizeText(body?.size)
  const count = normalizeCount(body?.count)
  const timeoutMs = normalizeTimeoutMs(body?.timeoutMs)

  assertInput(Boolean(baseUrl), 'Base URL 不能为空')
  assertInput(Boolean(apiKey), 'API Key 不能为空')
  assertInput(Boolean(model), 'Model 不能为空')
  assertInput(Boolean(prompt), 'Prompt 不能为空')
  assertInput(!size || /^\d{2,4}x\d{2,4}$/i.test(size), 'size 格式无效，示例：1024x1024')
  assertInput(count === undefined || (Number.isInteger(count) && count >= 1 && count <= 4), 'count 范围必须为 1~4')

  const startedAt = Date.now()
  try {
    const result = await executePilotImageGenerateTool({
      event,
      userId: auth.userId,
      sessionId: `image_lab_${auth.userId}`,
      requestId: randomRequestId(),
      prompt,
      size: size || undefined,
      count,
      channel: {
        baseUrl,
        apiKey,
        model,
        adapter: 'openai',
        transport: 'responses',
        timeoutMs,
      },
    })

    if (!result || result.images.length <= 0) {
      throw createError({
        statusCode: 502,
        statusMessage: 'Bad Gateway',
        message: '图像生成返回为空',
      })
    }

    return quotaOk({
      images: result.images,
      callId: result.callId,
      durationMs: Math.max(0, Date.now() - startedAt),
    })
  }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in (error as Record<string, unknown>)) {
      throw error
    }
    throw createError({
      statusCode: 502,
      statusMessage: 'Bad Gateway',
      message: error instanceof Error ? error.message : '图像生成失败',
    })
  }
})
