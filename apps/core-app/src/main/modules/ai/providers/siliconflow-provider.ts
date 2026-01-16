import type {
  IntelligenceChatPayload,
  IntelligenceEmbeddingPayload,
  AiInvokeOptions,
  AiInvokeResult,
  AiStreamChunk,
  IntelligenceTranslatePayload,
  AiUsageInfo,
  IntelligenceVisionOcrPayload,
  IntelligenceVisionOcrResult,
} from '@talex-touch/utils'
import { readFile } from 'node:fs/promises'

import path from 'node:path'
import { IntelligenceProviderType } from '@talex-touch/utils'
import { IntelligenceProvider } from '../runtime/base-provider'

const DEFAULT_BASE_URL = 'https://api.siliconflow.cn/v1'
const DEFAULT_VISION_MODEL = 'deepseek-ai/DeepSeek-OCR'

export class SiliconflowProvider extends IntelligenceProvider {
  readonly type = IntelligenceProviderType.SILICONFLOW

  private get baseUrl(): string {
    return this.config.baseUrl || DEFAULT_BASE_URL
  }

  private get headers(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    }
  }

  async chat(payload: IntelligenceChatPayload, options: AiInvokeOptions): Promise<AiInvokeResult<string>> {
    this.validateApiKey()
    const startTime = Date.now()
    const traceId = this.generateTraceId()

    const model = options.modelPreference?.[0] || this.config.defaultModel || 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B'
    this.validateModel(model, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/chat/completions',
    })

    const body = {
      model,
      messages: payload.messages,
      temperature: payload.temperature,
      max_tokens: payload.maxTokens,
      top_p: payload.topP,
      presence_penalty: payload.presencePenalty,
      frequency_penalty: payload.frequencyPenalty,
      stop: payload.stop,
    }

    const data = await this.post<{ choices: any[], usage?: any, model?: string }>('/chat/completions', body, options.timeout)
    const latency = Date.now() - startTime

    const usage: AiUsageInfo = {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    }

    return {
      result: this.extractMessageContent(data.choices[0]?.message?.content),
      usage,
      model: data.model || body.model,
      latency,
      traceId,
      provider: this.type,
    }
  }

  async* chatStream(
    payload: IntelligenceChatPayload,
    options: AiInvokeOptions,
  ): AsyncGenerator<AiStreamChunk> {
    this.validateApiKey()

    const model = options.modelPreference?.[0] || this.config.defaultModel || 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B'
    this.validateModel(model, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/chat/completions (stream)',
    })

    const body = {
      model,
      messages: payload.messages,
      temperature: payload.temperature,
      max_tokens: payload.maxTokens,
      stream: true,
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined,
    })

    if (!response.ok || !response.body) {
      throw new Error(`SiliconFlow API error: ${response.status} ${response.statusText}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done)
          break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim() || line.trim() === 'data: [DONE]')
            continue
          if (!line.startsWith('data: '))
            continue

          try {
            const data = JSON.parse(line.substring(6))
            const delta = this.extractMessageContent(data.choices[0]?.delta?.content)
            if (delta) {
              yield { delta, done: false }
            }
          }
          catch (error) {
            console.error('[SiliconflowProvider] Stream parse error:', error)
          }
        }
      }

      yield { delta: '', done: true }
    }
    finally {
      reader.releaseLock()
    }
  }

  async embedding(payload: IntelligenceEmbeddingPayload, options: AiInvokeOptions): Promise<AiInvokeResult<number[]>> {
    this.validateApiKey()
    const traceId = this.generateTraceId()
    const startTime = Date.now()

    const model = payload.model || this.config.defaultModel || 'netease-youdao/bce-embedding-base_v1'
    this.validateModel(model, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/embeddings',
    })

    const body = {
      input: payload.text,
      model,
    }

    const data = await this.post<{ data: Array<{ embedding: number[] }>, usage?: any, model?: string }>(
      '/embeddings',
      body,
      options.timeout,
    )

    const latency = Date.now() - startTime
    const usage: AiUsageInfo = {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: 0,
      totalTokens: data.usage?.total_tokens ?? data.usage?.prompt_tokens ?? 0,
    }

    return {
      result: data.data?.[0]?.embedding ?? [],
      usage,
      model: data.model || body.model,
      latency,
      traceId,
      provider: this.type,
    }
  }

  async translate(payload: IntelligenceTranslatePayload, options: AiInvokeOptions): Promise<AiInvokeResult<string>> {
    const chatPayload: IntelligenceChatPayload = {
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Always return only the translated text in ${payload.targetLang}.`,
        },
        {
          role: 'user',
          content: payload.text,
        },
      ],
    }

    return this.chat(chatPayload, options)
  }

  async visionOcr(
    payload: IntelligenceVisionOcrPayload,
    options: AiInvokeOptions,
  ): Promise<AiInvokeResult<IntelligenceVisionOcrResult>> {
    this.validateApiKey()
    const traceId = this.generateTraceId()
    const startTime = Date.now()

    const imageDataUrl = await this.getImageData(payload.source)
    const prompt = payload.prompt || 'Extract all text from this image and return as structured JSON.'
    const modelFromBinding = options.modelPreference?.[0]

    const model = modelFromBinding || this.config.defaultModel || DEFAULT_VISION_MODEL
    this.validateModel(model, {
      capabilityId: options.metadata?.capabilityId as string | undefined,
      endpoint: '/chat/completions (vision)',
    })

    const body = {
      model,
      messages: [
        {
          role: 'system',
          content: prompt,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请识别给定图片的所有文本，并严格按照系统提示返回 JSON。',
            },
            {
              type: 'image_url',
              image_url: { url: imageDataUrl },
            },
          ],
        },
      ],
    }

    const data = await this.post<{ choices: any[], usage?: any, model?: string }>(
      '/chat/completions',
      body,
      options.timeout,
    )

    const latency = Date.now() - startTime
    const usage: AiUsageInfo = {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    }

    const rawContent = this.extractMessageContent(data.choices[0]?.message?.content)
    const parsed = this.safeParseJson(rawContent)

    const ocrResult: IntelligenceVisionOcrResult = parsed
      ? {
          text: parsed.text ?? '',
          confidence: parsed.confidence,
          language: parsed.language,
          keywords: parsed.keywords ?? [],
          blocks: parsed.blocks,
          raw: parsed,
        }
      : {
          text: rawContent,
          keywords: this.generateKeywords(rawContent),
          raw: rawContent,
        }

    return {
      result: ocrResult,
      usage,
      model: data.model || body.model,
      latency,
      traceId,
      provider: this.type,
    }
  }

  private async post<T>(endpoint: string, body: any, timeout?: number): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText)
      throw new Error(`SiliconFlow API error: ${response.status} ${errorText}`)
    }

    return this.parseJsonResponse<T>(response, { endpoint })
  }

  private async getImageData(source: IntelligenceVisionOcrPayload['source']): Promise<string> {
    if (source.type === 'data-url' && source.dataUrl) {
      return source.dataUrl
    }
    if (source.type === 'base64' && source.base64) {
      return `data:image/png;base64,${source.base64}`
    }
    if (source.type === 'file' && source.filePath) {
      const buffer = await readFile(source.filePath)
      const mime = this.detectMime(source.filePath)
      return `data:${mime};base64,${buffer.toString('base64')}`
    }
    throw new Error('[SiliconflowProvider] Unsupported image source')
  }

  private detectMime(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg'
      case '.webp':
        return 'image/webp'
      case '.gif':
        return 'image/gif'
      case '.bmp':
        return 'image/bmp'
      default:
        return 'image/png'
    }
  }

  private extractMessageContent(content: unknown): string {
    if (!content)
      return ''
    if (typeof content === 'string')
      return content
    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === 'string')
            return item
          if (typeof item === 'object' && item) {
            if ('text' in item && typeof item.text === 'string')
              return item.text
            if ('content' in item && typeof item.content === 'string')
              return item.content
          }
          return ''
        })
        .filter(Boolean)
        .join('\n')
    }
    if (typeof content === 'object' && 'text' in (content as any)) {
      return String((content as any).text)
    }
    return ''
  }

  protected override safeParseJson(content: string): any | null {
    if (!content)
      return null
    const trimmed = content.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('['))
      return null
    try {
      return JSON.parse(trimmed)
    }
    catch {
      return null
    }
  }

  private generateKeywords(text: string): string[] {
    if (!text)
      return []
    const tokens = text
      .split(/[\s,.;，。；、]+/)
      .map(token => token.trim())
      .filter(token => token.length > 2)
      .slice(0, 5)
    return Array.from(new Set(tokens))
  }
}
