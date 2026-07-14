import type { BaseMessage } from '@langchain/core/messages'
import type {
  IntelligenceAudioTranscribePayload,
  IntelligenceAudioTranscribeResult,
  IntelligenceChatPayload,
  IntelligenceEmbeddingPayload,
  IntelligenceImageAnalyzePayload,
  IntelligenceImageAnalyzeResult,
  IntelligenceImageCaptionPayload,
  IntelligenceImageCaptionResult,
  IntelligenceImageEditPayload,
  IntelligenceImageEditResult,
  IntelligenceImageGeneratePayload,
  IntelligenceImageGenerateResult,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceMessage,
  IntelligenceStreamChunk,
  IntelligenceSTTPayload,
  IntelligenceSTTResult,
  IntelligenceTranslatePayload,
  IntelligenceTTSPayload,
  IntelligenceTTSResult,
  IntelligenceUsageInfo,
  IntelligenceVisionImageSource,
  IntelligenceVisionOcrPayload,
  IntelligenceVisionOcrResult,
} from '@talex-touch/tuff-intelligence'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
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
  invoke: (messages: BaseMessage[]) => Promise<unknown>
  stream: (messages: BaseMessage[]) => Promise<AsyncIterable<unknown>>
}

type OpenAiClientFetch = NonNullable<import('openai').ClientOptions['fetch']>

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
  if (OPENAI_VERSION_SUFFIXES.some(suffix => lower.endsWith(suffix))) {
    return trimmed
  }
  return `${trimmed}/v1`
}

export function createNetworkServiceFetch(): OpenAiClientFetch {
  return async (url, init) => getNetworkService().fetch(url, init)
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

function extractNestedReasoningText(value: unknown, depth = 0): string {
  if (depth > 4 || value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value.trim()
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value
      .map(item => extractNestedReasoningText(item, depth + 1))
      .filter(Boolean)
      .join('\n')
      .trim()
  }
  if (typeof value !== 'object') {
    return ''
  }

  const row = asRecord(value)
  const directCandidates = [
    row.text,
    row.content,
    row.summary,
    row.output_text,
    row.reasoning_text,
    row.thinking_text,
  ]
  for (const candidate of directCandidates) {
    const text = extractNestedReasoningText(candidate, depth + 1)
    if (text)
      return text
  }

  const nestedCandidates = [
    row.reasoning,
    row.thinking,
    row.analysis,
    row.delta,
    row.message,
    row.payload,
  ]
  for (const candidate of nestedCandidates) {
    const text = extractNestedReasoningText(candidate, depth + 1)
    if (text)
      return text
  }

  return ''
}

export function extractReasoningContent(rawMessage: Record<string, unknown>): string | undefined {
  const additionalKwargs = asRecord(rawMessage.additional_kwargs)
  const responseMetadata = asRecord(rawMessage.response_metadata)
  const contentBlocks = Array.isArray(rawMessage.content) ? rawMessage.content : []
  const blockReasoning = contentBlocks
    .map((item) => {
      const row = asRecord(item)
      const type = String(row.type || '').toLowerCase()
      if (!type.includes('reasoning') && !type.includes('thinking')) {
        return extractNestedReasoningText(row.reasoning ?? row.thinking)
      }
      return extractNestedReasoningText(item)
    })
    .filter(Boolean)
    .join('\n')
    .trim()

  const candidates = [
    blockReasoning,
    rawMessage.reasoning,
    rawMessage.reasoning_content,
    rawMessage.reasoningContent,
    rawMessage.reasoning_text,
    rawMessage.thinking,
    rawMessage.thinking_text,
    additionalKwargs.reasoning,
    additionalKwargs.reasoning_content,
    additionalKwargs.reasoningContent,
    additionalKwargs.reasoning_text,
    additionalKwargs.thinking,
    additionalKwargs.thinking_text,
    responseMetadata.reasoning,
    responseMetadata.reasoning_content,
    responseMetadata.reasoningContent,
    responseMetadata.reasoning_text,
    responseMetadata.thinking,
    responseMetadata.thinking_text,
  ]

  for (const candidate of candidates) {
    const text = extractNestedReasoningText(candidate)
    if (text)
      return text
  }

  return undefined
}

export function extractTextContent(content: unknown): string {
  if (typeof content === 'string')
    return content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string')
          return item
        if (item && typeof item === 'object') {
          const row = item as Record<string, unknown>
          if (typeof row.text === 'string')
            return row.text
          if (typeof row.content === 'string')
            return row.content
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  const row = asRecord(content)
  if (typeof row.text === 'string')
    return row.text
  if (typeof row.content === 'string')
    return row.content
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
    tokenUsage.prompt_tokens,
  )
  const completionTokens = numberFrom(
    usageMetadata.output_tokens,
    usageMetadata.completion_tokens,
    usageMetadata.completionTokens,
    tokenUsage.completionTokens,
    tokenUsage.completion_tokens,
  )

  const totalTokens = numberFrom(
    usageMetadata.total_tokens,
    usageMetadata.totalTokens,
    tokenUsage.totalTokens,
    tokenUsage.total_tokens,
    promptTokens + completionTokens,
  )

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  }
}

function resolveModelName(rawMessage: Record<string, unknown>, fallback: string): string {
  const responseMetadata = asRecord(rawMessage.response_metadata)
  if (typeof responseMetadata.model_name === 'string')
    return responseMetadata.model_name
  if (typeof responseMetadata.model === 'string')
    return responseMetadata.model
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
interface ImageFilePayload {
  blob: Blob
  filename: string
  mimeType: string
}

function parseDataUrl(
  value: string,
  fallbackMimeType: string,
): { buffer: Buffer, mimeType: string } | null {
  const match = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/)
  if (!match)
    return null
  const mimeType = match[1] || fallbackMimeType
  const isBase64 = Boolean(match[2])
  const payload = match[3] || ''
  return {
    mimeType,
    buffer: isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload)),
  }
}

function extensionFromImageMime(mimeType: string): string {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('jpeg') || normalized.includes('jpg'))
    return 'jpg'
  if (normalized.includes('webp'))
    return 'webp'
  if (normalized.includes('gif'))
    return 'gif'
  if (normalized.includes('bmp'))
    return 'bmp'
  return 'png'
}

async function toImageFilePayload(
  source: IntelligenceVisionImageSource,
  fallbackName: string,
): Promise<ImageFilePayload> {
  if (source.type === 'file' && source.filePath) {
    const buffer = await readFile(source.filePath)
    if (buffer.byteLength === 0) {
      throw new Error('Image payload is required')
    }
    const mimeType = detectMime(source.filePath)
    const extension
      = path.extname(source.filePath).replace(/^\./, '') || extensionFromImageMime(mimeType)
    return {
      blob: new Blob([new Uint8Array(buffer)], { type: mimeType }),
      filename: `${fallbackName}.${extension}`,
      mimeType,
    }
  }

  const raw
    = source.type === 'data-url'
      ? source.dataUrl
      : source.type === 'base64'
        ? source.base64
        : undefined
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) {
    throw new Error('Image payload is required')
  }
  const parsed = parseDataUrl(value, 'image/png') ?? {
    buffer: Buffer.from(value, 'base64'),
    mimeType: 'image/png',
  }
  if (parsed.buffer.byteLength === 0) {
    throw new Error('Image payload is required')
  }
  return {
    blob: new Blob([new Uint8Array(parsed.buffer)], { type: parsed.mimeType }),
    filename: `${fallbackName}.${extensionFromImageMime(parsed.mimeType)}`,
    mimeType: parsed.mimeType,
  }
}

function normalizeImageSize(width?: number, height?: number): string | undefined {
  if (
    typeof width !== 'number'
    || typeof height !== 'number'
    || !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
  ) {
    return undefined
  }
  return `${Math.floor(width)}x${Math.floor(height)}`
}

function normalizeImageCount(count?: number): number | undefined {
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    return undefined
  }
  return Math.min(10, Math.max(1, Math.floor(count)))
}

function appendImagePromptModifiers(payload: IntelligenceImageGeneratePayload): string {
  const prompt = payload.prompt.trim()
  const modifiers: string[] = []
  if (payload.style?.trim())
    modifiers.push(`Style: ${payload.style.trim()}`)
  if (payload.negativePrompt?.trim()) {
    modifiers.push(`Avoid: ${payload.negativePrompt.trim()}`)
  }
  return modifiers.length > 0 ? `${prompt}\n\n${modifiers.join('\n')}` : prompt
}

function normalizeOpenAiImageItems(value: unknown): Array<{
  url?: string
  base64?: string
  revisedPrompt?: string
}> {
  return Array.isArray(value)
    ? value
        .map(item => asRecord(item))
        .map(item => ({
          ...(typeof item.url === 'string' ? { url: item.url } : {}),
          ...(typeof item.b64_json === 'string' ? { base64: item.b64_json } : {}),
          ...(typeof item.base64 === 'string' ? { base64: item.base64 } : {}),
          ...(typeof item.revised_prompt === 'string'
            ? { revisedPrompt: item.revised_prompt }
            : {}),
          ...(typeof item.revisedPrompt === 'string' ? { revisedPrompt: item.revisedPrompt } : {}),
        }))
        .filter(item => Boolean(item.url || item.base64))
    : []
}

function extractImageUsage(raw: Record<string, unknown>): IntelligenceUsageInfo {
  const usage = asRecord(raw.usage)
  const promptTokens = numberFrom(usage.input_tokens, usage.prompt_tokens, usage.promptTokens)
  const completionTokens = numberFrom(
    usage.output_tokens,
    usage.completion_tokens,
    usage.completionTokens,
  )
  const totalTokens = numberFrom(
    usage.total_tokens,
    usage.totalTokens,
    promptTokens + completionTokens,
  )
  return { promptTokens, completionTokens, totalTokens }
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

function normalizeAudioFormat(format?: string): { extension: string, mimeType: string } {
  switch (format?.toLowerCase()) {
    case 'mp3':
      return { extension: 'mp3', mimeType: 'audio/mpeg' }
    case 'ogg':
    case 'opus':
      return { extension: 'ogg', mimeType: 'audio/ogg' }
    case 'flac':
      return { extension: 'flac', mimeType: 'audio/flac' }
    case 'm4a':
      return { extension: 'm4a', mimeType: 'audio/mp4' }
    case 'webm':
      return { extension: 'webm', mimeType: 'audio/webm' }
    default:
      return { extension: 'wav', mimeType: 'audio/wav' }
  }
}

function parseAudioDataUrl(value: string): { buffer: Buffer, mimeType: string } | null {
  return parseDataUrl(value, 'audio/wav')
}

function extensionFromMime(mimeType: string, fallback: string): string {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('mpeg'))
    return 'mp3'
  if (normalized.includes('ogg') || normalized.includes('opus'))
    return 'ogg'
  if (normalized.includes('flac'))
    return 'flac'
  if (normalized.includes('mp4') || normalized.includes('m4a'))
    return 'm4a'
  if (normalized.includes('webm'))
    return 'webm'
  if (normalized.includes('wav'))
    return 'wav'
  return fallback
}

function toAudioFilePayload(
  audio: ArrayBuffer | string,
  format?: string,
): {
  blob: Blob
  filename: string
  mimeType: string
} {
  const normalizedFormat = normalizeAudioFormat(format)
  let buffer: Buffer
  let mimeType = normalizedFormat.mimeType
  let extension = normalizedFormat.extension

  if (audio instanceof ArrayBuffer) {
    buffer = Buffer.from(audio)
  }
  else {
    const value = typeof audio === 'string' ? audio.trim() : ''
    if (!value) {
      throw new Error('Audio payload is required')
    }
    const parsed = parseAudioDataUrl(value)
    if (parsed) {
      buffer = parsed.buffer
      mimeType = parsed.mimeType
      extension = extensionFromMime(mimeType, extension)
    }
    else {
      buffer = Buffer.from(value, 'base64')
    }
  }

  if (buffer.byteLength === 0) {
    throw new Error('Audio payload is required')
  }

  return {
    blob: new Blob([new Uint8Array(buffer)], { type: mimeType }),
    filename: `audio.${extension}`,
    mimeType,
  }
}

function readAudioSegments(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
      )
    : []
}

function readAudioConfidence(
  record: Record<string, unknown>,
  segments: Array<Record<string, unknown>>,
): number {
  if (typeof record.confidence === 'number' && Number.isFinite(record.confidence)) {
    return Math.min(1, Math.max(0, record.confidence))
  }
  const scores = segments
    .map(segment => segment.confidence)
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score))
  if (scores.length > 0) {
    return Math.min(
      1,
      Math.max(0, scores.reduce((total, score) => total + score, 0) / scores.length),
    )
  }
  return typeof record.text === 'string' && record.text.trim() ? 1 : 0
}

function readAudioDuration(
  record: Record<string, unknown>,
  segments: Array<Record<string, unknown>>,
): number {
  if (typeof record.duration === 'number' && Number.isFinite(record.duration)) {
    return Math.max(0, record.duration)
  }
  return segments.reduce((duration, segment) => {
    const end = typeof segment.end === 'number' && Number.isFinite(segment.end) ? segment.end : 0
    return Math.max(duration, end)
  }, 0)
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
  protected readonly defaultTtsVoice: string = 'alloy'
  protected readonly defaultImageModel: string = 'gpt-image-1'
  protected readonly defaultTranscriptionModel: string = 'whisper-1'
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
      endpoint: '/langchain/chat',
    })
    return model
  }

  protected resolveDefaultTtsModel(payload: IntelligenceTTSPayload): string {
    if (payload.quality === 'hd' && this.defaultTtsModel === 'tts-1') {
      return 'tts-1-hd'
    }

    return this.defaultTtsModel
  }

  protected resolveTtsModel(
    payload: IntelligenceTTSPayload,
    options: IntelligenceInvokeOptions,
  ): string {
    const model = options.modelPreference?.[0] || this.resolveDefaultTtsModel(payload)
    this.validateModel(model, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/audio/speech',
    })
    return model
  }

  protected resolveImageModel(options: IntelligenceInvokeOptions): string {
    const model = options.modelPreference?.[0] || this.defaultImageModel
    this.validateModel(model, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/images',
    })
    return model
  }

  protected resolveTranscriptionModel(options: IntelligenceInvokeOptions): string {
    const model = options.modelPreference?.[0] || this.defaultTranscriptionModel
    this.validateModel(model, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/audio/transcriptions',
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
        baseURL: this.resolveBaseUrl(),
        fetch: createNetworkServiceFetch(),
      },
    })
  }

  async chat(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<string>> {
    const startTime = Date.now()
    const traceId = this.generateTraceId()
    const modelName = this.resolveChatModel(options)

    const model = await this.createChatModel({
      model: modelName,
      options,
      temperature: payload.temperature,
      maxTokens: payload.maxTokens,
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
      provider: this.type,
      reasoning: extractReasoningContent(rawMessage),
    }
  }

  async* chatStream(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions,
  ): AsyncGenerator<IntelligenceStreamChunk> {
    const modelName = this.resolveChatModel(options)
    const model = await this.createChatModel({
      model: modelName,
      options,
      temperature: payload.temperature,
      maxTokens: payload.maxTokens,
      streaming: true,
    })

    const stream = await model.stream(toLangChainMessages(payload.messages))
    for await (const chunk of stream) {
      const text = extractTextContent(asRecord(chunk).content)
      if (!text)
        continue
      yield { delta: text, done: false }
    }

    yield { delta: '', done: true }
  }

  async embedding(
    payload: IntelligenceEmbeddingPayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<number[]>> {
    if (!this.embeddingSupported) {
      throw new Error(`[${this.type}] Embedding capability is unsupported`)
    }

    const startTime = Date.now()
    const traceId = this.generateTraceId()
    const modelName = payload.model || this.defaultEmbeddingModel

    this.validateModel(modelName, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/langchain/embedding',
    })

    const { OpenAIEmbeddings } = await getLangChainOpenAiModule()
    const embeddings = new OpenAIEmbeddings({
      apiKey: this.resolveApiKey(),
      model: modelName,
      timeout: options.timeout,
      configuration: {
        baseURL: this.resolveBaseUrl(),
        fetch: createNetworkServiceFetch(),
      },
    })

    const textInput = payload.text
    let result: number[] = []

    if (Array.isArray(textInput)) {
      const vectors = await embeddings.embedDocuments(textInput.filter(Boolean))
      result = vectors[0] ?? []
    }
    else {
      result = await embeddings.embedQuery(textInput)
    }

    return {
      result,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      model: modelName,
      latency: Date.now() - startTime,
      traceId,
      provider: this.type,
    }
  }

  async translate(
    payload: IntelligenceTranslatePayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<string>> {
    const chatPayload: IntelligenceChatPayload = {
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the following text to ${payload.targetLang}.`,
        },
        {
          role: 'user',
          content: payload.text,
        },
      ],
    }

    return this.chat(chatPayload, options)
  }

  private async invokeVisionImage(
    source: IntelligenceVisionImageSource,
    prompt: string,
    options: IntelligenceInvokeOptions,
    maxTokens?: number,
  ): Promise<{
    rawMessage: Record<string, unknown>
    rawContent: string
    modelName: string
    traceId: string
    startedAt: number
  }> {
    if (!this.visionSupported) {
      throw new Error(`[${this.type}] Vision capability is unsupported`)
    }

    const startedAt = Date.now()
    const traceId = this.generateTraceId()
    const modelName
      = options.modelPreference?.[0]
        || this.config.defaultModel
        || this.defaultVisionModel
        || this.defaultChatModel

    this.validateModel(modelName, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/langchain/vision',
    })

    const imageDataUrl = await toVisionDataUrl(source)
    const model = await this.createChatModel({ model: modelName, options, maxTokens })
    const response = await model.invoke([
      new SystemMessage(prompt),
      new HumanMessage({
        content: [
          { type: 'text', text: 'Analyze the supplied image according to the instructions.' },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ] as unknown as string,
      }),
    ])
    const rawMessage = asRecord(response)

    return {
      rawMessage,
      rawContent: extractTextContent(rawMessage.content),
      modelName,
      traceId,
      startedAt,
    }
  }

  async visionOcr(
    payload: IntelligenceVisionOcrPayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<IntelligenceVisionOcrResult>> {
    const prompt
      = payload.prompt
        || 'Extract all text from this image and return the result as JSON with fields: text, confidence, language, keywords, blocks.'
    const { rawMessage, rawContent, modelName, traceId, startedAt } = await this.invokeVisionImage(
      payload.source,
      prompt,
      options,
      options.metadata?.maxTokens as number | undefined,
    )
    const parsed = this.safeParseJson(rawContent)
    const parsedRecord = asRecord(parsed)
    const hasParsed = Object.keys(parsedRecord).length > 0

    const text = typeof parsedRecord.text === 'string' ? parsedRecord.text : rawContent
    const confidence
      = typeof parsedRecord.confidence === 'number' ? parsedRecord.confidence : undefined
    const language = typeof parsedRecord.language === 'string' ? parsedRecord.language : undefined
    const keywords = Array.isArray(parsedRecord.keywords)
      ? parsedRecord.keywords.filter((item): item is string => typeof item === 'string')
      : this.deriveImageTags(text)
    const blocks = Array.isArray(parsedRecord.blocks) ? parsedRecord.blocks : undefined

    const result: IntelligenceVisionOcrResult = hasParsed
      ? { text, confidence, language, keywords, blocks, raw: parsedRecord }
      : { text, keywords, raw: rawContent }

    return {
      result,
      usage: extractUsageInfo(rawMessage),
      model: resolveModelName(rawMessage, modelName),
      latency: Date.now() - startedAt,
      traceId,
      provider: this.type,
      reasoning: extractReasoningContent(rawMessage),
    }
  }

  async imageCaption(
    payload: IntelligenceImageCaptionPayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<IntelligenceImageCaptionResult>> {
    const language = payload.language || 'the image language'
    const style = payload.style || 'brief'
    const maxLength
      = typeof payload.maxLength === 'number'
        && Number.isFinite(payload.maxLength)
        && payload.maxLength > 0
        ? Math.floor(payload.maxLength)
        : undefined
    const { rawMessage, rawContent, modelName, traceId, startedAt } = await this.invokeVisionImage(
      payload.source,
      `Generate a ${style} image caption in ${language}.${maxLength ? ` Keep the caption under ${maxLength} characters.` : ''} Return JSON with fields: caption, alternativeCaptions, tags, confidence.`,
      options,
      512,
    )
    const result = this.normalizeImageCaptionResult(rawContent, maxLength)
    return {
      result,
      usage: extractUsageInfo(rawMessage),
      model: resolveModelName(rawMessage, modelName),
      latency: Date.now() - startedAt,
      traceId,
      provider: this.type,
      reasoning: extractReasoningContent(rawMessage),
    }
  }

  async imageAnalyze(
    payload: IntelligenceImageAnalyzePayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<IntelligenceImageAnalyzeResult>> {
    const analysisTypes = payload.analysisTypes?.length
      ? payload.analysisTypes.join(', ')
      : 'objects, faces, text, colors, composition, scene, emotions'
    const { rawMessage, rawContent, modelName, traceId, startedAt } = await this.invokeVisionImage(
      payload.source,
      `Analyze this image in ${payload.language || 'the image language'} for: ${analysisTypes}.${payload.detailed ? ' Include detailed findings.' : ''} Return JSON with fields: description, objects, faces, colors, scene, text, tags. Objects require name and confidence (0-1); colors require color and percentage; scene requires type and confidence (0-1).`,
      options,
      payload.detailed ? 2_000 : 1_000,
    )
    const result = this.normalizeImageAnalyzeResult(rawContent)

    return {
      result,
      usage: extractUsageInfo(rawMessage),
      model: resolveModelName(rawMessage, modelName),
      latency: Date.now() - startedAt,
      traceId,
      provider: this.type,
      reasoning: extractReasoningContent(rawMessage),
    }
  }

  async imageGenerate(
    payload: IntelligenceImageGeneratePayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<IntelligenceImageGenerateResult>> {
    const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
    if (!prompt) {
      throw new Error(`[${this.type}] Image generation prompt is required`)
    }

    const startTime = Date.now()
    const traceId = this.generateTraceId()
    const modelName = this.resolveImageModel(options)
    const size = normalizeImageSize(payload.width, payload.height)
    const count = normalizeImageCount(payload.count)
    const response = await getNetworkService().request<Record<string, unknown>>({
      method: 'POST',
      url: `${this.resolveBaseUrl()}/images/generations`,
      headers: {
        'Authorization': `Bearer ${this.resolveApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: modelName,
        prompt: appendImagePromptModifiers({ ...payload, prompt }),
        ...(size ? { size } : {}),
        ...(count ? { n: count } : {}),
        ...(payload.quality ? { quality: payload.quality } : {}),
        ...(typeof payload.seed === 'number' && Number.isFinite(payload.seed)
          ? { seed: Math.floor(payload.seed) }
          : {}),
      },
      timeoutMs: options.timeout ?? this.config.timeout ?? 60_000,
      retryPolicy: {
        maxRetries: 0,
        retryOnNetworkError: false,
        retryOnTimeout: false,
        retryableStatusCodes: [],
      },
      cooldownPolicy: {
        key: `${this.config.id}:image.generate`,
        failureThreshold: 2,
        cooldownMs: 15_000,
        autoResetOnSuccess: true,
      },
    })
    const raw = asRecord(response.data)
    const images = normalizeOpenAiImageItems(raw.data)
    if (images.length === 0) {
      throw new Error(`[${this.type}] Image generation response is missing images`)
    }

    return {
      result: {
        images,
        ...(typeof payload.seed === 'number' && Number.isFinite(payload.seed)
          ? { seed: Math.floor(payload.seed) }
          : {}),
      },
      usage: extractImageUsage(raw),
      model: typeof raw.model === 'string' ? raw.model : modelName,
      latency: Date.now() - startTime,
      traceId,
      provider: this.type,
    }
  }

  async imageEdit(
    payload: IntelligenceImageEditPayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<IntelligenceImageEditResult>> {
    const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
    if (!prompt) {
      throw new Error(`[${this.type}] Image edit prompt is required`)
    }

    const startTime = Date.now()
    const traceId = this.generateTraceId()
    const modelName = this.resolveImageModel(options)
    const image = await toImageFilePayload(payload.source, 'image')
    const form = new FormData()
    form.append('image', image.blob, image.filename)
    form.append('model', modelName)
    form.append('prompt', prompt)
    if (payload.mask) {
      const mask = await toImageFilePayload(payload.mask, 'mask')
      form.append('mask', mask.blob, mask.filename)
    }

    const response = await getNetworkService().request<Record<string, unknown>>({
      method: 'POST',
      url: `${this.resolveBaseUrl()}/images/edits`,
      headers: {
        Authorization: `Bearer ${this.resolveApiKey()}`,
      },
      body: form,
      timeoutMs: options.timeout ?? this.config.timeout ?? 60_000,
      retryPolicy: {
        maxRetries: 0,
        retryOnNetworkError: false,
        retryOnTimeout: false,
        retryableStatusCodes: [],
      },
      cooldownPolicy: {
        key: `${this.config.id}:image.edit`,
        failureThreshold: 2,
        cooldownMs: 15_000,
        autoResetOnSuccess: true,
      },
    })
    const raw = asRecord(response.data)
    const images = normalizeOpenAiImageItems(raw.data)
    const first = images[0]
    if (!first) {
      throw new Error(`[${this.type}] Image edit response is missing images`)
    }

    return {
      result: {
        image: {
          ...(first.url ? { url: first.url } : {}),
          ...(first.base64 ? { base64: first.base64 } : {}),
        },
        ...(first.revisedPrompt ? { revisedPrompt: first.revisedPrompt } : {}),
      },
      usage: extractImageUsage(raw),
      model: typeof raw.model === 'string' ? raw.model : modelName,
      latency: Date.now() - startTime,
      traceId,
      provider: this.type,
    }
  }

  async tts(
    payload: IntelligenceTTSPayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<IntelligenceTTSResult>> {
    const text = typeof payload.text === 'string' ? payload.text.trim() : ''
    if (!text) {
      throw new Error(`[${this.type}] TTS text is required`)
    }

    const startTime = Date.now()
    const traceId = this.generateTraceId()
    const modelName = this.resolveTtsModel(payload, options)
    const { responseFormat, mimeType } = normalizeSpeechFormat(payload.format)
    const voice = payload.voice?.trim() || this.defaultTtsVoice
    const speed = clampSpeechSpeed(payload.speed)

    const response = await getNetworkService().request<ArrayBuffer>({
      method: 'POST',
      url: `${this.resolveBaseUrl()}/audio/speech`,
      headers: {
        'Authorization': `Bearer ${this.resolveApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: modelName,
        input: text,
        voice,
        response_format: responseFormat,
        ...(speed ? { speed } : {}),
      },
      responseType: 'arrayBuffer',
      timeoutMs: options.timeout ?? this.config.timeout ?? 30_000,
      retryPolicy: {
        maxRetries: 0,
        retryOnNetworkError: false,
        retryOnTimeout: false,
        retryableStatusCodes: [],
      },
      cooldownPolicy: {
        key: `${this.config.id}:audio.tts`,
        failureThreshold: 2,
        cooldownMs: 15_000,
        autoResetOnSuccess: true,
      },
    })

    if (response.data.byteLength === 0) {
      throw new Error(`[${this.type}] TTS provider returned empty audio payload`)
    }

    return {
      result: {
        audio: arrayBufferToDataUrl(response.data, mimeType),
        format: responseFormat,
      },
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      model: modelName,
      latency: Date.now() - startTime,
      traceId,
      provider: this.type,
    }
  }

  async stt(
    payload: IntelligenceSTTPayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<IntelligenceSTTResult>> {
    const result = await this.invokeAudioTranscription(
      {
        audio: payload.audio,
        language: payload.language,
        format: payload.format,
        enableTimestamps: payload.enableTimestamps,
        task: 'transcribe',
      },
      options,
    )
    const segments = readAudioSegments(result.raw.segments).map(segment => ({
      text: typeof segment.text === 'string' ? segment.text : '',
      start:
        typeof segment.start === 'number' && Number.isFinite(segment.start) ? segment.start : 0,
      end: typeof segment.end === 'number' && Number.isFinite(segment.end) ? segment.end : 0,
      ...(typeof segment.speaker === 'string' ? { speaker: segment.speaker } : {}),
      ...(typeof segment.confidence === 'number' && Number.isFinite(segment.confidence)
        ? { confidence: segment.confidence }
        : {}),
    }))
    return {
      ...result.invokeResult,
      result: {
        text: result.text,
        confidence: readAudioConfidence(result.raw, readAudioSegments(result.raw.segments)),
        ...(result.language ? { language: result.language } : {}),
        ...(segments.length > 0 ? { segments } : {}),
      },
    }
  }

  async audioTranscribe(
    payload: IntelligenceAudioTranscribePayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<IntelligenceAudioTranscribeResult>> {
    const result = await this.invokeAudioTranscription(payload, options)
    const rawSegments = readAudioSegments(result.raw.segments)
    const segments = rawSegments.map((segment, index) => ({
      id: typeof segment.id === 'number' && Number.isFinite(segment.id) ? segment.id : index,
      text: typeof segment.text === 'string' ? segment.text : '',
      start:
        typeof segment.start === 'number' && Number.isFinite(segment.start) ? segment.start : 0,
      end: typeof segment.end === 'number' && Number.isFinite(segment.end) ? segment.end : 0,
      ...(typeof segment.confidence === 'number' && Number.isFinite(segment.confidence)
        ? { confidence: segment.confidence }
        : {}),
    }))
    return {
      ...result.invokeResult,
      result: {
        text: result.text,
        language: result.language || payload.language || '',
        duration: readAudioDuration(result.raw, rawSegments),
        ...(segments.length > 0 ? { segments } : {}),
      },
    }
  }

  private async invokeAudioTranscription(
    payload: IntelligenceAudioTranscribePayload,
    options: IntelligenceInvokeOptions,
  ): Promise<{
    invokeResult: Omit<IntelligenceInvokeResult<unknown>, 'result'>
    raw: Record<string, unknown>
    text: string
    language: string
  }> {
    const audio = toAudioFilePayload(payload.audio, payload.format)
    const startTime = Date.now()
    const traceId = this.generateTraceId()
    const modelName = this.resolveTranscriptionModel(options)
    const form = new FormData()
    form.append('file', audio.blob, audio.filename)
    form.append('model', modelName)
    form.append('response_format', payload.enableTimestamps ? 'verbose_json' : 'json')
    if (payload.enableTimestamps) {
      form.append('timestamp_granularities[]', 'segment')
    }
    if (payload.language) {
      form.append('language', payload.language)
    }
    if (payload.prompt) {
      form.append('prompt', payload.prompt)
    }

    const endpoint = payload.task === 'translate' ? 'translations' : 'transcriptions'
    const response = await getNetworkService().request<Record<string, unknown>>({
      method: 'POST',
      url: `${this.resolveBaseUrl()}/audio/${endpoint}`,
      headers: {
        Authorization: `Bearer ${this.resolveApiKey()}`,
      },
      body: form,
      timeoutMs: options.timeout ?? this.config.timeout ?? 30_000,
      retryPolicy: {
        maxRetries: 0,
        retryOnNetworkError: false,
        retryOnTimeout: false,
        retryableStatusCodes: [],
      },
      cooldownPolicy: {
        key: `${this.config.id}:audio.${endpoint}`,
        failureThreshold: 2,
        cooldownMs: 15_000,
        autoResetOnSuccess: true,
      },
    })
    const raw = asRecord(response.data)
    const text = typeof raw.text === 'string' ? raw.text : ''
    if (!text) {
      throw new Error(`[${this.type}] Audio transcription response is missing text`)
    }

    return {
      invokeResult: {
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        model: typeof raw.model === 'string' ? raw.model : modelName,
        latency: Date.now() - startTime,
        traceId,
        provider: this.type,
      },
      raw,
      text,
      language: typeof raw.language === 'string' ? raw.language : '',
    }
  }
}
