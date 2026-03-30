import type { PilotChannelTransport } from '../../../utils/pilot-channel'
import { networkClient } from '@talex-touch/utils/network'
import { createError, defineEventHandler, readBody } from 'h3'
import { requirePilotAdmin } from '../../../utils/pilot-admin-auth'
import { getPilotAdminChannelCatalog } from '../../../utils/pilot-admin-channel-config'

interface TestChannelBody {
  channelId?: string
  baseUrl?: string
  apiKey?: string
  model?: string
  transport?: PilotChannelTransport
  timeoutMs?: number
}

const ALL_HTTP_STATUS = Array.from({ length: 500 }, (_, index) => index + 100)

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeTransport(value: unknown): PilotChannelTransport {
  const normalized = normalizeText(value).toLowerCase()
  return normalized === 'chat.completions' || normalized === 'chat_completions' || normalized === 'completions'
    ? 'chat.completions'
    : 'responses'
}

function normalizeTimeoutMs(value: unknown, fallback = 90_000): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(Math.max(Math.floor(parsed), 3_000), 120_000)
}

function resolveEndpoint(baseUrl: string, transport: PilotChannelTransport): string {
  const normalized = normalizeText(baseUrl).replace(/\/+$/, '')
  if (!normalized) {
    return ''
  }
  const hasVersionPrefix = normalized.endsWith('/v1')
  if (transport === 'chat.completions') {
    return hasVersionPrefix ? `${normalized}/chat/completions` : `${normalized}/v1/chat/completions`
  }
  return hasVersionPrefix ? `${normalized}/responses` : `${normalized}/v1/responses`
}

function formatErrorPayload(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim().slice(0, 320)
  }
  if (value === null || typeof value === 'undefined') {
    return ''
  }
  try {
    return JSON.stringify(value).slice(0, 320)
  }
  catch {
    return ''
  }
}

function parseResponsesOutputText(payload: Record<string, unknown>): string {
  const outputText = normalizeText(payload.output_text)
  if (outputText) {
    return outputText
  }

  const output = Array.isArray(payload.output) ? payload.output : []
  const chunks: string[] = []
  for (const item of output) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const row = item as Record<string, unknown>
    const content = Array.isArray(row.content) ? row.content : []
    for (const part of content) {
      if (!part || typeof part !== 'object' || Array.isArray(part)) {
        continue
      }
      const partRow = part as Record<string, unknown>
      const text = normalizeText(partRow.text)
      if (text) {
        chunks.push(text)
      }
    }
  }

  return chunks.join('\n').trim()
}

function parseChatCompletionsOutputText(payload: Record<string, unknown>): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : []
  for (const item of choices) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const row = item as Record<string, unknown>
    const message = row.message && typeof row.message === 'object' && !Array.isArray(row.message)
      ? row.message as Record<string, unknown>
      : {}
    const content = normalizeText(message.content)
    if (content) {
      return content
    }
  }
  return ''
}

export default defineEventHandler(async (event) => {
  await requirePilotAdmin(event)
  const body = await readBody<TestChannelBody>(event)

  const channelId = normalizeText(body?.channelId)
  const catalog = channelId ? await getPilotAdminChannelCatalog(event) : null
  const channel = channelId
    ? catalog?.channels.find(item => item.id === channelId)
    : undefined

  const baseUrl = normalizeText(body?.baseUrl) || normalizeText(channel?.baseUrl)
  const apiKey = normalizeText(body?.apiKey) || normalizeText(channel?.apiKey)
  const model = normalizeText(body?.model)
    || normalizeText(channel?.defaultModelId || channel?.model)
    || normalizeText(channel?.models?.find(item => item.enabled !== false)?.id)
    || normalizeText(channel?.models?.[0]?.id)
  const transport = normalizeTransport(body?.transport || channel?.transport)
  const timeoutMs = normalizeTimeoutMs(body?.timeoutMs, normalizeTimeoutMs(channel?.timeoutMs, 90_000))

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
  if (!model) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Model 不能为空',
    })
  }

  const endpoint = resolveEndpoint(baseUrl, transport)
  if (!endpoint) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Base URL 无效',
    })
  }

  const payload: Record<string, unknown> = transport === 'chat.completions'
    ? {
        model,
        temperature: 0,
        max_tokens: 16,
        messages: [
          { role: 'user', content: 'ping' },
        ],
      }
    : {
        model,
        temperature: 0,
        max_output_tokens: 16,
        input: [
          { role: 'user', content: 'ping' },
        ],
      }

  const startedAt = Date.now()
  try {
    const response = await networkClient.request<Record<string, unknown> | string>({
      method: 'POST',
      url: endpoint,
      timeoutMs,
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`,
      },
      body: payload,
      validateStatus: ALL_HTTP_STATUS,
    })

    if (response.status < 200 || response.status >= 300) {
      const details = formatErrorPayload(response.data)
      throw createError({
        statusCode: 502,
        statusMessage: 'Bad Gateway',
        message: `HTTP ${response.status}${details ? ` ${details}` : ''}`,
      })
    }

    const row = response.data && typeof response.data === 'object' && !Array.isArray(response.data)
      ? response.data as Record<string, unknown>
      : {}
    const preview = transport === 'chat.completions'
      ? parseChatCompletionsOutputText(row)
      : parseResponsesOutputText(row)

    return {
      ok: true,
      channelId: channel?.id || channelId || '',
      model,
      transport,
      durationMs: Math.max(0, Date.now() - startedAt),
      preview: preview ? preview.slice(0, 120) : '',
    }
  }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in (error as Record<string, unknown>)) {
      throw error
    }
    throw createError({
      statusCode: 502,
      statusMessage: 'Bad Gateway',
      message: error instanceof Error ? error.message : '渠道测试失败',
    })
  }
})
