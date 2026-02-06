import type {
  AiInvokeOptions,
  AiInvokeResult,
  AiStreamChunk,
  AiUsageInfo,
  IntelligenceChatPayload,
  IntelligenceEmbeddingPayload,
  IntelligenceTranslatePayload
} from '@talex-touch/utils'
import { IntelligenceProviderType } from '@talex-touch/utils'
import { IntelligenceProvider } from '../runtime/base-provider'

export class LocalProvider extends IntelligenceProvider {
  readonly type = IntelligenceProviderType.LOCAL

  private get baseUrl(): string {
    if (!this.config.baseUrl) {
      throw new Error('[LocalProvider] baseUrl is required')
    }
    return this.config.baseUrl
  }

  async chat(
    payload: IntelligenceChatPayload,
    options: AiInvokeOptions
  ): Promise<AiInvokeResult<string>> {
    const startTime = Date.now()
    const traceId = this.generateTraceId()

    const response = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.modelPreference?.[0] || this.config.defaultModel,
        messages: payload.messages
      }),
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
    })

    if (!response.ok) {
      throw new Error(`Local provider error: ${response.status} ${response.statusText}`)
    }

    const data = await this.parseJsonResponse<{
      result?: string
      usage?: AiUsageInfo
      model?: string
    }>(response, { endpoint: '/chat' })
    const latency = Date.now() - startTime

    const usage: AiUsageInfo = data.usage || {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    }

    return {
      result: data.result || '',
      usage,
      model: data.model || options.modelPreference?.[0] || 'local',
      latency,
      traceId,
      provider: this.type
    }
  }

  async *chatStream(
    payload: IntelligenceChatPayload,
    options: AiInvokeOptions
  ): AsyncGenerator<AiStreamChunk> {
    const result = await this.chat(payload, options)
    yield {
      delta: result.result ?? '',
      done: true,
      usage: result.usage
    }
  }

  async embedding(
    payload: IntelligenceEmbeddingPayload,
    options: AiInvokeOptions
  ): Promise<AiInvokeResult<number[]>> {
    const startTime = Date.now()
    const traceId = this.generateTraceId()

    const response = await fetch(`${this.baseUrl}/embedding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: payload.model || this.config.defaultModel,
        input: payload.text
      }),
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
    })

    if (!response.ok) {
      throw new Error(`Local provider embedding error: ${response.status} ${response.statusText}`)
    }

    const data = await this.parseJsonResponse<{
      embedding?: number[]
      usage?: AiUsageInfo
      model?: string
    }>(response, { endpoint: '/embedding' })
    const latency = Date.now() - startTime

    return {
      result: data.embedding || [],
      usage: data.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: data.model || payload.model || 'local',
      latency,
      traceId,
      provider: this.type
    }
  }

  async translate(
    payload: IntelligenceTranslatePayload,
    options: AiInvokeOptions
  ): Promise<AiInvokeResult<string>> {
    return this.chat(
      {
        messages: [
          { role: 'system', content: `Translate text to ${payload.targetLang}` },
          { role: 'user', content: payload.text }
        ]
      },
      options
    )
  }
}
