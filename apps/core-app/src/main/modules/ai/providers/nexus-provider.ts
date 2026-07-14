import type {
  IntelligenceChatPayload,
  IntelligenceCodeExplainPayload,
  IntelligenceCodeExplainResult,
  IntelligenceCodeReviewPayload,
  IntelligenceCodeReviewResult,
  IntelligenceEmbeddingPayload,
  IntelligenceImageTranslateE2ePayload,
  IntelligenceImageTranslateE2eResult,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceRewritePayload,
  IntelligenceStreamChunk,
  IntelligenceSummarizePayload,
  IntelligenceTranslatePayload,
  IntelligenceTTSPayload,
  IntelligenceTTSResult,
  IntelligenceUsageInfo,
  IntelligenceVisionOcrPayload,
  IntelligenceVisionOcrResult,
} from '@talex-touch/tuff-intelligence'
import type { IntelligenceErrorCode } from '@talex-touch/utils/transport/events/types'
import { StringDecoder } from 'node:string_decoder'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { NetworkHttpStatusError } from '@talex-touch/utils/network'
import { isIntelligenceErrorCode } from '@talex-touch/utils/transport/events/types'
import { COREBOX_SCREENSHOT_TRANSLATE_SCENE_ID } from '../../../../shared/events/corebox-scenes'
import { getNetworkService } from '../../network'
import { getRuntimeNexusBaseUrl } from '../../nexus/runtime-base'
import { extractTranslatedImageFromSceneRun, runNexusScene } from '../../nexus/scene-client'
import { normalizeIntelligenceError } from '../intelligence-error-normalizer'
import { IntelligenceProvider } from '../runtime/base-provider'

interface NexusInvokeResponse<T = unknown> {
  invocation?: {
    capabilityId: string
    result: T
    usage?: Partial<IntelligenceUsageInfo>
    model?: string
    latency?: number
    traceId?: string
    provider?: string
  }
}

interface NexusTransportFailure {
  message?: string
  code?: IntelligenceErrorCode
  reason?: string
  recovery?: string
}

type NexusStreamEventType = 'start' | 'delta' | 'usage' | 'end' | 'error'

interface NexusStreamEvent extends NexusTransportFailure {
  type: NexusStreamEventType
  delta?: string
  usage?: IntelligenceUsageInfo
  model?: string
  latency?: number
  traceId?: string
  provider?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNexusStreamEventType(value: string): value is NexusStreamEventType {
  return (
    value === 'start'
    || value === 'delta'
    || value === 'usage'
    || value === 'end'
    || value === 'error'
  )
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function parseUsage(value: unknown): IntelligenceUsageInfo | undefined {
  if (!isRecord(value))
    return undefined
  return {
    promptTokens: readOptionalNumber(value.promptTokens) ?? 0,
    completionTokens: readOptionalNumber(value.completionTokens) ?? 0,
    totalTokens: readOptionalNumber(value.totalTokens) ?? 0,
  }
}

function parseNexusStreamEvent(value: string): NexusStreamEvent | null {
  if (value === '[DONE]')
    return { type: 'end' }
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  }
  catch {
    throw new Error('NEXUS_AI_STREAM_INVALID_EVENT')
  }
  if (!isRecord(parsed))
    return null
  const type = readOptionalString(parsed.type)
  if (!type || !isNexusStreamEventType(type))
    return null
  return {
    type,
    delta: typeof parsed.delta === 'string' ? parsed.delta : undefined,
    message: readOptionalString(parsed.message),
    code: isIntelligenceErrorCode(parsed.code) ? parsed.code : undefined,
    reason: readOptionalString(parsed.reason),
    recovery: readOptionalString(parsed.recovery),
    usage: parseUsage(parsed.usage),
    model: readOptionalString(parsed.model),
    latency: readOptionalNumber(parsed.latency),
    traceId: readOptionalString(parsed.traceId),
    provider: readOptionalString(parsed.provider),
  }
}

function createNexusTransportError(failureData: NexusTransportFailure): Error & {
  code?: IntelligenceErrorCode
  reason?: string
  recovery?: string
} {
  const failure = new Error(
    failureData.message || failureData.reason || 'NEXUS_AI_TRANSPORT_FAILED',
  ) as Error & {
    code?: IntelligenceErrorCode
    reason?: string
    recovery?: string
  }
  if (failureData.code)
    failure.code = failureData.code
  if (failureData.reason)
    failure.reason = failureData.reason
  if (failureData.recovery)
    failure.recovery = failureData.recovery
  return failure
}

function parseNexusHttpFailure(value: unknown): NexusTransportFailure | null {
  if (!isRecord(value))
    return null

  const nested = isRecord(value.data) ? value.data : null
  const candidate = nested && isIntelligenceErrorCode(nested.code)
    ? nested
    : isIntelligenceErrorCode(value.code)
      ? value
      : null
  if (!candidate || !isIntelligenceErrorCode(candidate.code))
    return null

  return {
    code: candidate.code,
    message:
      readOptionalString(candidate.message)
      || readOptionalString(value.message)
      || readOptionalString(value.statusMessage),
    reason: readOptionalString(candidate.reason),
    recovery: readOptionalString(candidate.recovery),
  }
}

function extractSseData(frame: string): string | null {
  const data = frame
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart())
    .join('\n')
  return data || null
}

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value))
    return value
  if (value instanceof Uint8Array)
    return Buffer.from(value)
  return Buffer.from(String(value))
}

function normalizeBearerToken(token: string): string {
  const trimmed = token.trim()
  return trimmed.startsWith('Bearer ') ? trimmed : `Bearer ${trimmed}`
}

function isGuestToken(value: unknown): boolean {
  return typeof value !== 'string' || !value.trim() || value.trim() === 'guest'
}

function buildInvokeUrl(): string {
  return new URL('/api/v1/intelligence/invoke', `${getRuntimeNexusBaseUrl()}/`).toString()
}

function buildStreamUrl(): string {
  return new URL('/api/v1/intelligence/stream', `${getRuntimeNexusBaseUrl()}/`).toString()
}

function normalizeUsage(usage?: Partial<IntelligenceUsageInfo>): IntelligenceUsageInfo {
  return {
    promptTokens: usage?.promptTokens ?? 0,
    completionTokens: usage?.completionTokens ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
  }
}

function parseJsonResult<T extends object>(value: unknown, fallback: T): T {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...fallback, ...(value as Partial<T>) }
  }
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1]?.trim()
  const candidates = [
    fenced,
    trimmed,
    trimmed.includes('{') && trimmed.includes('}')
      ? trimmed.slice(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1)
      : '',
  ].filter((item): item is string => Boolean(item))

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...fallback, ...(parsed as Partial<T>) }
      }
    }
    catch {
      // Try the next candidate.
    }
  }
  return fallback
}

export function isNexusProviderConfig(config: {
  id?: string
  metadata?: Record<string, unknown>
}): boolean {
  return config.id === 'tuff-nexus-default' || config.metadata?.origin === 'tuff-nexus'
}

export class NexusProvider extends IntelligenceProvider {
  readonly type = IntelligenceProviderType.CUSTOM

  private assertAuthToken(): string {
    if (isGuestToken(this.config.apiKey) || this.config.metadata?.tokenMode === 'guest') {
      throw createNexusTransportError(normalizeIntelligenceError(new Error('NEXUS_AUTH_REQUIRED')))
    }
    return this.config.apiKey!.trim()
  }

  private async invokeNexus<T>(
    capabilityId: string,
    payload: unknown,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<T>> {
    const token = this.assertAuthToken()
    const startedAt = Date.now()
    const response = await getNetworkService().request<NexusInvokeResponse<T>>({
      method: 'POST',
      url: buildInvokeUrl(),
      headers: {
        'Authorization': normalizeBearerToken(token),
        'Content-Type': 'application/json',
      },
      body: {
        capabilityId,
        payload,
        options: {
          providerId: options.preferredProviderId,
          modelPreference: options.modelPreference,
          timeoutMs: options.timeout,
          metadata: options.metadata,
        },
      },
      responseType: 'json',
      captureErrorResponseData: true,
      timeoutMs: options.timeout ?? this.config.timeout ?? 30_000,
      retryPolicy: {
        maxRetries: 0,
        retryOnNetworkError: false,
        retryOnTimeout: false,
        retryableStatusCodes: [],
      },
      cooldownPolicy: {
        key: `nexus-ai:${capabilityId}`,
        failureThreshold: 2,
        cooldownMs: 15_000,
        autoResetOnSuccess: true,
      },
    }).catch((error: unknown) => {
      if (error instanceof NetworkHttpStatusError) {
        const failure = parseNexusHttpFailure(error.responseData)
        if (failure)
          throw createNexusTransportError(failure)
      }
      throw error
    })

    const invocation = response.data?.invocation
    if (!invocation) {
      throw new Error('NEXUS_AI_EMPTY_RESPONSE')
    }

    return {
      result: invocation.result,
      usage: normalizeUsage(invocation.usage),
      model: invocation.model || this.config.defaultModel || this.config.models?.[0] || 'nexus',
      latency: invocation.latency ?? Date.now() - startedAt,
      traceId: invocation.traceId || this.generateTraceId(),
      provider: invocation.provider || this.config.id,
    }
  }

  chat(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<string>> {
    return this.invokeNexus('text.chat', payload, options)
  }

  async* chatStream(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions,
  ): AsyncGenerator<IntelligenceStreamChunk> {
    const token = this.assertAuthToken()
    const response = await getNetworkService().requestStream({
      method: 'POST',
      url: buildStreamUrl(),
      headers: {
        'Accept': 'text/event-stream',
        'Authorization': normalizeBearerToken(token),
        'Content-Type': 'application/json',
      },
      body: {
        capabilityId: 'text.chat',
        payload,
        options: {
          providerId: options.preferredProviderId,
          modelPreference: options.modelPreference,
          allowedProviderIds: options.allowedProviderIds,
          timeoutMs: options.timeout,
          metadata: options.metadata,
        },
      },
      timeoutMs: options.timeout ?? this.config.timeout ?? 30_000,
      retryPolicy: {
        maxRetries: 0,
        retryOnNetworkError: false,
        retryOnTimeout: false,
        retryableStatusCodes: [],
      },
      cooldownPolicy: {
        key: 'nexus-ai:text.chat:stream',
        failureThreshold: 2,
        cooldownMs: 15_000,
        autoResetOnSuccess: true,
      },
    })

    const decoder = new StringDecoder('utf8')
    let buffer = ''
    let usage = normalizeUsage()
    let traceId = this.generateTraceId()
    let provider = this.config.id
    let model = this.config.defaultModel || this.config.models?.[0] || 'nexus'
    let latency = 0
    let ended = false
    // NetworkStreamResponse exposes a Node Readable without its async-iterator generic.
    const stream = response.stream as unknown as AsyncIterable<unknown>

    const applyMetadata = (event: NexusStreamEvent): void => {
      traceId = event.traceId ?? traceId
      provider = event.provider ?? provider
      model = event.model ?? model
      latency = event.latency ?? latency
    }

    const consumeFrame = function* (frame: string): Generator<IntelligenceStreamChunk> {
      const data = extractSseData(frame)
      if (!data)
        return
      const event = parseNexusStreamEvent(data)
      if (!event)
        return
      applyMetadata(event)
      if (event.type === 'error') {
        throw createNexusTransportError(event)
      }
      if (event.type === 'usage') {
        usage = event.usage ?? usage
        return
      }
      if (event.type === 'delta' && event.delta) {
        yield {
          delta: event.delta,
          done: false,
          traceId,
          provider,
          model,
          latency,
        }
        return
      }
      if (event.type === 'end') {
        ended = true
        yield {
          delta: '',
          done: true,
          usage,
          traceId,
          provider,
          model,
          latency,
        }
      }
    }

    for await (const chunk of stream) {
      buffer = `${buffer}${decoder.write(toBuffer(chunk))}`.replaceAll('\r\n', '\n')
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        yield* consumeFrame(frame)
        if (ended)
          return
      }
    }

    buffer = `${buffer}${decoder.end()}`.replaceAll('\r\n', '\n')
    if (buffer.trim())
      yield* consumeFrame(buffer)
    if (!ended)
      throw new Error('NEXUS_AI_STREAM_INCOMPLETE')
  }

  embedding(
    _payload: IntelligenceEmbeddingPayload,
    _options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<number[]>> {
    return Promise.reject(new Error('[custom] Embedding capability is unsupported'))
  }

  translate(
    payload: IntelligenceTranslatePayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<string>> {
    return this.invokeNexus('text.translate', payload, options)
  }

  summarize(
    payload: IntelligenceSummarizePayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<string>> {
    return this.invokeNexus('text.summarize', payload, options)
  }

  rewrite(
    payload: IntelligenceRewritePayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<string>> {
    return this.invokeNexus('text.rewrite', payload, options)
  }

  async codeExplain(
    payload: IntelligenceCodeExplainPayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<IntelligenceCodeExplainResult>> {
    const result = await this.invokeNexus<unknown>('code.explain', payload, options)
    return {
      ...result,
      result: parseJsonResult(result.result, {
        explanation: typeof result.result === 'string' ? result.result : '',
        summary: '',
        keyPoints: [],
      }),
    }
  }

  async codeReview(
    payload: IntelligenceCodeReviewPayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<IntelligenceCodeReviewResult>> {
    const result = await this.invokeNexus<unknown>('code.review', payload, options)
    return {
      ...result,
      result: parseJsonResult(result.result, {
        summary: typeof result.result === 'string' ? result.result : '',
        score: 0,
        issues: [],
        improvements: [],
      }),
    }
  }

  visionOcr(
    payload: IntelligenceVisionOcrPayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<IntelligenceVisionOcrResult>> {
    return this.invokeNexus('vision.ocr', payload, options)
  }

  async imageTranslateE2e(
    payload: IntelligenceImageTranslateE2ePayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<IntelligenceImageTranslateE2eResult>> {
    this.assertAuthToken()
    const startedAt = Date.now()
    const run = await runNexusScene(COREBOX_SCREENSHOT_TRANSLATE_SCENE_ID, {
      input: {
        imageBase64: payload.imageBase64,
        targetLang: payload.targetLang || 'zh',
        sourceLang: payload.sourceLang,
        imageMimeType: payload.imageMimeType,
      },
      capability: 'image.translate.e2e',
      providerId: options.preferredProviderId,
      timeoutMs: options.timeout ?? this.config.timeout ?? 30_000,
    })
    const translated = extractTranslatedImageFromSceneRun(run)
    if (!translated) {
      throw new Error('NEXUS_IMAGE_TRANSLATE_EMPTY_RESPONSE')
    }

    return {
      result: {
        translatedImageBase64: translated.translatedImageBase64,
        imageMimeType: translated.imageMimeType,
        sourceText: translated.sourceText,
        targetText: translated.targetText,
        overlay: translated.overlay,
      },
      usage: normalizeUsage(),
      model: this.config.defaultModel || this.config.models?.[0] || 'nexus-image-translate',
      latency: Date.now() - startedAt,
      traceId: typeof run?.runId === 'string' ? run.runId : this.generateTraceId(),
      provider: this.config.id,
    }
  }

  tts(
    payload: IntelligenceTTSPayload,
    options: IntelligenceInvokeOptions,
  ): Promise<IntelligenceInvokeResult<IntelligenceTTSResult>> {
    return this.invokeNexus('audio.tts', payload, options)
  }
}
