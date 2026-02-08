import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import type {
  AiInvokeOptions,
  AiInvokeResult,
  AiStreamChunk,
  AiUsageInfo,
  IntelligenceChatPayload,
  IntelligenceEmbeddingPayload,
  IntelligenceTranslatePayload,
  IntelligenceVisionOcrPayload,
  IntelligenceVisionOcrResult
} from '@talex-touch/utils'
import { IntelligenceProviderType } from '@talex-touch/utils'
import {
  getNativeOcrSupport,
  recognizeImageText,
  type NativeOcrBlock
} from '@talex-touch/tuff-native'
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

  async visionOcr(
    payload: IntelligenceVisionOcrPayload,
    _options: AiInvokeOptions
  ): Promise<AiInvokeResult<IntelligenceVisionOcrResult>> {
    const traceId = this.generateTraceId()
    const startedAt = Date.now()

    const support = getNativeOcrSupport()
    if (!support.supported) {
      throw new Error(
        `[LocalProvider] Native OCR unavailable on ${support.platform}: ${support.reason || 'unsupported'}`
      )
    }

    const image = await this.getImageBuffer(payload.source)
    const nativeResult = await recognizeImageText({
      image,
      languageHint: payload.language,
      includeLayout: payload.includeLayout,
      maxBlocks: 120
    })

    const normalizedText = nativeResult.text || ''

    const result: IntelligenceVisionOcrResult = {
      text: normalizedText,
      confidence: nativeResult.confidence,
      language: nativeResult.language || payload.language,
      blocks: nativeResult.blocks?.map((block) => this.toOcrBlock(block)),
      keywords:
        payload.includeKeywords === false ? undefined : this.generateKeywords(normalizedText),
      engine: nativeResult.engine,
      durationMs: nativeResult.durationMs,
      raw: nativeResult
    }

    return {
      result,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      model: 'system-ocr',
      latency: Date.now() - startedAt,
      traceId,
      provider: this.type
    }
  }

  private toOcrBlock(
    block: NativeOcrBlock
  ): NonNullable<IntelligenceVisionOcrResult['blocks']>[number] {
    return {
      text: block.text,
      confidence: block.confidence,
      boundingBox: block.boundingBox,
      type: 'line'
    }
  }

  private async getImageBuffer(source: IntelligenceVisionOcrPayload['source']): Promise<Buffer> {
    if (source.type === 'data-url' && source.dataUrl) {
      return this.decodeDataUrl(source.dataUrl)
    }

    if (source.type === 'base64' && source.base64) {
      if (source.base64.startsWith('data:')) {
        return this.decodeDataUrl(source.base64)
      }
      return Buffer.from(source.base64, 'base64')
    }

    if (source.type === 'file' && source.filePath) {
      return await readFile(source.filePath)
    }

    throw new Error('[LocalProvider] Invalid vision image source')
  }

  private decodeDataUrl(dataUrl: string): Buffer {
    const separatorIndex = dataUrl.indexOf(',')
    if (separatorIndex === -1) {
      throw new Error('[LocalProvider] Invalid data URL image source')
    }

    const meta = dataUrl.slice(0, separatorIndex)
    const payload = dataUrl.slice(separatorIndex + 1)

    if (meta.includes(';base64')) {
      return Buffer.from(payload, 'base64')
    }

    return Buffer.from(decodeURIComponent(payload), 'utf8')
  }

  private generateKeywords(text: string): string[] {
    return text
      .split(/\s+/)
      .map((word) => word.trim().toLowerCase())
      .filter((word) => word.length > 2)
      .filter((word, index, all) => all.indexOf(word) === index)
      .slice(0, 10)
  }
}
