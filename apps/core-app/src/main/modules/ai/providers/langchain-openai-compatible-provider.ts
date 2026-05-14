import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  IntelligenceTTSPayload,
  IntelligenceTTSResult,
  IntelligenceChatPayload,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceMessage,
  IntelligenceStreamChunk,
  IntelligenceUsageInfo,
  IntelligenceVisionImageSource,
  IntelligenceVisionOcrPayload,
  IntelligenceVisionOcrResult,
  IntelligenceEmbeddingPayload,
  IntelligenceTranslatePayload
} from '@talex-touch/tuff-intelligence'
import { Buffer } from 'node:buffer'
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
import { getNetworkService } from '../../network'
import { IntelligenceProvider } from '../runtime/base-provider'

const OPENAI_CHAT_SUFFIXES = ['/chat/completions', '/completions']
const OPENAI_VERSION_SUFFIXES = ['/v1', '/api/v1', '/openai/v1', '/api/openai/v1']

type LangChainOpenAiModule = typeof import('@langchain/openai')
let langChainOpenAiModulePromise: Promise<LangChainOpenAiModule> | null = null

async function getLangChainOpenAiModule(): Promise<LangChainOpenAiModule> {
  if (!langChainOpenAiModulePromise) {
    langChainOpenAiModulePromise = import('@langchain/openai')
  }
  return langChainOpenAiModulePromise
}

interface OpenAiChatModelLike {
  invoke(messages: BaseMessage[]): Promise<unknown>
  stream(messages: BaseMessage[]): Promise<AsyncIterable<unknown>>
}

function trimBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function stripOpenAiEndpointSuffix(value: string): string {
  const trimmed = trimBaseUrl(value)
  const lower = trimmed.toLowerCase()
  for (const suffix of OPENAI_CHAT_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      return trimBaseUrl(trimmed.slice(0, -suffix.length))
    }
  }
  return trimmed
}

export function normalizeOpenAiCompatibleBaseUrl(baseUrl: string): string {
  const trimmed = stripOpenAiEndpointSuffix(baseUrl)
  const lower = trimmed.toLowerCase()
  if (OPENAI_VERSION_SUFFIXES.some((suffix) => lower.endsWith(suffix))) {
    return trimmed
  }
  return `${trimmed}/v1`
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function numberFrom(...candidates: unknown[]): number {
  for (const item of candidates) {
    if (typeof item === 'number' && Number.isFinite(item)) {
      return item
    }
  }
  return 0
}

export function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const row = item as Record<string, unknown>
          if (typeof row.text === 'string') return row.text
          if (typeof row.content === 'string') return row.content
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  const row = asRecord(content)
  if (typeof row.text === 'string') return row.text
  if (typeof row.content === 'string') return row.content
  return ''
}

function toLangChainMessages(messages: IntelligenceMessage[]): BaseMessage[] {
  return messages.map((message) => {
    if (message.role === 'system') {
      return new SystemMessage(message.content)
    }
    if (message.role === 'assistant') {
      return new AIMessage(message.content)
    }
    return new HumanMessage(message.content)
  })
}

function extractUsageInfo(rawMessage: Record<string, unknown>): IntelligenceUsageInfo {
  const usageMetadata = asRecord(rawMessage.usage_metadata)
  const responseMetadata = asRecord(rawMessage.response_metadata)
  const tokenUsage = asRecord(responseMetadata.tokenUsage)

  const promptTokens = numberFrom(
    usageMetadata.input_tokens,
    usageMetadata.prompt_tokens,
    usageMetadata.promptTokens,
    tokenUsage.promptTokens,
    tokenUsage.prompt_tokens
  )
  const completionTokens = numberFrom(
    usageMetadata.output_tokens,
    usageMetadata.completion_tokens,
    usageMetadata.completionTokens,
    tokenUsage.completionTokens,
    tokenUsage.completion_tokens
  )

  const totalTokens = numberFrom(
    usageMetadata.total_tokens,
    usageMetadata.totalTokens,
    tokenUsage.totalTokens,
    tokenUsage.total_tokens,
    promptTokens + completionTokens
  )

  return {
    promptTokens,
    completionTokens,
    totalTokens
  }
}

function resolveModelName(rawMessage: Record<string, unknown>, fallback: string): string {
  const responseMetadata = asRecord(rawMessage.response_metadata)
  if (typeof responseMetadata.model_name === 'string') return responseMetadata.model_name
  if (typeof responseMetadata.model === 'string') return responseMetadata.model
  return fallback
}

function detectMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.bmp':
      return 'image/bmp'
    default:
      return 'image/png'
  }
}

async function toVisionDataUrl(source: IntelligenceVisionImageSource): Promise<string> {
  if (source.type === 'data-url' && source.dataUrl) {
    return source.dataUrl
  }

  if (source.type === 'base64' && source.base64) {
    if (source.base64.startsWith('data:')) {
      return source.base64
    }
    return `data:image/png;base64,${source.base64}`
  }

  if (source.type === 'file' && source.filePath) {
    const buffer = await readFile(source.filePath)
    const mime = detectMime(source.filePath)
    return `data:${mime};base64,${buffer.toString('base64')}`
  }

  throw new Error('Invalid vision image source')
}

function createKeywords(text: string): string[] {
  return text
    .split(/[\s,.;，。；、]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2)
    .filter((token, index, all) => all.indexOf(token) === index)
    .slice(0, 10)
}

function clampSpeechSpeed(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }
  return Math.min(4, Math.max(0.25, value))
}

function normalizeSpeechFormat(format: IntelligenceTTSPayload['format']): {
  responseFormat: string
  mimeType: string
} {
  switch (format) {
    case 'wav':
      return { responseFormat: 'wav', mimeType: 'audio/wav' }
    case 'ogg':
      return { responseFormat: 'opus', mimeType: 'audio/ogg' }
    case 'flac':
      return { responseFormat: 'flac', mimeType: 'audio/flac' }
    default:
      return { responseFormat: 'mp3', mimeType: 'audio/mpeg' }
  }
}

function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): string {
  return `data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}`
}

export abstract class OpenAiCompatibleLangChainProvider extends IntelligenceProvider {
  protected abstract readonly defaultBaseUrl: string
  protected abstract readonly defaultChatModel: string
  protected readonly defaultEmbeddingModel: string = 'text-embedding-3-small'
  protected readonly defaultVisionModel: string | undefined
  protected readonly defaultTtsModel: string = 'tts-1'
  protected readonly requireApiKey: boolean = true
  protected readonly embeddingSupported: boolean = true
  protected readonly visionSupported: boolean = true

  protected resolveBaseUrl(): string {
    return normalizeOpenAiCompatibleBaseUrl(this.config.baseUrl || this.defaultBaseUrl)
  }

  protected resolveApiKey(): string {
    if (this.requireApiKey) {
      this.validateApiKey()
      return this.config.apiKey || ''
    }
    return this.config.apiKey || 'tuff-local-key'
  }

  protected resolveChatModel(options: IntelligenceInvokeOptions): string {
    const model = options.modelPreference?.[0] || this.config.defaultModel || this.defaultChatModel
    this.validateModel(model, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/langchain/chat'
    })
    return model
  }

  protected resolveTtsModel(
    payload: IntelligenceTTSPayload,
    options: IntelligenceInvokeOptions
  ): string {
    const model =
      options.modelPreference?.[0] ||
      (payload.quality === 'hd' ? 'tts-1-hd' : '') ||
      this.defaultTtsModel
    this.validateModel(model, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/audio/speech'
    })
    return model
  }

  private async createChatModel(params: {
    model: string
    options: IntelligenceInvokeOptions
    temperature?: number
    maxTokens?: number
    streaming?: boolean
  }): Promise<OpenAiChatModelLike> {
    const { ChatOpenAI } = await getLangChainOpenAiModule()
    return new ChatOpenAI({
      apiKey: this.resolveApiKey(),
      model: params.model,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      streaming: params.streaming,
      timeout: params.options.timeout,
      configuration: {
        baseURL: this.resolveBaseUrl()
      }
    })
  }

  async chat(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<string>> {
    const startTime = Date.now()
    const traceId = this.generateTraceId()
    const modelName = this.resolveChatModel(options)

    const model = await this.createChatModel({
      model: modelName,
      options,
      temperature: payload.temperature,
      maxTokens: payload.maxTokens
    })

    const response = await model.invoke(toLangChainMessages(payload.messages))
    const rawMessage = asRecord(response)
    const content = extractTextContent(rawMessage.content)
    const usage = extractUsageInfo(rawMessage)

    return {
      result: content,
      usage,
      model: resolveModelName(rawMessage, modelName),
      latency: Date.now() - startTime,
      traceId,
      provider: this.type
    }
  }

  async *chatStream(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions
  ): AsyncGenerator<IntelligenceStreamChunk> {
    const modelName = this.resolveChatModel(options)
    const model = await this.createChatModel({
      model: modelName,
      options,
      temperature: payload.temperature,
      maxTokens: payload.maxTokens,
      streaming: true
    })

    const stream = await model.stream(toLangChainMessages(payload.messages))
    for await (const chunk of stream) {
      const text = extractTextContent(asRecord(chunk).content)
      if (!text) continue
      yield { delta: text, done: false }
    }

    yield { delta: '', done: true }
  }

  async embedding(
    payload: IntelligenceEmbeddingPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<number[]>> {
    if (!this.embeddingSupported) {
      throw new Error(`[${this.type}] Embedding capability is unsupported`)
    }

    const startTime = Date.now()
    const traceId = this.generateTraceId()
    const modelName = payload.model || this.config.defaultModel || this.defaultEmbeddingModel

    this.validateModel(modelName, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/langchain/embedding'
    })

    const { OpenAIEmbeddings } = await getLangChainOpenAiModule()
    const embeddings = new OpenAIEmbeddings({
      apiKey: this.resolveApiKey(),
      model: modelName,
      timeout: options.timeout,
      configuration: {
        baseURL: this.resolveBaseUrl()
      }
    })

    const textInput = payload.text
    let result: number[] = []

    if (Array.isArray(textInput)) {
      const vectors = await embeddings.embedDocuments(textInput.filter(Boolean))
      result = vectors[0] ?? []
    } else {
      result = await embeddings.embedQuery(textInput)
    }

    return {
      result,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      model: modelName,
      latency: Date.now() - startTime,
      traceId,
      provider: this.type
    }
  }

  async translate(
    payload: IntelligenceTranslatePayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<string>> {
    const chatPayload: IntelligenceChatPayload = {
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the following text to ${payload.targetLang}.`
        },
        {
          role: 'user',
          content: payload.text
        }
      ]
    }

    return this.chat(chatPayload, options)
  }

  async visionOcr(
    payload: IntelligenceVisionOcrPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceVisionOcrResult>> {
    if (!this.visionSupported) {
      throw new Error(`[${this.type}] Vision OCR capability is unsupported`)
    }

    const startTime = Date.now()
    const traceId = this.generateTraceId()
    const modelName =
      options.modelPreference?.[0] ||
      this.config.defaultModel ||
      this.defaultVisionModel ||
      this.defaultChatModel

    this.validateModel(modelName, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/langchain/vision'
    })

    const imageDataUrl = await toVisionDataUrl(payload.source)
    const prompt =
      payload.prompt ||
      'Extract all text from this image and return the result as JSON with fields: text, confidence, language, keywords, blocks.'

    const model = await this.createChatModel({
      model: modelName,
      options,
      maxTokens: options.metadata?.maxTokens as number | undefined
    })

    const visionContent = [
      { type: 'text', text: 'Read the image and output OCR JSON.' },
      {
        type: 'image_url',
        image_url: { url: imageDataUrl }
      }
    ]

    const response = await model.invoke([
      new SystemMessage(prompt),
      new HumanMessage({
        content: visionContent as unknown as string
      })
    ])

    const rawMessage = asRecord(response)
    const rawContent = extractTextContent(rawMessage.content)
    const parsed = this.safeParseJson(rawContent)
    const parsedRecord = asRecord(parsed)
    const hasParsed = Object.keys(parsedRecord).length > 0

    const text = typeof parsedRecord.text === 'string' ? parsedRecord.text : rawContent
    const confidence =
      typeof parsedRecord.confidence === 'number' ? parsedRecord.confidence : undefined
    const language = typeof parsedRecord.language === 'string' ? parsedRecord.language : undefined
    const keywords = Array.isArray(parsedRecord.keywords)
      ? parsedRecord.keywords.filter((item): item is string => typeof item === 'string')
      : createKeywords(text)
    const blocks = Array.isArray(parsedRecord.blocks) ? parsedRecord.blocks : undefined

    const result: IntelligenceVisionOcrResult = hasParsed
      ? {
          text,
          confidence,
          language,
          keywords,
          blocks,
          raw: parsedRecord
        }
      : {
          text,
          keywords,
          raw: rawContent
        }

    return {
      result,
      usage: extractUsageInfo(rawMessage),
      model: resolveModelName(rawMessage, modelName),
      latency: Date.now() - startTime,
      traceId,
      provider: this.type
    }
  }

  async tts(
    payload: IntelligenceTTSPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceTTSResult>> {
    const text = typeof payload.text === 'string' ? payload.text.trim() : ''
    if (!text) {
      throw new Error(`[${this.type}] TTS text is required`)
    }

    const startTime = Date.now()
    const traceId = this.generateTraceId()
    const modelName = this.resolveTtsModel(payload, options)
    const { responseFormat, mimeType } = normalizeSpeechFormat(payload.format)
    const voice = payload.voice?.trim() || 'alloy'
    const speed = clampSpeechSpeed(payload.speed)

    const response = await getNetworkService().request<ArrayBuffer>({
      method: 'POST',
      url: `${this.resolveBaseUrl()}/audio/speech`,
      headers: {
        Authorization: `Bearer ${this.resolveApiKey()}`,
        'Content-Type': 'application/json'
      },
      body: {
        model: modelName,
        input: text,
        voice,
        response_format: responseFormat,
        ...(speed ? { speed } : {})
      },
      responseType: 'arrayBuffer',
      timeoutMs: options.timeout ?? this.config.timeout ?? 30_000,
      retryPolicy: {
        maxRetries: 0,
        retryOnNetworkError: false,
        retryOnTimeout: false,
        retryableStatusCodes: []
      },
      cooldownPolicy: {
        key: `${this.config.id}:audio.tts`,
        failureThreshold: 2,
        cooldownMs: 15_000,
        autoResetOnSuccess: true
      }
    })

    if (response.data.byteLength === 0) {
      throw new Error(`[${this.type}] TTS provider returned empty audio payload`)
    }

    return {
      result: {
        audio: arrayBufferToDataUrl(response.data, mimeType),
        format: responseFormat
      },
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      model: modelName,
      latency: Date.now() - startTime,
      traceId,
      provider: this.type
    }
  }
}
