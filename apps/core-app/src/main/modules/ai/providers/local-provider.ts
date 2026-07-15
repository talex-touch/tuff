import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { StringDecoder } from 'node:string_decoder'
import type {
  IntelligenceChatPayload,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceStreamChunk,
  IntelligenceVisionOcrPayload,
  IntelligenceVisionOcrResult
} from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import {
  getNativeOcrSupport,
  recognizeImageText,
  type NativeOcrBlock
} from '@talex-touch/tuff-native'
import { NetworkHttpStatusError } from '@talex-touch/utils/network'
import { enterPerfContext } from '../../../utils/perf-context'
import { getNetworkService } from '../../network'
import { OpenAiCompatibleLangChainProvider } from './langchain-openai-compatible-provider'

interface OllamaChatResponse {
  model?: string
  message?: {
    content?: string
  }
  prompt_eval_count?: number
  eval_count?: number
}

interface OllamaChatStreamResponse extends OllamaChatResponse {
  done?: boolean
}

const LOCAL_DIRECT_PROXY = { mode: 'direct' as const }
function isHttpNotFound(error: unknown): error is NetworkHttpStatusError {
  return error instanceof NetworkHttpStatusError && error.status === 404
}

function toStreamBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  return Buffer.from(String(value))
}

export class LocalProvider extends OpenAiCompatibleLangChainProvider {
  readonly type = IntelligenceProviderType.LOCAL

  protected readonly defaultBaseUrl = 'http://localhost:11434'
  protected readonly defaultChatModel = 'llama3.1'
  protected readonly defaultEmbeddingModel = 'nomic-embed-text'
  protected readonly requireApiKey = false

  private resolveOllamaBaseUrl(): string {
    const normalized = (this.config.baseUrl || this.defaultBaseUrl).replace(/\/+$/, '')
    const lower = normalized.toLowerCase()
    for (const suffix of ['/v1', '/api/v1', '/openai/v1', '/api/openai/v1']) {
      if (lower.endsWith(suffix)) {
        return normalized.slice(0, -suffix.length).replace(/\/+$/, '')
      }
    }
    return normalized
  }

  private resolveLocalChatModel(options: IntelligenceInvokeOptions): string {
    return options.modelPreference?.[0] || this.config.defaultModel || this.defaultChatModel
  }

  private buildOllamaChatBody(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions,
    stream: boolean
  ): Record<string, unknown> {
    return {
      model: this.resolveLocalChatModel(options),
      messages: payload.messages,
      stream,
      options: {
        ...(typeof payload.temperature === 'number' ? { temperature: payload.temperature } : {}),
        ...(typeof payload.maxTokens === 'number' ? { num_predict: payload.maxTokens } : {})
      }
    }
  }

  private buildOllamaChatRequest(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions,
    stream: boolean
  ) {
    return {
      method: 'POST' as const,
      url: `${this.resolveOllamaBaseUrl()}/api/chat`,
      headers: {
        'Content-Type': 'application/json'
      },
      body: this.buildOllamaChatBody(payload, options, stream),
      proxyOverride: LOCAL_DIRECT_PROXY,
      timeoutMs: options.timeout ?? this.config.timeout ?? 60_000,
      retryPolicy: {
        maxRetries: 0,
        retryOnNetworkError: false,
        retryOnTimeout: false,
        retryableStatusCodes: []
      },
      cooldownPolicy: {
        key: `${this.config.id}:ollama.chat`,
        failureThreshold: 2,
        cooldownMs: 15_000,
        autoResetOnSuccess: true
      },
      skipCooldownCheck: options.testRun === true
    }
  }

  async chat(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<string>> {
    const startedAt = Date.now()
    const traceId = this.generateTraceId()
    const model = this.resolveLocalChatModel(options)

    try {
      const response = await getNetworkService().request<OllamaChatResponse>({
        ...this.buildOllamaChatRequest(payload, options, false),
        responseType: 'json'
      })

      const content = response.data.message?.content ?? ''
      return {
        result: content,
        usage: {
          promptTokens: response.data.prompt_eval_count ?? 0,
          completionTokens: response.data.eval_count ?? 0,
          totalTokens: (response.data.prompt_eval_count ?? 0) + (response.data.eval_count ?? 0)
        },
        model: response.data.model || model,
        latency: Date.now() - startedAt,
        traceId,
        provider: this.type
      }
    } catch (error) {
      if (!isHttpNotFound(error)) {
        throw error
      }
      return await super.chat(payload, options)
    }
  }

  async *chatStream(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions
  ): AsyncGenerator<IntelligenceStreamChunk> {
    let emittedDelta = false
    try {
      const response = await getNetworkService().requestStream(
        this.buildOllamaChatRequest(payload, options, true)
      )
      const decoder = new StringDecoder('utf8')
      let buffer = ''
      for await (const chunk of response.stream) {
        buffer += decoder.write(toStreamBuffer(chunk))
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          const parsed = JSON.parse(trimmed) as OllamaChatStreamResponse
          const delta = parsed.message?.content ?? ''
          if (delta) {
            emittedDelta = true
            yield { delta, done: false }
          }
          if (parsed.done) {
            yield {
              delta: '',
              done: true,
              usage: {
                promptTokens: parsed.prompt_eval_count ?? 0,
                completionTokens: parsed.eval_count ?? 0,
                totalTokens: (parsed.prompt_eval_count ?? 0) + (parsed.eval_count ?? 0)
              }
            }
            return
          }
        }
      }

      buffer += decoder.end()

      const trimmed = buffer.trim()
      if (trimmed) {
        const parsed = JSON.parse(trimmed) as OllamaChatStreamResponse
        const delta = parsed.message?.content ?? ''
        if (delta) {
          emittedDelta = true
          yield { delta, done: false }
        }
        if (parsed.done) {
          yield {
            delta: '',
            done: true,
            usage: {
              promptTokens: parsed.prompt_eval_count ?? 0,
              completionTokens: parsed.eval_count ?? 0,
              totalTokens: (parsed.prompt_eval_count ?? 0) + (parsed.eval_count ?? 0)
            }
          }
          return
        }
      }
      yield { delta: '', done: true }
    } catch (error) {
      if (emittedDelta || !isHttpNotFound(error)) {
        throw error
      }
      yield* super.chatStream(payload, options)
    }
  }

  async visionOcr(
    payload: IntelligenceVisionOcrPayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceVisionOcrResult>> {
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
      const disposeDecode = enterPerfContext('VisionOCR.decodeBase64', {
        length: source.base64.length
      })
      try {
        return Buffer.from(source.base64, 'base64')
      } finally {
        disposeDecode()
      }
    }

    if (source.type === 'file' && source.filePath) {
      return await readFile(source.filePath)
    }

    throw new Error('[LocalProvider] Invalid vision image source')
  }

  private decodeDataUrl(dataUrl: string): Buffer {
    const disposeDecode = enterPerfContext('VisionOCR.decodeDataUrl', {
      length: dataUrl.length
    })
    try {
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
    } finally {
      disposeDecode()
    }
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
