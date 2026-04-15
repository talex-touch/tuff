import { networkClient } from '@talex-touch/utils/network'
import { isPilotSystemMessageAllowedForModelContext } from '@talex-touch/tuff-intelligence/pilot'

export interface TitleMessageLike {
  role: string
  content: string
  metadata?: Record<string, unknown>
}

export interface GenerateTitleOptions {
  baseUrl: string
  apiKey: string
  model: string
  messages: TitleMessageLike[]
}

export interface GenerateTitleResult {
  title: string
  source: 'ai' | 'fallback' | 'empty'
  generated: boolean
}

const DEFAULT_EMPTY_TITLE = 'New chat'

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function trimSuffixSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function buildResponsesEndpoint(baseUrl: string): string {
  const normalized = trimSuffixSlash(String(baseUrl || '').trim())
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

function normalizeMessagePreview(content: string): string {
  return String(content || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
}

export function buildConversationPreview(messages: TitleMessageLike[]): string {
  const rows = messages
    .filter((item) => {
      if (item.role === 'user' || item.role === 'assistant') {
        return true
      }
      if (item.role === 'system') {
        return isPilotSystemMessageAllowedForModelContext(item.metadata)
      }
      return false
    })
    .slice(0, 6)
    .map((item, index) => `${index + 1}. ${item.role}: ${normalizeMessagePreview(item.content)}`)

  return rows.join('\n')
}

export function fallbackTitle(messages: TitleMessageLike[]): string {
  const firstUserMessage = messages.find(item => item.role === 'user' && item.content.trim())
  if (!firstUserMessage) {
    return DEFAULT_EMPTY_TITLE
  }
  const text = normalizeMessagePreview(firstUserMessage.content)
  return text.slice(0, 24) || DEFAULT_EMPTY_TITLE
}

export function sanitizeTitle(raw: string): string {
  return String(raw || '')
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

export async function requestAiTitle(
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
      max_output_tokens: 24,
      temperature: 0,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'Generate a concise chat title. Return title only.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Preview:\n${preview}\nRules: keep source language; 4-12 words; specific not generic; no quotes/prefix.`,
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

export async function generateTitle(options: GenerateTitleOptions): Promise<GenerateTitleResult> {
  const messages = Array.isArray(options.messages) ? options.messages : []
  if (messages.length <= 0) {
    return {
      title: DEFAULT_EMPTY_TITLE,
      source: 'empty',
      generated: false,
    }
  }

  const preview = buildConversationPreview(messages)
  let title = fallbackTitle(messages)
  let source: GenerateTitleResult['source'] = 'fallback'

  if (preview && options.apiKey) {
    const generated = sanitizeTitle(await requestAiTitle(
      buildResponsesEndpoint(options.baseUrl),
      options.apiKey,
      options.model,
      preview,
    ))
    if (generated) {
      title = generated
      source = 'ai'
    }
  }

  return {
    title,
    source,
    generated: source === 'ai',
  }
}
