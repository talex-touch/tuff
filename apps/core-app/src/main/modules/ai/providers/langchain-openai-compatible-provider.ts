import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  IntelligenceAudioTranscribePayload,
  IntelligenceAudioTranscribeResult,
  IntelligenceChatPayload,
  IntelligenceImageEditPayload,
  IntelligenceImageEditResult,
  IntelligenceImageGeneratePayload,
  IntelligenceImageGenerateResult,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceMessage,
  IntelligenceSTTPayload,
  IntelligenceSTTResult,
  IntelligenceStreamChunk,
  IntelligenceTTSPayload,
  IntelligenceTTSResult,
  IntelligenceUsageInfo,
  IntelligenceVideoGeneratePayload,
  IntelligenceVideoGenerateResult,
  IntelligenceVisionImageSource,
  IntelligenceVisionOcrPayload,
  IntelligenceVisionOcrResult,
  IntelligenceEmbeddingPayload,
  IntelligenceTranslatePayload
} from '@talex-touch/tuff-intelligence'
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai'
import { IntelligenceProvider } from '../runtime/base-provider'
import { getNetworkService } from '../../network'
import type { TempFileService } from '../../../service/temp-file.service'

const OPENAI_CHAT_SUFFIXES = ['/chat/completions', '/completions']
const OPENAI_VERSION_SUFFIXES = ['/v1', '/api/v1', '/openai/v1', '/api/openai/v1']
const HTTP_STATUS_ACCEPT_ALL = Array.from({ length: 500 }, (_, index) => index + 100)
const MEDIA_NAMESPACE = 'intelligence/media'
const MEDIA_RETENTION_MS = 24 * 60 * 60 * 1000

let mediaNamespaceInitialized = false
let tempFileServicePromise: Promise<TempFileService> | null = null

async function resolveTempFileService(): Promise<TempFileService> {
  if (!tempFileServicePromise) {
    tempFileServicePromise = import('../../../service/temp-file.service')
      .then((mod) => mod.tempFileService)
      .catch((error) => {
        tempFileServicePromise = null
        throw error
      })
  }
  return tempFileServicePromise
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

function joinEndpoint(baseUrl: string, endpoint: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  const pathValue = endpoint.replace(/^\/+/, '')
  return `${base}/${pathValue}`
}

function pickStringField(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  return undefined
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const matched = dataUrl.match(/^data:(.+?);base64,(.+)$/)
  if (!matched) return null
  return {
    mimeType: matched[1] || 'application/octet-stream',
    base64: matched[2] || ''
  }
}

function ensureTfileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  let absolute = normalized
  if (/^\/[a-z]:\//i.test(absolute)) {
    absolute = absolute.slice(1)
  } else if (!/^[a-z]:\//i.test(absolute) && !absolute.startsWith('/')) {
    absolute = `/${absolute}`
  }
  const encoded = absolute
    .split('/')
    .map((segment) => {
      try {
        return encodeURIComponent(decodeURIComponent(segment))
      } catch {
        return encodeURIComponent(segment)
      }
    })
    .join('/')
  return `tfile://${encoded}`
}

function detectAudioMime(fileNameOrPath: string): string {
  const ext = path.extname(fileNameOrPath).toLowerCase()
  switch (ext) {
    case '.wav':
      return 'audio/wav'
    case '.ogg':
      return 'audio/ogg'
    case '.flac':
      return 'audio/flac'
    case '.m4a':
      return 'audio/mp4'
    case '.webm':
      return 'audio/webm'
    case '.mp3':
    default:
      return 'audio/mpeg'
  }
}

function audioExtFromMime(mimeType: string | null | undefined): string {
  const value = (mimeType || '').toLowerCase()
  if (value.includes('wav')) return 'wav'
  if (value.includes('ogg')) return 'ogg'
  if (value.includes('flac')) return 'flac'
  if (value.includes('webm')) return 'webm'
  if (value.includes('mp4') || value.includes('m4a')) return 'm4a'
  return 'mp3'
}

function imageExtFromMime(mimeType: string | null | undefined): string {
  const value = (mimeType || '').toLowerCase()
  if (value.includes('webp')) return 'webp'
  if (value.includes('jpeg') || value.includes('jpg')) return 'jpg'
  if (value.includes('gif')) return 'gif'
  if (value.includes('bmp')) return 'bmp'
  return 'png'
}

function safeFileName(prefix: string, ext: string): string {
  const normalizedPrefix = prefix.replace(/[^\w.-]+/g, '-').slice(0, 40) || 'media'
  const normalizedExt = ext.replace(/^\.+/, '')
  return `${normalizedPrefix}.${normalizedExt || 'bin'}`
}

function resolveBinaryArrayBuffer(data: unknown): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    return data
  }
  if (ArrayBuffer.isView(data)) {
    const view = data
    const copied = new Uint8Array(view.byteLength)
    copied.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
    return copied.buffer
  }
  throw new Error('Invalid binary response payload')
}

function toResponseBody(
  data: unknown,
  responseType: 'json' | 'text' | 'arrayBuffer'
): BodyInit | null | undefined {
  if (data === null || data === undefined) {
    return null
  }
  if (responseType === 'arrayBuffer') {
    return resolveBinaryArrayBuffer(data)
  }
  if (responseType === 'text') {
    return typeof data === 'string' ? data : String(data)
  }
  if (typeof data === 'string') {
    return data
  }
  return JSON.stringify(data)
}

function toWebResponse(
  response: {
    status: number
    statusText: string
    headers: Record<string, string>
    data: unknown
  },
  responseType: 'json' | 'text' | 'arrayBuffer'
): Response {
  return new Response(toResponseBody(response.data, responseType), {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers)
  })
}

function toBlobBinary(buffer: Buffer): ArrayBuffer {
  // Materialize to plain ArrayBuffer to satisfy strict BlobPart typing on TS 5.9+.
  const view = new Uint8Array(buffer.byteLength)
  view.set(buffer)
  return view.buffer
}

async function resolveBinaryInput(
  input: string | ArrayBuffer,
  fallbackFileName: string,
  fallbackMime: string
): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
  if (input instanceof ArrayBuffer) {
    return {
      buffer: Buffer.from(input),
      fileName: fallbackFileName,
      mimeType: fallbackMime
    }
  }

  const raw = input.trim()
  if (!raw) throw new Error('Empty binary input')

  if (raw.startsWith('data:')) {
    const parsed = parseDataUrl(raw)
    if (!parsed) throw new Error('Invalid data URL input')
    const ext = parsed.mimeType.startsWith('image/')
      ? imageExtFromMime(parsed.mimeType)
      : audioExtFromMime(parsed.mimeType)
    return {
      buffer: Buffer.from(parsed.base64, 'base64'),
      fileName: safeFileName(path.parse(fallbackFileName).name, ext),
      mimeType: parsed.mimeType
    }
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    const response = await getNetworkService().request<ArrayBuffer>({
      method: 'GET',
      url: raw,
      responseType: 'arrayBuffer'
    })
    const mimeType = response.headers['content-type'] || fallbackMime
    const buffer = Buffer.from(resolveBinaryArrayBuffer(response.data))
    const ext = mimeType.startsWith('image/')
      ? imageExtFromMime(mimeType)
      : audioExtFromMime(mimeType)
    return {
      buffer,
      fileName: safeFileName(path.parse(fallbackFileName).name, ext),
      mimeType
    }
  }

  let localPath = raw
  if (raw.startsWith('tfile://')) {
    try {
      const parsed = new URL(raw)
      const host = parsed.hostname || ''
      const pathname = parsed.pathname || ''
      const merged = host ? `/${host}${pathname}` : pathname
      localPath = decodeURIComponent(merged)
    } catch {
      localPath = decodeURIComponent(raw.replace(/^tfile:\/\//, '/'))
    }
  } else if (raw.startsWith('file://')) {
    localPath = decodeURIComponent(raw.replace(/^file:\/\//, ''))
  }

  if (/^\/[a-z]:\//i.test(localPath)) {
    localPath = localPath.slice(1)
  }

  if (localPath.startsWith('/') || /^[a-z]:[\\/]/i.test(localPath)) {
    const buffer = await readFile(localPath)
    const ext = path.extname(localPath).replace(/^\./, '')
    const mimeType = fallbackMime.startsWith('image/')
      ? detectMime(localPath)
      : detectAudioMime(localPath)
    const fallbackExt = mimeType.startsWith('image/')
      ? imageExtFromMime(mimeType)
      : audioExtFromMime(mimeType)
    return {
      buffer,
      fileName: safeFileName(path.parse(fallbackFileName).name, ext || fallbackExt),
      mimeType
    }
  }

  // base64 without prefix
  return {
    buffer: Buffer.from(raw, 'base64'),
    fileName: fallbackFileName,
    mimeType: fallbackMime
  }
}

export abstract class OpenAiCompatibleLangChainProvider extends IntelligenceProvider {
  protected abstract readonly defaultBaseUrl: string
  protected abstract readonly defaultChatModel: string
  protected readonly defaultEmbeddingModel: string = 'text-embedding-3-small'
  protected readonly defaultVisionModel: string | undefined
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

  private createChatModel(params: {
    model: string
    options: IntelligenceInvokeOptions
    temperature?: number
    maxTokens?: number
    streaming?: boolean
  }): ChatOpenAI {
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

    const model = this.createChatModel({
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
    const model = this.createChatModel({
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

    const model = this.createChatModel({
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

  protected resolveMediaModel(options: IntelligenceInvokeOptions, fallback: string): string {
    const model = options.modelPreference?.[0] || this.config.defaultModel || fallback
    this.validateModel(model, {
      capabilityId: options.metadata?.capabilityId as string | undefined
    })
    return model
  }

  protected getRequestTimeout(options: IntelligenceInvokeOptions): number {
    const timeout = options.timeout ?? this.config.timeout
    if (!Number.isFinite(timeout) || Number(timeout) <= 0) {
      return 30_000
    }
    return Number(timeout)
  }

  protected buildRequestSignal(options: IntelligenceInvokeOptions): AbortSignal | undefined {
    const timeout = this.getRequestTimeout(options)
    if (!Number.isFinite(timeout) || timeout <= 0) {
      return undefined
    }
    return AbortSignal.timeout(timeout)
  }

  protected async sendJsonRequest(
    endpoint: string,
    payload: Record<string, unknown>,
    options: IntelligenceInvokeOptions,
    responseType: 'json' | 'text' | 'arrayBuffer' = 'json'
  ): Promise<Response> {
    const response = await getNetworkService().request<unknown>({
      method: 'POST',
      url: joinEndpoint(this.resolveBaseUrl(), endpoint),
      headers: {
        Authorization: `Bearer ${this.resolveApiKey()}`,
        'Content-Type': 'application/json'
      },
      body: payload,
      signal: this.buildRequestSignal(options),
      timeoutMs: this.getRequestTimeout(options),
      responseType,
      validateStatus: HTTP_STATUS_ACCEPT_ALL
    })
    return toWebResponse(response, responseType)
  }

  protected async sendFormRequest(
    endpoint: string,
    formData: FormData,
    options: IntelligenceInvokeOptions,
    responseType: 'json' | 'text' | 'arrayBuffer' = 'json'
  ): Promise<Response> {
    const response = await getNetworkService().request<unknown>({
      method: 'POST',
      url: joinEndpoint(this.resolveBaseUrl(), endpoint),
      headers: {
        Authorization: `Bearer ${this.resolveApiKey()}`
      },
      body: formData,
      signal: this.buildRequestSignal(options),
      timeoutMs: this.getRequestTimeout(options),
      responseType,
      validateStatus: HTTP_STATUS_ACCEPT_ALL
    })
    return toWebResponse(response, responseType)
  }

  protected async ensureMediaNamespaceReady(): Promise<void> {
    if (mediaNamespaceInitialized) return
    const tempFileService = await resolveTempFileService()
    await tempFileService.ensureReady()
    tempFileService.registerNamespace({
      namespace: MEDIA_NAMESPACE,
      retentionMs: MEDIA_RETENTION_MS
    })
    tempFileService.startCleanup()
    mediaNamespaceInitialized = true
  }

  protected includeBase64Output(options: IntelligenceInvokeOptions): boolean {
    return options.output?.includeBase64 === true
  }

  protected async persistMediaBuffer(params: {
    buffer: Buffer
    ext: string
    prefix: string
    includeBase64: boolean
  }): Promise<{ url: string; base64?: string }> {
    const tempFileService = await resolveTempFileService()
    await this.ensureMediaNamespaceReady()
    const created = await tempFileService.createFile({
      namespace: MEDIA_NAMESPACE,
      ext: params.ext,
      buffer: params.buffer,
      prefix: params.prefix
    })
    return {
      url: ensureTfileUrl(created.path),
      base64: params.includeBase64 ? params.buffer.toString('base64') : undefined
    }
  }

  protected async decodeVisionSourceBinary(
    source: IntelligenceVisionImageSource,
    fileName = 'image-input.png'
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    if (source.type === 'data-url' && source.dataUrl) {
      return resolveBinaryInput(source.dataUrl, fileName, 'image/png')
    }
    if (source.type === 'base64' && source.base64) {
      return resolveBinaryInput(source.base64, fileName, 'image/png')
    }
    if (source.type === 'file' && source.filePath) {
      return resolveBinaryInput(source.filePath, fileName, detectMime(source.filePath))
    }
    throw new Error('Invalid image source')
  }

  protected async decodeAudioPayload(
    payloadAudio: IntelligenceSTTPayload['audio'] | IntelligenceAudioTranscribePayload['audio'],
    format?: string
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const ext = format?.replace(/^\./, '') || 'mp3'
    const fileName = safeFileName('audio-input', ext)
    const mimeType = detectAudioMime(fileName)
    return resolveBinaryInput(payloadAudio, fileName, mimeType)
  }

  protected async resolveImageOutputItem(
    item: Record<string, unknown>,
    options: IntelligenceInvokeOptions,
    prefix: string
  ): Promise<{ url?: string; base64?: string; revisedPrompt?: string }> {
    const includeBase64 = this.includeBase64Output(options)
    const revisedPrompt = pickStringField(item, ['revised_prompt', 'revisedPrompt'])

    const base64Payload = pickStringField(item, ['b64_json', 'base64', 'image_base64'])
    if (base64Payload) {
      const buffer = Buffer.from(base64Payload, 'base64')
      const stored = await this.persistMediaBuffer({
        buffer,
        ext: 'png',
        prefix,
        includeBase64
      })
      return {
        ...stored,
        revisedPrompt
      }
    }

    const remoteUrl = pickStringField(item, ['url', 'image_url'])
    if (!remoteUrl) {
      return {
        revisedPrompt
      }
    }

    const response = await getNetworkService().request<ArrayBuffer>({
      method: 'GET',
      url: remoteUrl,
      signal: this.buildRequestSignal(options),
      timeoutMs: this.getRequestTimeout(options),
      responseType: 'arrayBuffer'
    })
    const contentType = response.headers['content-type']
    const ext = imageExtFromMime(contentType)
    const buffer = Buffer.from(resolveBinaryArrayBuffer(response.data))
    const stored = await this.persistMediaBuffer({
      buffer,
      ext,
      prefix,
      includeBase64
    })
    return {
      ...stored,
      revisedPrompt
    }
  }

  async imageGenerate(
    payload: IntelligenceImageGeneratePayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceImageGenerateResult>> {
    const startTime = Date.now()
    const traceId = this.generateTraceId()
    const modelName = this.resolveMediaModel(options, this.defaultChatModel)

    const size =
      payload.width && payload.height
        ? `${Math.max(1, payload.width)}x${Math.max(1, payload.height)}`
        : undefined

    const requestPayload: Record<string, unknown> = {
      model: modelName,
      prompt: payload.prompt,
      n: Math.max(1, Math.min(payload.count ?? 1, 8)),
      response_format: this.includeBase64Output(options) ? 'b64_json' : 'url'
    }
    if (size) requestPayload.size = size
    if (payload.style) requestPayload.style = payload.style
    if (payload.quality) requestPayload.quality = payload.quality
    if (payload.negativePrompt) requestPayload.negative_prompt = payload.negativePrompt
    if (typeof payload.seed === 'number' && Number.isFinite(payload.seed)) {
      requestPayload.seed = payload.seed
    }

    const response = await this.sendJsonRequest('/images/generations', requestPayload, options)
    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(
        `[${this.type}] Image generate failed (${response.status}): ${errorBody || 'unknown error'}`
      )
    }

    const body = await this.parseJsonResponse<unknown>(response, {
      endpoint: '/images/generations'
    })
    const bodyRecord = asRecord(body)
    const rows = Array.isArray(bodyRecord.data) ? bodyRecord.data : []
    const images: IntelligenceImageGenerateResult['images'] = []

    for (const row of rows) {
      const item = asRecord(row)
      images.push(await this.resolveImageOutputItem(item, options, 'image-generate'))
    }

    return {
      result: {
        images,
        seed:
          typeof bodyRecord.seed === 'number' && Number.isFinite(bodyRecord.seed)
            ? bodyRecord.seed
            : payload.seed
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

  async imageEdit(
    payload: IntelligenceImageEditPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceImageEditResult>> {
    const startTime = Date.now()
    const traceId = this.generateTraceId()
    const modelName = this.resolveMediaModel(options, this.defaultChatModel)

    const imageSource = await this.decodeVisionSourceBinary(payload.source, 'image-edit-source.png')
    const formData = new FormData()
    formData.set('model', modelName)
    formData.set('prompt', payload.prompt)
    formData.set(
      'image',
      new Blob([toBlobBinary(imageSource.buffer)], { type: imageSource.mimeType }),
      imageSource.fileName
    )
    formData.set('response_format', this.includeBase64Output(options) ? 'b64_json' : 'url')
    if (payload.editType) {
      formData.set('edit_type', payload.editType)
    }

    if (payload.mask) {
      const maskSource = await this.decodeVisionSourceBinary(payload.mask, 'image-edit-mask.png')
      formData.set(
        'mask',
        new Blob([toBlobBinary(maskSource.buffer)], { type: maskSource.mimeType }),
        maskSource.fileName
      )
    }

    const response = await this.sendFormRequest('/images/edits', formData, options)
    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(
        `[${this.type}] Image edit failed (${response.status}): ${errorBody || 'unknown error'}`
      )
    }

    const body = await this.parseJsonResponse<unknown>(response, { endpoint: '/images/edits' })
    const bodyRecord = asRecord(body)
    const first = asRecord((Array.isArray(bodyRecord.data) ? bodyRecord.data[0] : undefined) ?? {})
    const rendered = await this.resolveImageOutputItem(first, options, 'image-edit')

    return {
      result: {
        image: {
          url: rendered.url,
          base64: rendered.base64
        },
        revisedPrompt: rendered.revisedPrompt
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

  async tts(
    payload: IntelligenceTTSPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceTTSResult>> {
    const startTime = Date.now()
    const traceId = this.generateTraceId()
    const modelName = this.resolveMediaModel(options, this.defaultChatModel)

    const response = await this.sendJsonRequest(
      '/audio/speech',
      {
        model: modelName,
        input: payload.text,
        voice: payload.voice || 'alloy',
        response_format: payload.format || 'mp3',
        speed: payload.speed
      },
      options,
      'arrayBuffer'
    )

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(
        `[${this.type}] TTS failed (${response.status}): ${errorBody || 'unknown error'}`
      )
    }

    const contentType = response.headers.get('content-type')
    const format = payload.format || audioExtFromMime(contentType)
    const buffer = Buffer.from(await response.arrayBuffer())
    const stored = await this.persistMediaBuffer({
      buffer,
      ext: format,
      prefix: 'audio-tts',
      includeBase64: this.includeBase64Output(options)
    })

    return {
      result: {
        audio: stored.url,
        url: stored.url,
        base64: stored.base64,
        format
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

  async stt(
    payload: IntelligenceSTTPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceSTTResult>> {
    const startTime = Date.now()
    const traceId = this.generateTraceId()
    const modelName = this.resolveMediaModel(options, this.defaultChatModel)
    const audio = await this.decodeAudioPayload(payload.audio, payload.format)

    const formData = new FormData()
    formData.set('model', modelName)
    formData.set(
      'file',
      new Blob([toBlobBinary(audio.buffer)], { type: audio.mimeType }),
      audio.fileName
    )
    if (payload.language) formData.set('language', payload.language)
    if (payload.enableTimestamps) formData.set('response_format', 'verbose_json')
    if (payload.enableSpeakerDiarization) formData.set('diarization', 'true')

    const response = await this.sendFormRequest('/audio/transcriptions', formData, options)
    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(
        `[${this.type}] STT failed (${response.status}): ${errorBody || 'unknown error'}`
      )
    }

    const body = await this.parseJsonResponse<unknown>(response, {
      endpoint: '/audio/transcriptions'
    })
    const bodyRecord = asRecord(body)
    const segmentsRaw = Array.isArray(bodyRecord.segments) ? bodyRecord.segments : []
    const segments = segmentsRaw.map((segment) => {
      const item = asRecord(segment)
      return {
        text: pickStringField(item, ['text']) || '',
        start: numberFrom(item.start),
        end: numberFrom(item.end),
        speaker: pickStringField(item, ['speaker']),
        confidence: numberFrom(item.confidence)
      }
    })

    return {
      result: {
        text: pickStringField(bodyRecord, ['text']) || '',
        confidence: numberFrom(bodyRecord.confidence, bodyRecord.avg_logprob, 1),
        language: pickStringField(bodyRecord, ['language']),
        segments: segments.length > 0 ? segments : undefined
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

  async audioTranscribe(
    payload: IntelligenceAudioTranscribePayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceAudioTranscribeResult>> {
    const startTime = Date.now()
    const traceId = this.generateTraceId()
    const modelName = this.resolveMediaModel(options, this.defaultChatModel)
    const audio = await this.decodeAudioPayload(payload.audio, payload.format)

    const endpoint = payload.task === 'translate' ? '/audio/translations' : '/audio/transcriptions'
    const formData = new FormData()
    formData.set('model', modelName)
    formData.set(
      'file',
      new Blob([toBlobBinary(audio.buffer)], { type: audio.mimeType }),
      audio.fileName
    )
    if (payload.language) formData.set('language', payload.language)
    if (payload.prompt) formData.set('prompt', payload.prompt)
    if (payload.enableTimestamps) formData.set('response_format', 'verbose_json')

    const response = await this.sendFormRequest(endpoint, formData, options)
    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(
        `[${this.type}] Audio transcribe failed (${response.status}): ${errorBody || 'unknown error'}`
      )
    }

    const body = await this.parseJsonResponse<unknown>(response, { endpoint })
    const bodyRecord = asRecord(body)
    const segmentsRaw = Array.isArray(bodyRecord.segments) ? bodyRecord.segments : []
    const segments = segmentsRaw.map((segment, index) => {
      const item = asRecord(segment)
      return {
        id: Number.isFinite(numberFrom(item.id)) ? numberFrom(item.id) : index,
        text: pickStringField(item, ['text']) || '',
        start: numberFrom(item.start),
        end: numberFrom(item.end),
        confidence: numberFrom(item.confidence)
      }
    })

    const duration =
      numberFrom(
        bodyRecord.duration,
        segments.length > 0 ? segments[segments.length - 1]?.end : undefined
      ) || 0

    return {
      result: {
        text: pickStringField(bodyRecord, ['text']) || '',
        language: pickStringField(bodyRecord, ['language']) || payload.language || 'unknown',
        duration,
        segments: segments.length > 0 ? segments : undefined
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

  videoGenerate(
    _payload: IntelligenceVideoGeneratePayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceVideoGenerateResult>> {
    return Promise.reject(new Error(`[${this.type}] Video generate capability is unsupported`))
  }
}
