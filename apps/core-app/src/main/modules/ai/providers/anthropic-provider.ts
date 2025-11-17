import type {
  AiChatPayload,
  AiInvokeOptions,
  AiInvokeResult,
  AiStreamChunk,
  AiUsageInfo
} from '@talex-touch/utils'
import { AiProviderType } from '@talex-touch/utils'
import { IntelligenceProvider } from '../runtime/base-provider'

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1'

export class AnthropicProvider extends IntelligenceProvider {
  readonly type = AiProviderType.ANTHROPIC

  private get baseUrl(): string {
    return this.config.baseUrl || DEFAULT_BASE_URL
  }

  private get headers(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey || '',
      'anthropic-version': '2023-06-01'
    }
  }

  async chat(payload: AiChatPayload, options: AiInvokeOptions): Promise<AiInvokeResult<string>> {
    this.validateApiKey()
    const startTime = Date.now()
    const traceId = this.generateTraceId()

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        model: options.modelPreference?.[0] || this.config.defaultModel || 'claude-3-5-sonnet-20241022',
        system: payload.messages.find(msg => msg.role === 'system')?.content,
        messages: payload.messages.filter(msg => msg.role !== 'system'),
        max_tokens: payload.maxTokens ?? 1024,
        temperature: payload.temperature ?? 0.7
      }),
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const latency = Date.now() - startTime

    const usage: AiUsageInfo = {
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
      totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)
    }

    return {
      result: data.content?.[0]?.text || '',
      usage,
      model: data.model,
      latency,
      traceId,
      provider: this.type
    }
  }

  async *chatStream(
    payload: AiChatPayload,
    options: AiInvokeOptions
  ): AsyncGenerator<AiStreamChunk> {
    this.validateApiKey()

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: { ...this.headers, accept: 'text/event-stream' },
      body: JSON.stringify({
        model: options.modelPreference?.[0] || this.config.defaultModel || 'claude-3-haiku-20240307',
        system: payload.messages.find(msg => msg.role === 'system')?.content,
        messages: payload.messages.filter(msg => msg.role !== 'system'),
        max_tokens: payload.maxTokens ?? 1024,
        temperature: payload.temperature ?? 0.7,
        stream: true
      }),
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
    })

    if (!response.ok || !response.body) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim() || line.trim() === 'data: [DONE]') continue
          if (!line.startsWith('data: ')) continue

          try {
            const event = JSON.parse(line.substring(6))
            const delta = event.delta?.text || event.content?.[0]?.text || ''
            if (delta) {
              yield { delta, done: false }
            }
          } catch (error) {
            console.error('[AnthropicProvider] Stream parse error:', error)
          }
        }
      }

      yield { delta: '', done: true }
    } finally {
      reader.releaseLock()
    }
  }

  async embedding(): Promise<AiInvokeResult<number[]>> {
    throw new Error('[AnthropicProvider] Embedding not supported')
  }

  async translate(): Promise<AiInvokeResult<string>> {
    throw new Error('[AnthropicProvider] Translate helper not implemented')
  }
}
