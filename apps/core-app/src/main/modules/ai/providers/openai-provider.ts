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

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

export class OpenAIProvider extends IntelligenceProvider {
  readonly type = IntelligenceProviderType.OPENAI

  private get baseUrl(): string {
    return this.config.baseUrl || DEFAULT_BASE_URL
  }

  private get headers(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`
    }
  }

  async chat(
    payload: IntelligenceChatPayload,
    options: AiInvokeOptions
  ): Promise<AiInvokeResult<string>> {
    this.validateApiKey()
    const startTime = Date.now()
    const traceId = this.generateTraceId()

    const model = options.modelPreference?.[0] || this.config.defaultModel || 'gpt-4o-mini'
    this.validateModel(model, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/chat/completions'
    })

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        model,
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
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
    }

    const data = await this.parseJsonResponse<{
      choices: any[]
      usage?: any
      model?: string
    }>(response, { endpoint: '/chat/completions' })
    const latency = Date.now() - startTime

    const usage: AiUsageInfo = {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0
    }

    return {
      result: data.choices[0]?.message?.content || '',
      usage,
      model: data.model || '',
      latency,
      traceId,
      provider: this.type
    }
  }

  async *chatStream(
    payload: IntelligenceChatPayload,
    options: AiInvokeOptions
  ): AsyncGenerator<AiStreamChunk> {
    this.validateApiKey()

    const model = options.modelPreference?.[0] || this.config.defaultModel || 'gpt-4o-mini'
    this.validateModel(model, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/chat/completions'
    })

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        model,
        messages: payload.messages,
        temperature: payload.temperature,
        max_tokens: payload.maxTokens,
        stream: true
      }),
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
    })

    if (!response.ok || !response.body) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
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
            const data = JSON.parse(line.substring(6))
            const delta = data.choices[0]?.delta?.content || ''
            if (delta) {
              yield { delta, done: false }
            }
          } catch (error) {
            console.error('[OpenAIProvider] Stream parse error:', error)
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

  async embedding(
    payload: IntelligenceEmbeddingPayload,
    options: AiInvokeOptions
  ): Promise<AiInvokeResult<number[]>> {
    this.validateApiKey()
    const startTime = Date.now()
    const traceId = this.generateTraceId()

    const model = payload.model || this.config.defaultModel || 'text-embedding-3-small'
    this.validateModel(model, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/embeddings'
    })

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        model,
        input: payload.text
      }),
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
    }

    const data = await this.parseJsonResponse<{
      data: any[]
      usage?: any
      model?: string
    }>(response, { endpoint: '/embeddings' })
    const latency = Date.now() - startTime

    const usage: AiUsageInfo = {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: 0,
      totalTokens: data.usage?.total_tokens || 0
    }

    return {
      result: data.data[0]?.embedding || [],
      usage,
      model: data.model || '',
      latency,
      traceId,
      provider: this.type
    }
  }

  async translate(
    payload: IntelligenceTranslatePayload,
    options: AiInvokeOptions
  ): Promise<AiInvokeResult<string>> {
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
    payload: import('@talex-touch/utils').IntelligenceVisionOcrPayload,
    options: AiInvokeOptions
  ): Promise<AiInvokeResult<import('@talex-touch/utils').IntelligenceVisionOcrResult>> {
    this.validateApiKey()
    const startTime = Date.now()
    const traceId = this.generateTraceId()

    const imageDataUrl = await this.getImageData(payload.source)
    const prompt =
      payload.prompt ||
      'Extract all text from this image and return the result as JSON with fields: text (extracted text), keywords (array of key terms).'

    const model = options.modelPreference?.[0] || this.config.defaultModel || 'gpt-4o'
    this.validateModel(model, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/chat/completions (vision)'
    })

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: prompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: imageDataUrl
                }
              }
            ]
          }
        ],
        max_tokens: 1000
      }),
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
    }

    const data = await this.parseJsonResponse<{
      choices: any[]
      usage?: any
      model?: string
    }>(response, { endpoint: '/chat/completions (vision)' })
    const latency = Date.now() - startTime

    const usage: AiUsageInfo = {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0
    }

    const rawContent = data.choices[0]?.message?.content || ''
    const parsed = this.safeParseJson(rawContent)

    const ocrResult: import('@talex-touch/utils').IntelligenceVisionOcrResult = parsed
      ? {
          text: parsed.text ?? rawContent,
          confidence: parsed.confidence,
          language: parsed.language,
          keywords: parsed.keywords ?? [],
          blocks: parsed.blocks,
          raw: parsed
        }
      : {
          text: rawContent,
          keywords: this.generateKeywords(rawContent),
          raw: rawContent
        }

    return {
      result: ocrResult,
      usage,
      model: data.model || '',
      latency,
      traceId,
      provider: this.type
    }
  }

  private async getImageData(
    source: import('@talex-touch/utils').AiVisionImageSource
  ): Promise<string> {
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
      // For file paths, we'd need to read the file and convert to base64
      // This is typically handled at a higher level before calling the provider
      throw new Error(
        '[OpenAIProvider] File path images must be converted to base64 before calling visionOcr'
      )
    }
    throw new Error('[OpenAIProvider] Invalid vision image source')
  }

  protected override safeParseJson(text: string): any {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  private generateKeywords(text: string): string[] {
    return text
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .slice(0, 10)
  }
}
