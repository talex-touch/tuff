import type {
  AiProviderAdapter,
  AiProviderConfig,
  AiProviderType,
  AiInvokeResult,
  AiInvokeOptions,
  AiStreamChunk,
  AiChatPayload,
  AiEmbeddingPayload,
  AiTranslatePayload,
  AiVisionOcrPayload,
  AiVisionOcrResult
} from '@talex-touch/utils'

export abstract class IntelligenceProvider implements AiProviderAdapter {
  abstract readonly type: AiProviderType
  protected config: AiProviderConfig

  constructor(config: AiProviderConfig) {
    this.config = config
  }

  getConfig(): AiProviderConfig {
    return this.config
  }

  updateConfig(config: Partial<AiProviderConfig>): void {
    this.config = { ...this.config, ...config }
  }

  isEnabled(): boolean {
    return this.config.enabled
  }

  abstract chat(payload: AiChatPayload, options: AiInvokeOptions): Promise<AiInvokeResult<string>>

  abstract chatStream(
    payload: AiChatPayload,
    options: AiInvokeOptions
  ): AsyncGenerator<AiStreamChunk>

  abstract embedding(payload: AiEmbeddingPayload, options: AiInvokeOptions): Promise<AiInvokeResult<number[]>>

  abstract translate(payload: AiTranslatePayload, options: AiInvokeOptions): Promise<AiInvokeResult<string>>

  visionOcr(
    _payload: AiVisionOcrPayload,
    _options: AiInvokeOptions
  ): Promise<AiInvokeResult<AiVisionOcrResult>> {
    return Promise.reject(new Error(`[${this.type}] Vision OCR not implemented`))
  }

  protected generateTraceId(): string {
    return `${this.type}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }

  protected validateApiKey(): void {
    if (!this.config.apiKey) {
      throw new Error(`[${this.type}] API key is required but not configured`)
    }
  }
}
