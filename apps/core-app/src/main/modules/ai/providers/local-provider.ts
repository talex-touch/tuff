import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import type {
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceVisionOcrPayload,
  IntelligenceVisionOcrResult
} from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import {
  getNativeOcrSupport,
  recognizeImageText,
  type NativeOcrBlock
} from '@talex-touch/tuff-native'
import { enterPerfContext } from '../../../utils/perf-context'
import { OpenAiCompatibleLangChainProvider } from './langchain-openai-compatible-provider'

export class LocalProvider extends OpenAiCompatibleLangChainProvider {
  readonly type = IntelligenceProviderType.LOCAL

  protected readonly defaultBaseUrl = 'http://localhost:11434'
  protected readonly defaultChatModel = 'llama3.1'
  protected readonly defaultEmbeddingModel = 'nomic-embed-text'
  protected readonly requireApiKey = false

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
