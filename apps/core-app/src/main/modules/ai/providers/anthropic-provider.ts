import type { BaseMessage } from '@langchain/core/messages'
import type {
  IntelligenceChatPayload,
  IntelligenceEmbeddingPayload,
  IntelligenceImageAnalyzePayload,
  IntelligenceImageAnalyzeResult,
  IntelligenceImageCaptionPayload,
  IntelligenceImageCaptionResult,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceMessage,
  IntelligenceStreamChunk,
  IntelligenceUsageInfo,
  IntelligenceVisionImageSource,
  IntelligenceVisionOcrPayload,
  IntelligenceVisionOcrResult,
} from '@talex-touch/tuff-intelligence'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ChatAnthropic } from '@langchain/anthropic'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { IntelligenceProvider } from '../runtime/base-provider'
import { extractReasoningContent, extractTextContent } from './langchain-openai-compatible-provider'

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1'

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

function normalizeAnthropicBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '')
  if (trimmed.toLowerCase().endsWith('/v1')) {
    return trimmed.slice(0, -3)
  }
  return trimmed
}

function resolveUsageInfo(rawMessage: Record<string, unknown>): IntelligenceUsageInfo {
  const usageMetadata = asRecord(rawMessage.usage_metadata)
  const responseMetadata = asRecord(rawMessage.response_metadata)
  const usage = asRecord(responseMetadata.usage)

  const promptTokens = numberFrom(
    usageMetadata.input_tokens,
    usageMetadata.prompt_tokens,
    usageMetadata.promptTokens,
    usage.input_tokens,
    usage.prompt_tokens,
    usage.promptTokens,
  )
  const completionTokens = numberFrom(
    usageMetadata.output_tokens,
    usageMetadata.completion_tokens,
    usageMetadata.completionTokens,
    usage.output_tokens,
    usage.completion_tokens,
    usage.completionTokens,
  )

  const totalTokens = numberFrom(
    usageMetadata.total_tokens,
    usageMetadata.totalTokens,
    usage.total_tokens,
    usage.totalTokens,
    promptTokens + completionTokens,
  )

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  }
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

function parseDataUrl(input: string): { mimeType: string, base64: string } | null {
  const matched = input.match(/^data:(.+?);base64,(.+)$/)
  if (!matched)
    return null
  return {
    mimeType: matched[1] || 'image/png',
    base64: matched[2] || '',
  }
}

async function toAnthropicImageSource(
  source: IntelligenceVisionImageSource,
): Promise<{ mimeType: string, base64: string }> {
  if (source.type === 'data-url' && source.dataUrl) {
    const parsed = parseDataUrl(source.dataUrl)
    if (!parsed)
      throw new Error('[AnthropicProvider] Invalid data URL image source')
    return parsed
  }

  if (source.type === 'base64' && source.base64) {
    const parsed = source.base64.startsWith('data:') ? parseDataUrl(source.base64) : null
    if (parsed)
      return parsed
    return {
      mimeType: 'image/png',
      base64: source.base64,
    }
  }

  if (source.type === 'file' && source.filePath) {
    const image = await readFile(source.filePath)
    return {
      mimeType: detectMime(source.filePath),
      base64: image.toString('base64'),
    }
  }

  throw new Error('[AnthropicProvider] Invalid vision image source')
}

export class AnthropicProvider extends IntelligenceProvider {
  readonly type = IntelligenceProviderType.ANTHROPIC

  private createModel(params: {
    model: string
    options: IntelligenceInvokeOptions
    temperature?: number
    maxTokens?: number
    streaming?: boolean
  }): ChatAnthropic {
    this.validateApiKey()

    const rawBaseUrl = this.config.baseUrl || DEFAULT_BASE_URL
    const baseUrl = normalizeAnthropicBaseUrl(rawBaseUrl)

    const modelConfig = {
      anthropicApiKey: this.config.apiKey,
      model: params.model,
      temperature: params.temperature ?? 0.7,
      maxTokens: params.maxTokens ?? 1024,
      streaming: params.streaming,
      timeout: params.options.timeout,
      anthropicApiUrl: baseUrl,
      clientOptions: {
        baseURL: baseUrl,
      },
    }

    return new ChatAnthropic(modelConfig as ConstructorParameters<typeof ChatAnthropic>[0])
  }

  private resolveChatModel(options: IntelligenceInvokeOptions): string {
    const model
      = options.modelPreference?.[0] || this.config.defaultModel || 'claude-3-5-sonnet-20241022'

    this.validateModel(model, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/langchain/chat',
    })

    return model
  }

  async chat(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<string>> {
    const startTime = Date.now()
    const traceId = this.generateTraceId()
    const modelName = this.resolveChatModel(options)

    const model = this.createModel({
      model: modelName,
      options,
      temperature: payload.temperature,
      maxTokens: payload.maxTokens,
    })

    const response = await model.invoke(toLangChainMessages(payload.messages))
    const rawMessage = asRecord(response)
    const content = extractTextContent(rawMessage.content)

    return {
      result: content,
      usage: resolveUsageInfo(rawMessage),
      model: modelName,
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

    const model = this.createModel({
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
    _payload: IntelligenceEmbeddingPayload,
    _options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<number[]>> {
    throw new Error('[AnthropicProvider] Embedding not supported')
  }

  async translate(
    payload: import('@talex-touch/tuff-intelligence').IntelligenceTranslatePayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<string>> {
    const chatPayload: IntelligenceChatPayload = {
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the following text to ${payload.targetLang}. Return only the translated text, without any explanations.`,
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
    maxTokens: number,
  ): Promise<{
    rawMessage: Record<string, unknown>
    rawContent: string
    modelName: string
    traceId: string
    startedAt: number
  }> {
    const startedAt = Date.now()
    const traceId = this.generateTraceId()
    const modelName
      = options.modelPreference?.[0] || this.config.defaultModel || 'claude-3-5-sonnet-20241022'

    this.validateModel(modelName, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/langchain/vision',
    })

    const imageSource = await toAnthropicImageSource(source)
    const model = this.createModel({ model: modelName, options, maxTokens })
    const response = await model.invoke([
      new HumanMessage({
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image',
            source_type: 'base64',
            mime_type: imageSource.mimeType,
            data: imageSource.base64,
          },
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
      1_000,
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
      usage: resolveUsageInfo(rawMessage),
      model: modelName,
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
    const style = payload.style || 'brief'
    const maxLength
      = typeof payload.maxLength === 'number' && Number.isFinite(payload.maxLength) && payload.maxLength > 0
        ? Math.floor(payload.maxLength)
        : undefined
    const { rawMessage, rawContent, modelName, traceId, startedAt } = await this.invokeVisionImage(
      payload.source,
      `Generate a ${style} image caption in ${payload.language || 'the image language'}.${maxLength ? ` Keep the caption under ${maxLength} characters.` : ''} Return JSON with fields: caption, alternativeCaptions, tags, confidence.`,
      options,
      512,
    )

    return {
      result: this.normalizeImageCaptionResult(rawContent, maxLength),
      usage: resolveUsageInfo(rawMessage),
      model: modelName,
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

    return {
      result: this.normalizeImageAnalyzeResult(rawContent),
      usage: resolveUsageInfo(rawMessage),
      model: modelName,
      latency: Date.now() - startedAt,
      traceId,
      provider: this.type,
      reasoning: extractReasoningContent(rawMessage),
    }
  }
}
