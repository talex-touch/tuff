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

export class DeepSeekProvider extends AiProvider {
  readonly type = AiProviderType.DEEPSEEK

  constructor(config: AiProviderConfig) {
    super(config)
  }

  async chat(payload: AiChatPayload, options: AiInvokeOptions): Promise<AiInvokeResult<string>> {
    this.validateApiKey()
    const startTime = Date.now()
    const traceId = this.generateTraceId()

    try {
      const baseUrl = this.config.baseUrl || 'https://api.deepseek.com/v1'
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: options.modelPreference?.[0] || this.config.defaultModel || 'deepseek-chat',
          messages: payload.messages,
          temperature: payload.temperature,
          max_tokens: payload.maxTokens,
          top_p: payload.topP,
          frequency_penalty: payload.frequencyPenalty,
          presence_penalty: payload.presencePenalty,
          stop: payload.stop
        }),
        signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`DeepSeek API error: ${response.status} ${response.statusText} - ${errorText}`)
      }

      const data = await response.json()
      const latency = Date.now() - startTime

      const usage: AiUsageInfo = {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      }

      return {
        result: data.choices[0]?.message?.content || '',
        usage,
        model: data.model,
        latency,
        traceId,
        provider: this.type
      }
    } catch (error) {
      console.error(`[DeepSeekProvider] Chat error:`, error)
      throw error
    }
  }

  async *chatStream(
    payload: AiChatPayload,
    options: AiInvokeOptions
  ): AsyncGenerator<AiStreamChunk> {
    this.validateApiKey()

    const baseUrl = this.config.baseUrl || 'https://api.deepseek.com/v1'
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: options.modelPreference?.[0] || this.config.defaultModel || 'deepseek-chat',
        messages: payload.messages,
        temperature: payload.temperature,
        max_tokens: payload.maxTokens,
        stream: true
      }),
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
    })

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`)
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
          if (!line.trim() || line.trim() === 'data: [DONE]') continue
          if (!line.startsWith('data: ')) continue

          try {
            const data = JSON.parse(line.substring(6))
            const delta = data.choices[0]?.delta?.content || ''
            
            if (delta) {
              yield {
                delta,
                done: false
              }
            }
          } catch (e) {
            console.error('[DeepSeekProvider] Parse error:', e)
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
    throw new Error('[DeepSeekProvider] Embedding is not supported by DeepSeek')
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
