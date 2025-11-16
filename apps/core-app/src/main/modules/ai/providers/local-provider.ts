import type {
  AiChatPayload,
  AiEmbeddingPayload,
  AiInvokeOptions,
  AiInvokeResult,
  AiStreamChunk,
  AiTranslatePayload,
  AiUsageInfo
} from '@talex-touch/utils/types/aisdk'
import { AiProviderType } from '@talex-touch/utils/types/aisdk'
import { IntelligenceProvider } from '../runtime/base-provider'

export class LocalProvider extends IntelligenceProvider {
  readonly type = AiProviderType.LOCAL

  private get baseUrl(): string {
    if (!this.config.baseUrl) {
      throw new Error('[LocalProvider] baseUrl is required')
    }
    return this.config.baseUrl
  }

  async chat(payload: AiChatPayload, options: AiInvokeOptions): Promise<AiInvokeResult<string>> {
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

    const data = await response.json()
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

  async *chatStream(): AsyncGenerator<AiStreamChunk> {
    throw new Error('[LocalProvider] Streaming not implemented')
  }

  async embedding(payload: AiEmbeddingPayload, options: AiInvokeOptions): Promise<AiInvokeResult<number[]>> {
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

    const data = await response.json()
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

  async translate(payload: AiTranslatePayload, options: AiInvokeOptions): Promise<AiInvokeResult<string>> {
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
