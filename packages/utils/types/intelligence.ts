export enum AiProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
  SILICONFLOW = 'siliconflow',
  LOCAL = 'local',
  CUSTOM = 'custom'
}

export enum AiCapabilityType {
  CHAT = 'chat',
  COMPLETION = 'completion',
  EMBEDDING = 'embedding',
  SUMMARIZE = 'summarize',
  TRANSLATE = 'translate',
  TTS = 'tts',
  STT = 'stt',
  VISION = 'vision'
}

export interface AiProviderRateLimit {
  requestsPerMinute?: number
  requestsPerDay?: number
  tokensPerMinute?: number
  tokensPerDay?: number
}

export interface AiVisionImageSource {
  type: 'data-url' | 'file' | 'base64'
  dataUrl?: string
  filePath?: string
  base64?: string
}

export interface AiVisionOcrBlock {
  id?: string
  text: string
  language?: string
  confidence?: number
  boundingBox?: [number, number, number, number]
  polygon?: Array<[number, number]>
  type?: 'word' | 'line' | 'paragraph' | 'region'
  children?: AiVisionOcrBlock[]
}

export interface AiVisionOcrResult {
  text: string
  confidence?: number
  language?: string
  keywords?: string[]
  suggestions?: string[]
  blocks?: AiVisionOcrBlock[]
  raw?: any
}

export interface AiVisionOcrPayload {
  source: AiVisionImageSource
  language?: string
  prompt?: string
  metadata?: Record<string, any>
  includeLayout?: boolean
  includeKeywords?: boolean
}

export interface AiProviderConfig {
  id: string
  type: AiProviderType
  name: string
  enabled: boolean
  apiKey?: string
  baseUrl?: string
  rateLimit?: AiProviderRateLimit
  models?: string[]
  defaultModel?: string
  instructions?: string
  timeout?: number
  priority?: number
  capabilities?: AiCapabilityType[]
  metadata?: Record<string, any>
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  name?: string
}

export interface AiInvokeOptions {
  strategy?: string
  modelPreference?: string[]
  costCeiling?: number
  latencyTarget?: number
  timeout?: number
  stream?: boolean
  preferredProviderId?: string
  allowedProviderIds?: string[]
  metadata?: Record<string, any>
  testRun?: boolean
}

export interface AiInvokeContext {
  source?: string
  locale?: string
  userId?: string
  sessionId?: string
}

export interface AiUsageInfo {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost?: number
}

export interface AiInvokeResult<T = any> {
  result: T
  usage: AiUsageInfo
  model: string
  latency: number
  traceId: string
  provider: string
}

export interface AiStreamChunk {
  delta: string
  done: boolean
  usage?: AiUsageInfo
}

export interface AiCapabilityDescriptor {
  id: string
  type: AiCapabilityType
  name: string
  description: string
  inputSchema?: any
  outputSchema?: any
  defaultStrategy?: string
  supportedProviders: AiProviderType[]
  metadata?: Record<string, any>
}

export interface AiChatPayload {
  messages: AiMessage[]
  context?: AiInvokeContext
  temperature?: number
  maxTokens?: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  stop?: string[]
}

export interface AiEmbeddingPayload {
  text: string | string[]
  model?: string
}

export interface AiTranslatePayload {
  text: string
  sourceLang?: string
  targetLang: string
}

export interface AiSummarizePayload {
  text: string
  maxLength?: number
  style?: 'concise' | 'detailed' | 'bullet-points'
}

export interface AiSDKConfig {
  providers: AiProviderConfig[]
  defaultStrategy: string
  enableAudit: boolean
  enableCache: boolean
  cacheExpiration?: number
  capabilities?: Record<string, AiCapabilityRoutingConfig>
}

export interface AiStrategyConfig {
  id: string
  name: string
  type: 'rule-based' | 'adaptive' | 'custom'
  rules?: any
  priority?: number
}

export interface AiAuditLog {
  traceId: string
  timestamp: number
  capabilityId: string
  provider: string
  model: string
  promptHash?: string
  caller?: string
  usage: AiUsageInfo
  latency: number
  success: boolean
  error?: string
}

export interface AiCapabilityProviderBinding {
  providerId: string
  models?: string[]
  priority?: number
  enabled?: boolean
  metadata?: Record<string, any>
}

export interface AiCapabilityRoutingConfig {
  label?: string
  description?: string
  providers: AiCapabilityProviderBinding[]
  promptTemplate?: string
  testResourceDir?: string
  metadata?: Record<string, any>
}

export interface AiSDKPersistedConfig {
  providers: AiProviderConfig[]
  globalConfig: {
    defaultStrategy: string
    enableAudit: boolean
    enableCache: boolean
    cacheExpiration?: number
  }
  capabilities?: Record<string, AiCapabilityRoutingConfig>
  version: number
}

export interface AiProviderAdapter {
  readonly type: AiProviderType
  getConfig(): AiProviderConfig
  updateConfig(config: Partial<AiProviderConfig>): void
  isEnabled(): boolean
  chat(payload: AiChatPayload, options: AiInvokeOptions): Promise<AiInvokeResult<string>>
  chatStream(
    payload: AiChatPayload,
    options: AiInvokeOptions
  ): AsyncGenerator<AiStreamChunk>
  embedding(payload: AiEmbeddingPayload, options: AiInvokeOptions): Promise<AiInvokeResult<number[]>>
  translate(payload: AiTranslatePayload, options: AiInvokeOptions): Promise<AiInvokeResult<string>>
  visionOcr(
    payload: AiVisionOcrPayload,
    options: AiInvokeOptions
  ): Promise<AiInvokeResult<AiVisionOcrResult>>
}

export interface ProviderManagerAdapter {
  clear(): void
  registerFromConfig(config: AiProviderConfig): AiProviderAdapter
  getEnabled(): AiProviderAdapter[]
  get(providerId: string): AiProviderAdapter | undefined
  createProviderInstance(config: AiProviderConfig): AiProviderAdapter
}
