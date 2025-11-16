/**
 * AISDK Type Definitions
 * Core data structures for AI SDK provider management
 */

/**
 * Supported AI provider types
 */
export enum AiProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
  SILICONFLOW = 'siliconflow',
  LOCAL = 'local',
  CUSTOM = 'custom'
}

/**
 * Rate limiting configuration for AI providers
 */
export interface AiProviderRateLimit {
  /** Maximum requests allowed per minute */
  requestsPerMinute?: number
  /** Maximum requests allowed per day */
  requestsPerDay?: number
  /** Maximum tokens allowed per minute */
  tokensPerMinute?: number
  /** Maximum tokens allowed per day */
  tokensPerDay?: number
}

/**
 * Configuration for an individual AI provider
 */
export interface AiProviderConfig {
  /** Unique identifier for the provider */
  id: string
  /** Type of AI provider */
  type: AiProviderType
  /** Display name of the provider */
  name: string
  /** Whether the provider is currently enabled */
  enabled: boolean
  /** API key for authentication (optional for local models) */
  apiKey?: string
  /** Base URL for API requests (optional, uses default if not specified) */
  baseUrl?: string
  /** List of available models for this provider */
  models?: string[]
  /** Default model to use when not specified */
  defaultModel?: string
  /** System instructions/prompt to prepend to requests */
  instructions?: string
  /** Request timeout in milliseconds */
  timeout?: number
  /** Rate limiting configuration */
  rateLimit?: AiProviderRateLimit
  /** Priority level (1 = highest, 3 = lowest) */
  priority?: number
  /** Declared capabilities for quick filtering */
  capabilities?: string[]
  /** Extra metadata for provider-specific options */
  metadata?: Record<string, any>
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

/**
 * Global AISDK configuration settings
 */
export interface AISDKGlobalConfig {
  /** Default strategy for provider selection */
  defaultStrategy: string
  /** Whether to enable audit logging for AI requests */
  enableAudit: boolean
  /** Whether to enable response caching */
  enableCache: boolean
  /** Cache expiration time in seconds (only applicable when caching is enabled) */
  cacheExpiration?: number
}

/**
 * Result of a provider connection test
 */
export interface TestResult {
  /** Whether the test was successful */
  success: boolean
  /** Message describing the test result */
  message?: string
  /** Response latency in milliseconds */
  latency?: number
  /** Timestamp when the test was performed */
  timestamp: number
}

/**
 * Capability-to-provider binding configuration
 */
export interface AiCapabilityProviderBinding {
  providerId: string
  /** Preferred models when invoking this capability */
  models?: string[]
  /** Smaller number means higher priority */
  priority?: number
  /** Whether this binding is active */
  enabled?: boolean
  /** Additional metadata (prompt overrides, etc.) */
  metadata?: Record<string, any>
}

/**
 * Capability configuration stored in TouchStorage
 */
export interface AISDKCapabilityConfig {
  id: string
  label: string
  description?: string
  providers: AiCapabilityProviderBinding[]
  promptTemplate?: string
  testResourceDir?: string
  metadata?: Record<string, any>
}

/**
 * Persisted storage payload
 */
export interface AISDKStorageData {
  providers: AiProviderConfig[]
  globalConfig: AISDKGlobalConfig
  capabilities: Record<string, AISDKCapabilityConfig>
  version: number
}

/**
 * Default provider configurations
 */
export const DEFAULT_PROVIDERS: AiProviderConfig[] = [
  {
    id: 'openai-default',
    type: AiProviderType.OPENAI,
    name: 'OpenAI',
    enabled: false,
    priority: 1,
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    defaultModel: 'gpt-4o-mini',
    timeout: 30000,
    rateLimit: {}
  },
  {
    id: 'anthropic-default',
    type: AiProviderType.ANTHROPIC,
    name: 'Anthropic',
    enabled: false,
    priority: 2,
    models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    defaultModel: 'claude-3-5-sonnet-20241022',
    timeout: 30000,
    rateLimit: {}
  },
  {
    id: 'deepseek-default',
    type: AiProviderType.DEEPSEEK,
    name: 'DeepSeek',
    enabled: false,
    priority: 2,
    models: ['deepseek-chat', 'deepseek-coder'],
    defaultModel: 'deepseek-chat',
    timeout: 30000,
    rateLimit: {}
  },
  {
    id: 'siliconflow-default',
    type: AiProviderType.SILICONFLOW,
    name: 'SiliconFlow',
    enabled: false,
    priority: 2,
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: [
      'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B',
      'tencent/Hunyuan-MT-7B',
      'TeleAI/TeleSpeechASR',
      'THUDM/GLM-4.1V-9B-Thinking',
      'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
      'BAAI/bge-reranker-v2-m3',
      'netease-youdao/bce-embedding-base_v1',
      'Kwai-Kolors/Kolors',
      'BAAI/bge-m3'
    ],
    defaultModel: 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B',
    timeout: 30000,
    rateLimit: {}
  },
  {
    id: 'local-default',
    type: AiProviderType.LOCAL,
    name: 'Local Model',
    enabled: false,
    priority: 3,
    models: [],
    baseUrl: 'http://localhost:11434',
    timeout: 60000,
    rateLimit: {}
  }
]

/**
 * Default global configuration
 */
export const DEFAULT_GLOBAL_CONFIG: AISDKGlobalConfig = {
  defaultStrategy: 'adaptive-default',
  enableAudit: false,
  enableCache: true,
  cacheExpiration: 3600
}

/**
 * Default capability routing (channels -> abilities)
 */
export const DEFAULT_CAPABILITIES: Record<string, AISDKCapabilityConfig> = {
  'text.chat': {
    id: 'text.chat',
    label: '对话 / Chat',
    description: '默认用于系统对话、翻译、总结等文本任务的模型集合',
    providers: [
      { providerId: 'openai-default', priority: 1, enabled: true },
      { providerId: 'anthropic-default', priority: 2, enabled: true },
      { providerId: 'deepseek-default', priority: 3, enabled: true },
      { providerId: 'siliconflow-default', priority: 4, enabled: true }
    ]
  },
  'embedding.generate': {
    id: 'embedding.generate',
    label: 'Embedding',
    description: '为向量检索/摘要生成 embedding',
    providers: [
      {
        providerId: 'siliconflow-default',
        models: ['netease-youdao/bce-embedding-base_v1', 'BAAI/bge-m3'],
        priority: 1,
        enabled: true
      }
    ]
  },
  'vision.ocr': {
    id: 'vision.ocr',
    label: '图像 OCR',
    description: '识别截图、图片中的文字并生成关键词',
    promptTemplate:
      '你是 OCR 助手，识别图片所有文本，生成 keywords 数组（5 个以内）辅助搜索。',
    testResourceDir: 'intelligence/test-capability/ocr',
    providers: [
      {
        providerId: 'siliconflow-default',
        models: ['deepseek-ai/DeepSeek-OCR', 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B'],
        priority: 1,
        enabled: true,
        metadata: { defaultVisionModel: 'deepseek-ai/DeepSeek-OCR' }
      }
    ]
  }
}
