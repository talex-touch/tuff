import type {
  IntelligenceVisionImageSource,
  IntelligenceVisionOcrBlock,
  IntelligenceVisionOcrResult,
} from '@talex-touch/tuff-intelligence'
import type { H3Event } from 'h3'
import type { ProviderRegistryRecord } from './providerRegistryStore'
import { createError } from 'h3'
import { networkClient } from '@talex-touch/utils/network'
import { buildOpenAiCompatBaseUrls, resolveProviderBaseUrl } from './intelligenceModels'
import { getProviderCredential } from './providerCredentialStore'

const INTELLIGENCE_PROVIDER_SOURCE = 'intelligence'
const VISION_OCR_CAPABILITY = 'vision.ocr'
const OPENAI_COMPATIBLE_TYPES = new Set(['openai', 'deepseek', 'siliconflow', 'custom'])
const DEFAULT_TIMEOUT_MS = 30000

interface OpenAiChatCompletionResponse {
  id?: string
  model?: string
  error?: {
    message?: string
    code?: string
    type?: string
  }
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
  choices?: Array<{
    text?: unknown
    message?: {
      content?: unknown
    }
  }>
}

export interface IntelligenceVisionOcrProviderResult {
  output: IntelligenceVisionOcrResult
  providerRequestId?: string
  latencyMs: number
  usage: {
    unit: 'image'
    quantity: number
    billable: boolean
    estimated: boolean
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const trimmed = value.trim()
  return trimmed || null
}

function readStringMetadata(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  return readString(metadata?.[key])
}

function readStringArrayMetadata(metadata: Record<string, unknown> | null | undefined, key: string): string[] {
  const value = metadata?.[key]
  if (!Array.isArray(value))
    return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function readNumberMetadata(metadata: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = metadata?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function providerHasCapability(provider: ProviderRegistryRecord) {
  return provider.capabilities.some(item => item.capability === VISION_OCR_CAPABILITY)
}

function resolveIntelligenceType(provider: ProviderRegistryRecord): string {
  if (provider.metadata?.source !== INTELLIGENCE_PROVIDER_SOURCE) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Provider is not an Intelligence registry mirror.',
    })
  }

  const intelligenceType = readStringMetadata(provider.metadata, 'intelligenceType')
  if (!intelligenceType) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Intelligence provider mirror metadata is incomplete.',
    })
  }
  return intelligenceType
}

function resolveModel(provider: ProviderRegistryRecord, input: Record<string, unknown>): string {
  const models = readStringArrayMetadata(provider.metadata, 'models')
  const model = readString(input.model)
    ?? readStringMetadata(provider.metadata, 'defaultModel')
    ?? models[0]

  if (!model) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Intelligence provider model is missing.',
    })
  }
  return model
}

async function resolveApiKey(event: H3Event, provider: ProviderRegistryRecord): Promise<string> {
  if (provider.authType !== 'api_key' || !provider.authRef) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Provider API key credential is missing.',
    })
  }

  const credential = await getProviderCredential(event, provider.authRef)
  if (!credential || !('apiKey' in credential) || !credential.apiKey) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Provider API key credential is missing.',
    })
  }

  return credential.apiKey
}

function normalizeSource(input: Record<string, unknown>): IntelligenceVisionImageSource {
  if (isRecord(input.source)) {
    const type = readString(input.source.type)
    if (type === 'data-url') {
      const dataUrl = readString(input.source.dataUrl)
      if (dataUrl)
        return { type, dataUrl }
    }
    if (type === 'base64') {
      const base64 = readString(input.source.base64)
      if (base64)
        return { type, base64 }
    }
    if (type === 'file') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Nexus vision OCR adapter does not support file source.',
      })
    }
  }

  const imageBase64 = readString(input.imageBase64) ?? readString(input.data)
  if (imageBase64)
    return { type: 'base64', base64: imageBase64 }

  throw createError({
    statusCode: 400,
    statusMessage: 'vision.ocr source is required.',
  })
}

function toVisionDataUrl(source: IntelligenceVisionImageSource): string {
  if (source.type === 'data-url' && source.dataUrl)
    return source.dataUrl

  if (source.type === 'base64' && source.base64) {
    if (source.base64.startsWith('data:'))
      return source.base64
    return `data:image/png;base64,${source.base64}`
  }

  throw createError({
    statusCode: 400,
    statusMessage: 'vision.ocr source is invalid.',
  })
}

function buildPrompt(input: Record<string, unknown>): string {
  const customPrompt = readString(input.prompt)
  if (customPrompt)
    return customPrompt

  const language = readString(input.language)
  const includeLayout = input.includeLayout !== false
  const includeKeywords = input.includeKeywords !== false

  return [
    'Extract all visible text from the image.',
    'Return only compact JSON with fields: text, confidence, language, keywords, blocks.',
    language ? `Use this expected language hint when helpful: ${language}.` : '',
    includeLayout
      ? 'When layout is clear, blocks should contain text, confidence, language, boundingBox [x,y,width,height], polygon, and type.'
      : 'Omit blocks unless they are required to preserve reading order.',
    includeKeywords
      ? 'keywords should be short OCR keywords derived from the text.'
      : 'keywords may be omitted.',
    'Do not add markdown fences or commentary.',
  ].filter(Boolean).join(' ')
}

function normalizeTimeout(provider: ProviderRegistryRecord): number {
  const timeout = readNumberMetadata(provider.metadata, 'timeout')
  if (!timeout)
    return DEFAULT_TIMEOUT_MS
  return Math.max(5000, Math.min(timeout, 120000))
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string')
    return content

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string')
          return item
        if (isRecord(item))
          return readString(item.text) ?? readString(item.content) ?? ''
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  if (isRecord(content))
    return readString(content.text) ?? readString(content.content) ?? ''

  return ''
}

function parseProviderResponse(data: OpenAiChatCompletionResponse | string): OpenAiChatCompletionResponse | string {
  if (typeof data !== 'string')
    return data

  try {
    return JSON.parse(data) as OpenAiChatCompletionResponse
  }
  catch {
    return data
  }
}

function readChoiceContent(data: OpenAiChatCompletionResponse | string): string {
  if (typeof data === 'string')
    return data

  const firstChoice = data.choices?.[0]
  return extractTextContent(firstChoice?.message?.content)
    || extractTextContent(firstChoice?.text)
}

function parseJsonRecord(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  if (!trimmed)
    return null

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1]?.trim()
  const candidates = [
    fenced,
    trimmed,
    trimmed.includes('{') && trimmed.includes('}')
      ? trimmed.slice(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1)
      : null,
  ].filter((item): item is string => Boolean(item))

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (isRecord(parsed))
        return parsed
    }
    catch {
      // Try the next candidate.
    }
  }
  return null
}

function createKeywords(text: string): string[] {
  return text
    .split(/[\s,.;，。；、]+/)
    .map(token => token.trim())
    .filter(token => token.length > 2)
    .filter((token, index, all) => all.indexOf(token) === index)
    .slice(0, 10)
}

function normalizeConfidence(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return undefined
  return Math.max(0, Math.min(1, value))
}

function normalizeBoundingBox(value: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 4)
    return undefined
  const numbers = value.map(item => Number(item))
  if (numbers.some(item => !Number.isFinite(item)))
    return undefined
  return numbers as [number, number, number, number]
}

function normalizePolygon(value: unknown): Array<[number, number]> | undefined {
  if (!Array.isArray(value))
    return undefined

  const points = value
    .map((item): [number, number] | null => {
      if (!Array.isArray(item) || item.length !== 2)
        return null
      const point: [number, number] = [Number(item[0]), Number(item[1])]
      return point.every(number => Number.isFinite(number)) ? point : null
    })
    .filter((item): item is [number, number] => Boolean(item))

  return points.length > 0 ? points : undefined
}

function normalizeBlockType(value: unknown): IntelligenceVisionOcrBlock['type'] | undefined {
  if (value === 'word' || value === 'line' || value === 'paragraph' || value === 'region')
    return value
  return undefined
}

function normalizeBlocks(value: unknown, depth = 0): IntelligenceVisionOcrBlock[] | undefined {
  if (!Array.isArray(value) || depth > 2)
    return undefined

  const blocks = value
    .map((item): IntelligenceVisionOcrBlock | null => {
      if (!isRecord(item))
        return null

      const text = readString(item.text)
      if (!text)
        return null

      return {
        id: readString(item.id) ?? undefined,
        text,
        language: readString(item.language) ?? undefined,
        confidence: normalizeConfidence(item.confidence),
        boundingBox: normalizeBoundingBox(item.boundingBox),
        polygon: normalizePolygon(item.polygon),
        type: normalizeBlockType(item.type),
        children: normalizeBlocks(item.children, depth + 1),
      }
    })
    .filter((item): item is IntelligenceVisionOcrBlock => Boolean(item))

  return blocks.length > 0 ? blocks : undefined
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value))
    return undefined

  const items = value
    .map(item => readString(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 20)

  return items.length > 0 ? items : undefined
}

function normalizeOcrOutput(rawContent: string): IntelligenceVisionOcrResult {
  const parsed = parseJsonRecord(rawContent)
  const text = parsed ? readString(parsed.text) ?? rawContent.trim() : rawContent.trim()
  const keywords = parsed
    ? normalizeStringArray(parsed.keywords) ?? createKeywords(text)
    : createKeywords(text)

  return {
    text,
    confidence: parsed ? normalizeConfidence(parsed.confidence) : undefined,
    language: parsed ? readString(parsed.language) ?? undefined : undefined,
    keywords,
    suggestions: parsed ? normalizeStringArray(parsed.suggestions) : undefined,
    blocks: parsed ? normalizeBlocks(parsed.blocks) : undefined,
    engine: 'cloud',
    raw: parsed ?? rawContent,
  }
}

function createProviderRequestError(message: string, status?: number) {
  return createError({
    statusCode: 502,
    statusMessage: message,
    data: {
      code: 'PROVIDER_REQUEST_FAILED',
      message,
      status,
    },
  })
}

function readProviderErrorMessage(data: OpenAiChatCompletionResponse | string): string | null {
  if (typeof data === 'string')
    return data.trim().slice(0, 240) || null
  return readString(data.error?.message)
}

function buildProviderRequestId(data: OpenAiChatCompletionResponse | string, headers: Record<string, string>) {
  if (typeof data !== 'string' && readString(data.id))
    return data.id
  return headers['x-request-id'] || headers['x-openai-request-id'] || undefined
}

export async function invokeIntelligenceVisionOcr(
  event: H3Event,
  provider: ProviderRegistryRecord,
  input: unknown,
): Promise<IntelligenceVisionOcrProviderResult> {
  if (!providerHasCapability(provider)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Provider capability is not supported.',
    })
  }

  const intelligenceType = resolveIntelligenceType(provider)
  if (!OPENAI_COMPATIBLE_TYPES.has(intelligenceType)) {
    throw createError({
      statusCode: 501,
      statusMessage: 'Intelligence vision OCR adapter only supports OpenAI-compatible providers.',
    })
  }

  const normalizedInput = isRecord(input) ? input : {}
  const model = resolveModel(provider, normalizedInput)
  const apiKey = await resolveApiKey(event, provider)
  const baseUrl = resolveProviderBaseUrl(intelligenceType, provider.endpoint)
  const compatBaseUrl = buildOpenAiCompatBaseUrls(baseUrl)[0] ?? baseUrl
  const endpoint = `${compatBaseUrl}/chat/completions`
  const imageDataUrl = toVisionDataUrl(normalizeSource(normalizedInput))
  const prompt = buildPrompt(normalizedInput)

  const startedAt = Date.now()
  const response = await networkClient.request<OpenAiChatCompletionResponse | string>({
    method: 'POST',
    url: endpoint,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model,
      messages: [
        {
          role: 'system',
          content: prompt,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Read the image and output OCR JSON.' },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      temperature: 0,
    },
    timeoutMs: normalizeTimeout(provider),
    validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
  })
  const latencyMs = Date.now() - startedAt
  const data = parseProviderResponse(response.data)

  if (response.status < 200 || response.status >= 300 || (typeof data !== 'string' && data.error)) {
    throw createProviderRequestError(
      readProviderErrorMessage(data) ?? `Provider returned ${response.status}.`,
      response.status,
    )
  }

  const rawContent = readChoiceContent(data)
  if (!rawContent.trim()) {
    throw createProviderRequestError('Provider returned empty OCR content.', response.status)
  }

  return {
    output: normalizeOcrOutput(rawContent),
    providerRequestId: buildProviderRequestId(data, response.headers),
    latencyMs,
    usage: {
      unit: 'image',
      quantity: 1,
      billable: true,
      estimated: true,
    },
  }
}
