import type { MessageRecord } from '@talex-touch/tuff-intelligence'
import type { H3Event } from 'h3'
import { networkClient } from '@talex-touch/utils/network'
import process from 'node:process'
import { createError } from 'h3'
import { requirePilotAuth } from '../../../../../utils/auth'
import { requireSessionId } from '../../../../../utils/pilot-http'
import { createPilotStoreAdapter } from '../../../../../utils/pilot-store'

const DEFAULT_TITLE_MODEL = 'gpt-5.4'
const BASE_URL_ENV_KEYS = ['NUXT_PILOT_BASE_URL']
const API_KEY_ENV_KEYS = ['NUXT_PILOT_API_KEY']
const MODEL_ENV_KEYS = ['NUXT_PILOT_MODEL']

interface TitleBody {
  force?: boolean
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function trimSuffixSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function buildResponsesEndpoint(baseUrl: string): string {
  const normalized = trimSuffixSlash(baseUrl)
  if (!normalized) {
    return 'https://api.openai.com/v1/responses'
  }
  if (normalized.endsWith('/responses') || normalized.endsWith('/v1/responses')) {
    return normalized
  }
  if (normalized.endsWith('/v1')) {
    return `${normalized}/responses`
  }
  return `${normalized}/v1/responses`
}

function getPilotRuntimeConfig(event: H3Event): Record<string, unknown> {
  const runtimeConfig = (event.context as { runtimeConfig?: Record<string, unknown> }).runtimeConfig
  return runtimeConfig?.pilot && typeof runtimeConfig.pilot === 'object'
    ? (runtimeConfig.pilot as Record<string, unknown>)
    : {}
}

function resolvePilotConfigValue(
  event: H3Event,
  pilotConfig: Record<string, unknown>,
  key: string,
  envKeys: string[],
): string {
  const cloudflareEnv = (event.context.cloudflare as { env?: Record<string, unknown> } | undefined)?.env
  for (const envKey of envKeys) {
    const fromCloudflare = toStringValue(cloudflareEnv?.[envKey])
    if (fromCloudflare) {
      return fromCloudflare
    }
  }

  for (const envKey of envKeys) {
    const fromProcess = toStringValue(process.env[envKey])
    if (fromProcess) {
      return fromProcess
    }
  }

  return toStringValue(pilotConfig[key])
}

function normalizeMessagePreview(content: string): string {
  return content
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
}

function buildConversationPreview(messages: MessageRecord[]): string {
  const rows = messages
    .filter(item => item.role === 'user' || item.role === 'assistant')
    .slice(0, 6)
    .map((item, index) => `${index + 1}. ${item.role}: ${normalizeMessagePreview(item.content)}`)
  return rows.join('\n')
}

function fallbackTitle(messages: MessageRecord[]): string {
  const firstUserMessage = messages.find(item => item.role === 'user' && item.content.trim())
  if (!firstUserMessage) {
    return 'New chat'
  }
  const text = normalizeMessagePreview(firstUserMessage.content)
  return text.slice(0, 24) || 'New chat'
}

function sanitizeTitle(raw: string): string {
  return raw
    .replace(/\r?\n/g, ' ')
    .replace(/^\s*(title|标题)\s*[:：-]\s*/i, '')
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

function extractResponseText(data: Record<string, unknown>): string {
  const outputText = toStringValue(data.output_text)
  if (outputText) {
    return outputText
  }

  const output = Array.isArray(data.output) ? data.output : []
  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const record = item as Record<string, unknown>
    const content = Array.isArray(record.content) ? record.content : []
    for (const block of content) {
      if (!block || typeof block !== 'object') {
        continue
      }
      const row = block as Record<string, unknown>
      const text = toStringValue(row.text) || toStringValue(row.output_text)
      if (text) {
        return text
      }
    }
  }

  return ''
}

async function requestAiTitle(
  endpoint: string,
  apiKey: string,
  model: string,
  preview: string,
): Promise<string> {
  const response = await networkClient.request<Record<string, unknown> | string>({
    method: 'POST',
    url: endpoint,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: {
      model,
      max_output_tokens: 32,
      temperature: 0.2,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'Generate a short conversation title. Keep it lively and specific. Return only the title, no punctuation wrapping.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Conversation preview:\n${preview}\n\nTitle requirements:\n- 4 to 12 words\n- Keep the original language when obvious\n- Avoid generic titles like "New Chat"\n- Return title only`,
            },
          ],
        },
      ],
    },
    validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
  })

  if (response.status < 200 || response.status >= 300) {
    const errorMessage = typeof response.data === 'string' ? response.data : `HTTP ${response.status}`
    throw new Error(errorMessage)
  }

  const data = (response.data || {}) as Record<string, unknown>
  return extractResponseText(data)
}

export default defineEventHandler(async (event) => {
  const { userId } = requirePilotAuth(event)
  const sessionId = requireSessionId(event)
  const body = await readBody<TitleBody>(event)

  const store = createPilotStoreAdapter(event, userId)
  await store.runtime.ensureSchema()

  const session = await store.runtime.getSession(sessionId)
  if (!session) {
    throw createError({
      statusCode: 404,
      statusMessage: 'session not found',
    })
  }

  if (session.title && !body?.force) {
    return {
      title: session.title,
      source: 'stored',
      generated: false,
    }
  }

  const messages = await store.runtime.listMessages(sessionId)
  if (messages.length <= 0) {
    return {
      title: session.title || 'New chat',
      source: 'empty',
      generated: false,
    }
  }

  const pilotConfig = getPilotRuntimeConfig(event)
  const baseUrl = resolvePilotConfigValue(event, pilotConfig, 'baseUrl', BASE_URL_ENV_KEYS)
  const apiKey = resolvePilotConfigValue(event, pilotConfig, 'apiKey', API_KEY_ENV_KEYS)
  const model = resolvePilotConfigValue(event, pilotConfig, 'model', MODEL_ENV_KEYS) || DEFAULT_TITLE_MODEL
  const preview = buildConversationPreview(messages)

  let titleSource: 'ai' | 'fallback' = 'fallback'
  let title = fallbackTitle(messages)

  if (preview && apiKey) {
    try {
      const generated = sanitizeTitle(await requestAiTitle(
        buildResponsesEndpoint(baseUrl),
        apiKey,
        model,
        preview,
      ))
      if (generated) {
        title = generated
        titleSource = 'ai'
      }
    }
    catch {
      // Fallback to deterministic local title.
    }
  }

  if (title) {
    await store.runtime.setSessionTitle(sessionId, title)
  }

  return {
    title,
    source: titleSource,
    generated: titleSource === 'ai',
  }
})
