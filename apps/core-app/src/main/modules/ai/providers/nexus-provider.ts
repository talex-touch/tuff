import type {
  IntelligenceChatPayload,
  IntelligenceCodeExplainPayload,
  IntelligenceCodeExplainResult,
  IntelligenceCodeReviewPayload,
  IntelligenceCodeReviewResult,
  IntelligenceEmbeddingPayload,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceRewritePayload,
  IntelligenceStreamChunk,
  IntelligenceSummarizePayload,
  IntelligenceTTSPayload,
  IntelligenceTTSResult,
  IntelligenceTranslatePayload,
  IntelligenceUsageInfo,
  IntelligenceVisionOcrPayload,
  IntelligenceVisionOcrResult
} from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { getNetworkService } from '../../network'
import { getRuntimeNexusBaseUrl } from '../../nexus/runtime-base'
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

function normalizeUsage(usage?: Partial<IntelligenceUsageInfo>): IntelligenceUsageInfo {
  return {
    promptTokens: usage?.promptTokens ?? 0,
    completionTokens: usage?.completionTokens ?? 0,
    totalTokens: usage?.totalTokens ?? 0
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
      : ''
  ].filter((item): item is string => Boolean(item))

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...fallback, ...(parsed as Partial<T>) }
      }
    } catch {
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
      throw new Error('NEXUS_AUTH_REQUIRED')
    }
    return this.config.apiKey!.trim()
  }

  private async invokeNexus<T>(
    capabilityId: string,
    payload: unknown,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<T>> {
    const token = this.assertAuthToken()
    const startedAt = Date.now()
    const response = await getNetworkService().request<NexusInvokeResponse<T>>({
      method: 'POST',
      url: buildInvokeUrl(),
      headers: {
        Authorization: normalizeBearerToken(token),
        'Content-Type': 'application/json'
      },
      body: {
        capabilityId,
        payload,
        options: {
          providerId: options.preferredProviderId,
          modelPreference: options.modelPreference,
          timeoutMs: options.timeout,
          metadata: options.metadata
        }
      },
      responseType: 'json',
      timeoutMs: options.timeout ?? this.config.timeout ?? 30_000,
      retryPolicy: {
        maxRetries: 0,
        retryOnNetworkError: false,
        retryOnTimeout: false,
        retryableStatusCodes: []
      },
      cooldownPolicy: {
        key: `nexus-ai:${capabilityId}`,
        failureThreshold: 2,
        cooldownMs: 15_000,
        autoResetOnSuccess: true
      }
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
      provider: invocation.provider || this.config.id
    }
  }

  chat(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<string>> {
    return this.invokeNexus('text.chat', payload, options)
  }

  async *chatStream(
    _payload: IntelligenceChatPayload,
    _options: IntelligenceInvokeOptions
  ): AsyncGenerator<IntelligenceStreamChunk> {
    throw new Error('NEXUS_STREAM_UNSUPPORTED')
  }

  embedding(
    _payload: IntelligenceEmbeddingPayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<number[]>> {
    return Promise.reject(new Error('[custom] Embedding capability is unsupported'))
  }

  translate(
    payload: IntelligenceTranslatePayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<string>> {
    return this.invokeNexus('text.translate', payload, options)
  }

  summarize(
    payload: IntelligenceSummarizePayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<string>> {
    return this.invokeNexus('text.summarize', payload, options)
  }

  rewrite(
    payload: IntelligenceRewritePayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<string>> {
    return this.invokeNexus('text.rewrite', payload, options)
  }

  async codeExplain(
    payload: IntelligenceCodeExplainPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceCodeExplainResult>> {
    const result = await this.invokeNexus<unknown>('code.explain', payload, options)
    return {
      ...result,
      result: parseJsonResult(result.result, {
        explanation: typeof result.result === 'string' ? result.result : '',
        summary: '',
        keyPoints: []
      })
    }
  }

  async codeReview(
    payload: IntelligenceCodeReviewPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceCodeReviewResult>> {
    const result = await this.invokeNexus<unknown>('code.review', payload, options)
    return {
      ...result,
      result: parseJsonResult(result.result, {
        summary: typeof result.result === 'string' ? result.result : '',
        score: 0,
        issues: [],
        improvements: []
      })
    }
  }

  visionOcr(
    payload: IntelligenceVisionOcrPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceVisionOcrResult>> {
    return this.invokeNexus('vision.ocr', payload, options)
  }

  tts(
    payload: IntelligenceTTSPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceTTSResult>> {
    return this.invokeNexus('audio.tts', payload, options)
  }
}
