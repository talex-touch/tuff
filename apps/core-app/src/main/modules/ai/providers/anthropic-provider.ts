import type {
  AiInvokeOptions,
  AiInvokeResult,
  AiStreamChunk,
  AiUsageInfo,
  IntelligenceChatPayload
} from '@talex-touch/utils'
import { IntelligenceProviderType } from '@talex-touch/utils'
import { IntelligenceProvider } from '../runtime/base-provider'

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1'

type AnthropicContentItem = {
  text?: string
}

type AnthropicUsage = {
  input_tokens?: number
  output_tokens?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export class AnthropicProvider extends IntelligenceProvider {
  readonly type = IntelligenceProviderType.ANTHROPIC

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

  async chat(
    payload: IntelligenceChatPayload,
    options: AiInvokeOptions
  ): Promise<AiInvokeResult<string>> {
    this.validateApiKey()
    const startTime = Date.now()
    const traceId = this.generateTraceId()

    const model =
      options.modelPreference?.[0] || this.config.defaultModel || 'claude-3-5-sonnet-20241022'
    this.validateModel(model, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/messages'
    })

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        model,
        system: payload.messages.find((msg) => msg.role === 'system')?.content,
        messages: payload.messages.filter((msg) => msg.role !== 'system'),
        max_tokens: payload.maxTokens ?? 1024,
        temperature: payload.temperature ?? 0.7
      }),
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`)
    }

    const data = await this.parseJsonResponse<{
      content?: AnthropicContentItem[]
      usage?: AnthropicUsage
      model?: string
    }>(response, { endpoint: '/messages' })
    const latency = Date.now() - startTime

    const usage: AiUsageInfo = {
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
      totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)
    }

    return {
      result: data.content?.[0]?.text || '',
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

    const model =
      options.modelPreference?.[0] || this.config.defaultModel || 'claude-3-haiku-20240307'
    this.validateModel(model, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/messages (stream)'
    })

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: { ...this.headers, accept: 'text/event-stream' },
      body: JSON.stringify({
        model,
        system: payload.messages.find((msg) => msg.role === 'system')?.content,
        messages: payload.messages.filter((msg) => msg.role !== 'system'),
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

  async translate(
    payload: import('@talex-touch/utils').IntelligenceTranslatePayload,
    options: AiInvokeOptions
  ): Promise<AiInvokeResult<string>> {
    const chatPayload: import('@talex-touch/utils').IntelligenceChatPayload = {
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the following text to ${payload.targetLang}. Return only the translated text, without any explanations.`
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
  ): Promise<AiInvokeResult<import('@talex-touch/utils').AiVisionOcrResult>> {
    this.validateApiKey()
    const startTime = Date.now()
    const traceId = this.generateTraceId()

    const imageDataUrl = await this.getImageData(payload.source)
    const prompt =
      payload.prompt ||
      'Extract all text from this image and return the result as JSON with fields: text (extracted text), keywords (array of key terms).'

    const model =
      options.modelPreference?.[0] || this.config.defaultModel || 'claude-3-5-sonnet-20241022'
    this.validateModel(model, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/messages (vision)'
    })

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: imageDataUrl.startsWith('data:') ? 'base64' : 'url',
                  media_type: 'image/png',
                  data: imageDataUrl.startsWith('data:') ? imageDataUrl.split(',')[1] : undefined,
                  url: !imageDataUrl.startsWith('data:') ? imageDataUrl : undefined
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      }),
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`)
    }

    const data = await this.parseJsonResponse<{
      content?: AnthropicContentItem[]
      usage?: AnthropicUsage
      model?: string
    }>(response, { endpoint: '/messages (vision)' })
    const latency = Date.now() - startTime

    const usage: AiUsageInfo = {
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
      totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)
    }

    const rawContent = data.content?.[0]?.text || ''
    const parsed = this.safeParseJson(rawContent)
    const parsedRecord = isRecord(parsed) ? parsed : null
    const text = typeof parsedRecord?.text === 'string' ? parsedRecord.text : rawContent
    const confidence =
      typeof parsedRecord?.confidence === 'number' ? parsedRecord.confidence : undefined
    const language = typeof parsedRecord?.language === 'string' ? parsedRecord.language : undefined
    const keywords = Array.isArray(parsedRecord?.keywords)
      ? parsedRecord.keywords.filter((item): item is string => typeof item === 'string')
      : []
    const blocks = Array.isArray(parsedRecord?.blocks) ? parsedRecord.blocks : undefined

    const ocrResult: import('@talex-touch/utils').AiVisionOcrResult = parsedRecord
      ? {
          text,
          confidence,
          language,
          keywords,
          blocks,
          raw: parsedRecord
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
      throw new Error(
        '[AnthropicProvider] File path images must be converted to base64 before calling visionOcr'
      )
    }
    throw new Error('[AnthropicProvider] Invalid vision image source')
  }

  protected override safeParseJson(text: string): unknown {
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
