export enum AiProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
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

export interface AiProviderConfig {
  id: string
  type: AiProviderType
  name: string
  enabled: boolean
  apiKey?: string
  baseUrl?: string
  rateLimit?: AiProviderRateLimit
  models?: string[]
  priority?: number
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
