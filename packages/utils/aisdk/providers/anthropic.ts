import { AiProvider } from './base'
import type {
  AiProviderConfig,
  AiInvokeResult,
  AiInvokeOptions,
  AiStreamChunk,
  AiChatPayload,
  AiEmbeddingPayload,
  AiTranslatePayload,
  AiUsageInfo
} from '../../types/aisdk'
import { AiProviderType } from '../../types/aisdk'

export class AnthropicProvider extends AiProvider {
  readonly type = AiProviderType.ANTHROPIC

  constructor(config: AiProviderConfig) {
    super(config)
  }

  async chat(payload: AiChatPayload, options: AiInvokeOptions): Promise<AiInvokeResult<string>> {
    this.validateApiKey()
    const startTime = Date.now()
    const traceId = this.generateTraceId()

    try {
      const baseUrl = this.config.baseUrl || 'https://api.anthropic.com/v1'
      const response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey!,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: options.modelPreference?.[0] || this.config.defaultModel || 'claude-3-5-sonnet-20241022',
          messages: payload.messages.filter(m => m.role !== 'system'),
          system: payload.messages.find(m => m.role === 'system')?.content,
          temperature: payload.temperature,
          max_tokens: payload.maxTokens || 1024,
          top_p: payload.topP,
          stop_sequences: payload.stop
        }),
        signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Anthropic API error: ${response.status} ${response.statusText} - ${errorText}`)
      }

      const data = await response.json()
      const latency = Date.now() - startTime

      const usage: AiUsageInfo = {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
      }

      return {
        result: data.content[0]?.text || '',
        usage,
        model: data.model,
        latency,
        traceId,
        provider: this.type
      }
    } catch (error) {
      console.error(`[AnthropicProvider] Chat error:`, error)
      throw error
    }
  }

  async *chatStream(
    payload: AiChatPayload,
    options: AiInvokeOptions
  ): AsyncGenerator<AiStreamChunk> {
    this.validateApiKey()

    const baseUrl = this.config.baseUrl || 'https://api.anthropic.com/v1'
    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: options.modelPreference?.[0] || this.config.defaultModel || 'claude-3-5-sonnet-20241022',
        messages: payload.messages.filter(m => m.role !== 'system'),
        system: payload.messages.find(m => m.role === 'system')?.content,
        temperature: payload.temperature,
        max_tokens: payload.maxTokens || 1024,
        stream: true
      }),
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Response body is not readable')
    }

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
          if (!line.trim() || !line.startsWith('data: ')) continue

          try {
            const data = JSON.parse(line.substring(6))
            
            if (data.type === 'content_block_delta' && data.delta?.text) {
              yield {
                delta: data.delta.text,
                done: false
              }
            }
          } catch (e) {
            console.error('[AnthropicProvider] Parse error:', e)
          }
        }
      }

      yield {
        delta: '',
        done: true
      }
    } finally {
      reader.releaseLock()
    }
  }

  async embedding(payload: AiEmbeddingPayload, options: AiInvokeOptions): Promise<AiInvokeResult<number[]>> {
    throw new Error('[AnthropicProvider] Embedding is not supported by Anthropic')
  }

  async translate(payload: AiTranslatePayload, options: AiInvokeOptions): Promise<AiInvokeResult<string>> {
    const chatPayload: AiChatPayload = {
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
}
