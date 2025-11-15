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
  defaultStrategy: 'priority',
  enableAudit: false,
  enableCache: true,
  cacheExpiration: 3600
}
