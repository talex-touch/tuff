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

export class LocalProvider extends AiProvider {
  readonly type = AiProviderType.LOCAL

  constructor(config: AiProviderConfig) {
    super(config)
  }

  async chat(payload: AiChatPayload, options: AiInvokeOptions): Promise<AiInvokeResult<string>> {
    const startTime = Date.now()
    const traceId = this.generateTraceId()

    try {
      const baseUrl = this.config.baseUrl || 'http://localhost:11434'
      const model = options.modelPreference?.[0] || this.config.defaultModel || 'llama2'
      
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: payload.messages,
          stream: false,
          options: {
            temperature: payload.temperature,
            num_predict: payload.maxTokens,
            top_p: payload.topP,
            stop: payload.stop
          }
        }),
        signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Local model API error: ${response.status} ${response.statusText} - ${errorText}`)
      }

      const data = await response.json()
      const latency = Date.now() - startTime

      const usage: AiUsageInfo = {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
      }

      return {
        result: data.message?.content || '',
        usage,
        model: data.model || model,
        latency,
        traceId,
        provider: this.type
      }
    } catch (error) {
      console.error(`[LocalProvider] Chat error:`, error)
      throw error
    }
  }

  async *chatStream(
    payload: AiChatPayload,
    options: AiInvokeOptions
  ): AsyncGenerator<AiStreamChunk> {
    const baseUrl = this.config.baseUrl || 'http://localhost:11434'
    const model = options.modelPreference?.[0] || this.config.defaultModel || 'llama2'
    
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: payload.messages,
        stream: true,
        options: {
          temperature: payload.temperature,
          num_predict: payload.maxTokens,
          top_p: payload.topP
        }
      }),
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
    })

    if (!response.ok) {
      throw new Error(`Local model API error: ${response.status} ${response.statusText}`)
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
          if (!line.trim()) continue

          try {
            const data = JSON.parse(line)
            const delta = data.message?.content || ''
            
            if (delta) {
              yield {
                delta,
                done: false
              }
            }

            if (data.done) {
              yield {
                delta: '',
                done: true
              }
              return
            }
          } catch (e) {
            console.error('[LocalProvider] Parse error:', e)
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
    const startTime = Date.now()
    const traceId = this.generateTraceId()

    const baseUrl = this.config.baseUrl || 'http://localhost:11434'
    const model = payload.model || 'nomic-embed-text'
    
    const response = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        prompt: Array.isArray(payload.text) ? payload.text[0] : payload.text
      }),
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
    })

    if (!response.ok) {
      throw new Error(`Local model API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const latency = Date.now() - startTime

    const usage: AiUsageInfo = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    }

    return {
      result: data.embedding || [],
      usage,
      model: data.model || model,
      latency,
      traceId,
      provider: this.type
    }
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

  protected validateApiKey(): void {
    // Local models don't require API keys
  }
}
