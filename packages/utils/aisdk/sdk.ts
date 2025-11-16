import chalk from 'chalk'
import type {
  AiInvokeOptions,
  AiInvokeResult,
  AiStreamChunk,
  AiChatPayload,
  AiEmbeddingPayload,
  AiTranslatePayload,
  AiSummarizePayload,
  AiVisionOcrPayload,
  AiSDKConfig,
  AiAuditLog,
  ProviderManagerAdapter,
  AiProviderConfig
} from '../types/aisdk'
import { aiCapabilityRegistry } from './registry'
import { strategyManager } from './strategy'
import './capabilities'

const INTELLIGENCE_TAG = chalk.hex('#8e24aa').bold('[Intelligence]')
const logInfo = (...args: any[]) => console.log(INTELLIGENCE_TAG, ...args)
const logWarn = (...args: any[]) => console.warn(INTELLIGENCE_TAG, ...args)
const logError = (...args: any[]) => console.error(INTELLIGENCE_TAG, ...args)

let providerManager: ProviderManagerAdapter | null = null

export function setIntelligenceProviderManager(manager: ProviderManagerAdapter): void {
  providerManager = manager
  logInfo('Provider manager injected')
}

function ensureProviderManager(): ProviderManagerAdapter {
  if (!providerManager) {
    throw new Error('[Intelligence] Provider manager not initialized')
  }
  return providerManager
}

export class AiSDK {
  private config: AiSDKConfig = {
    providers: [],
    defaultStrategy: 'adaptive-default',
    enableAudit: true,
    enableCache: false,
    capabilities: {}
  }

  private auditLogs: AiAuditLog[] = []
  private cache = new Map<string, { result: any; timestamp: number }>()

  constructor(config?: Partial<AiSDKConfig>) {
    if (config) {
      this.updateConfig(config)
    }
  }

  updateConfig(config: Partial<AiSDKConfig>): void {
    const nextConfig: AiSDKConfig = { ...this.config, ...config }

    if (config.capabilities) {
      nextConfig.capabilities = {
        ...this.config.capabilities,
        ...config.capabilities
      }
    }

    if (config.defaultStrategy) {
      nextConfig.defaultStrategy = normalizeStrategyId(config.defaultStrategy) || this.config.defaultStrategy
    }

    this.config = {
      ...nextConfig,
      defaultStrategy: normalizeStrategyId(nextConfig.defaultStrategy) || 'adaptive-default'
    }

    if (config.providers) {
      const manager = ensureProviderManager()
      manager.clear()
      config.providers.forEach(providerConfig => {
        try {
          manager.registerFromConfig(providerConfig)
        } catch (error) {
          logError(`Failed to register provider ${providerConfig.id}:`, error)
        }
      })
    }

    if (this.config.defaultStrategy) {
      strategyManager.setDefaultStrategy(this.config.defaultStrategy)
    }

    logInfo('Configuration updated')
  }

  async invoke<T = any>(
    capabilityId: string,
    payload: any,
    options: AiInvokeOptions = {}
  ): Promise<AiInvokeResult<T>> {
    const capability = aiCapabilityRegistry.get(capabilityId)
    if (!capability) {
      throw new Error(`[Intelligence] Capability ${capabilityId} not found`)
    }
    logInfo(`invoke -> ${capabilityId}`)

    const runtimeOptions: AiInvokeOptions = { ...options }
    const capabilityRouting = this.config.capabilities?.[capabilityId]
    const configuredProviders =
      capabilityRouting?.providers
        ?.filter(binding => binding.enabled !== false)
        .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
        .map(binding => binding.providerId) ?? []

    if ((!runtimeOptions.allowedProviderIds || runtimeOptions.allowedProviderIds.length === 0) && configuredProviders.length > 0) {
      runtimeOptions.allowedProviderIds = configuredProviders
    }

    if ((!runtimeOptions.modelPreference || runtimeOptions.modelPreference.length === 0) && capabilityRouting?.providers) {
      const preferredModels = capabilityRouting.providers
        .filter(binding => !runtimeOptions.allowedProviderIds || runtimeOptions.allowedProviderIds.includes(binding.providerId))
        .flatMap(binding => binding.models ?? [])
        .filter((model): model is string => Boolean(model))
      if (preferredModels.length > 0) {
        runtimeOptions.modelPreference = preferredModels
      }
    }

    const cacheKey = this.getCacheKey(capabilityId, payload, runtimeOptions)
    if (this.config.enableCache && !runtimeOptions.stream) {
      const cached = this.getFromCache(cacheKey)
      if (cached) {
        logInfo(`Returning cached result for ${capabilityId}`)
        return cached
      }
    }

    const manager = ensureProviderManager()

    const availableProviders = manager
      .getEnabled()
      .map(p => p.getConfig())
      .filter(config => capability.supportedProviders.includes(config.type))
      .filter(config => {
        if (!runtimeOptions.allowedProviderIds || runtimeOptions.allowedProviderIds.length === 0) {
          return true
        }
        return runtimeOptions.allowedProviderIds.includes(config.id)
      })

    if (availableProviders.length === 0) {
      throw new Error(`[Intelligence] No enabled providers for ${capabilityId}`)
    }

    const strategyResult = await strategyManager.select({
      capabilityId,
      options: runtimeOptions,
      availableProviders
    })

    const provider = manager.get(strategyResult.selectedProvider.id)
    if (!provider) {
      throw new Error(`[Intelligence] Provider ${strategyResult.selectedProvider.id} not found`)
    }
    logInfo(`Selected provider ${strategyResult.selectedProvider.id} for ${capabilityId}`)

    let result: AiInvokeResult<T>
    const startTime = Date.now()

    try {
      switch (capability.type) {
        case 'chat':
          result = await provider.chat(payload as AiChatPayload, runtimeOptions) as AiInvokeResult<T>
          break
        case 'embedding':
          result = await provider.embedding(payload as AiEmbeddingPayload, runtimeOptions) as AiInvokeResult<T>
          break
        case 'translate':
          result = await provider.translate(payload as AiTranslatePayload, runtimeOptions) as AiInvokeResult<T>
          break
        case 'vision':
          result = await provider.visionOcr(payload as AiVisionOcrPayload, runtimeOptions) as AiInvokeResult<T>
          break
        default:
          throw new Error(`[Intelligence] Capability type ${capability.type} not implemented`)
      }

      if (this.config.enableCache) {
        this.setToCache(cacheKey, result)
      }

      if (this.config.enableAudit) {
        this.addAuditLog({
          traceId: result.traceId,
          timestamp: startTime,
          capabilityId,
          provider: result.provider,
          model: result.model,
          usage: result.usage,
          latency: result.latency,
          success: true
        })
      }

      logInfo(`${capabilityId} success via ${result.provider} (${result.model}) latency=${result.latency}ms`)
      return result
    } catch (error) {
      logError(`Invoke error for ${capabilityId}`, error)

      if (this.config.enableAudit) {
        this.addAuditLog({
          traceId: `error-${Date.now()}`,
          timestamp: startTime,
          capabilityId,
          provider: strategyResult.selectedProvider.id,
          model: 'unknown',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latency: Date.now() - startTime,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }

      if (strategyResult.fallbackProviders.length > 0) {
        logWarn(`Attempting fallback providers for ${capabilityId}`)
        for (const fallbackConfig of strategyResult.fallbackProviders) {
          const fallbackProvider = manager.get(fallbackConfig.id)
          if (!fallbackProvider) continue

          try {
            switch (capability.type) {
              case 'chat':
                result = await fallbackProvider.chat(payload as AiChatPayload, runtimeOptions) as AiInvokeResult<T>
                break
              case 'embedding':
                result = await fallbackProvider.embedding(payload as AiEmbeddingPayload, runtimeOptions) as AiInvokeResult<T>
                break
              case 'translate':
                result = await fallbackProvider.translate(payload as AiTranslatePayload, runtimeOptions) as AiInvokeResult<T>
                break
              case 'vision':
                result = await fallbackProvider.visionOcr(payload as AiVisionOcrPayload, runtimeOptions) as AiInvokeResult<T>
                break
              default:
                continue
            }

            logInfo(`Fallback successful with provider ${fallbackConfig.id}`)
            return result
          } catch (fallbackError) {
            logError(`Fallback provider ${fallbackConfig.id} failed`, fallbackError)
          }
        }
      }

      throw error
    }
  }

  async *invokeStream(
    capabilityId: string,
    payload: any,
    options: AiInvokeOptions = {}
  ): AsyncGenerator<AiStreamChunk> {
    const capability = aiCapabilityRegistry.get(capabilityId)
    if (!capability) {
      throw new Error(`[Intelligence] Capability ${capabilityId} not found`)
    }

    const runtimeOptions: AiInvokeOptions = { ...options, stream: true }
    const capabilityRouting = this.config.capabilities?.[capabilityId]
    const configuredProviders =
      capabilityRouting?.providers
        ?.filter(binding => binding.enabled !== false)
        .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
        .map(binding => binding.providerId) ?? []

    if ((!runtimeOptions.allowedProviderIds || runtimeOptions.allowedProviderIds.length === 0) && configuredProviders.length > 0) {
      runtimeOptions.allowedProviderIds = configuredProviders
    }

    if ((!runtimeOptions.modelPreference || runtimeOptions.modelPreference.length === 0) && capabilityRouting?.providers) {
      const preferredModels = capabilityRouting.providers
        .filter(binding => !runtimeOptions.allowedProviderIds || runtimeOptions.allowedProviderIds.includes(binding.providerId))
        .flatMap(binding => binding.models ?? [])
        .filter((model): model is string => Boolean(model))
      if (preferredModels.length > 0) {
        runtimeOptions.modelPreference = preferredModels
      }
    }

    const manager = ensureProviderManager()

    const availableProviders = manager
      .getEnabled()
      .map(p => p.getConfig())
      .filter(config => capability.supportedProviders.includes(config.type))
      .filter(config => {
        if (!runtimeOptions.allowedProviderIds || runtimeOptions.allowedProviderIds.length === 0) {
          return true
        }
        return runtimeOptions.allowedProviderIds.includes(config.id)
      })

    if (availableProviders.length === 0) {
      throw new Error(`[Intelligence] No enabled providers for ${capabilityId}`)
    }

    const strategyResult = await strategyManager.select({
      capabilityId,
      options: runtimeOptions,
      availableProviders
    })

    const provider = manager.get(strategyResult.selectedProvider.id)
    if (!provider) {
      throw new Error(`[Intelligence] Provider ${strategyResult.selectedProvider.id} not found`)
    }

    if (capability.type !== 'chat') {
      throw new Error('[Intelligence] Stream is only supported for chat capability')
    }

    yield* provider.chatStream(payload as AiChatPayload, runtimeOptions)
  }

  private getCacheKey(capabilityId: string, payload: any, options: AiInvokeOptions): string {
    return `${capabilityId}:${JSON.stringify(payload)}:${JSON.stringify(options)}`
  }

  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key)
    if (!cached) return null

    const expiration = this.config.cacheExpiration || 1800
    if (Date.now() - cached.timestamp > expiration * 1000) {
      this.cache.delete(key)
      return null
    }

    return cached.result
  }

  private setToCache(key: string, result: any): void {
    this.cache.set(key, {
      result,
      timestamp: Date.now()
    })
  }

  private addAuditLog(log: AiAuditLog): void {
    this.auditLogs.push(log)
    if (this.auditLogs.length > 1000) {
      this.auditLogs.shift()
    }
  }

  getAuditLogs(limit: number = 100): AiAuditLog[] {
    return this.auditLogs.slice(-limit)
  }

  clearCache(): void {
    this.cache.clear()
    logInfo('Cache cleared')
  }

  clearAuditLogs(): void {
    this.auditLogs = []
    logInfo('Audit logs cleared')
  }

  text = {
    chat: (payload: AiChatPayload, options?: AiInvokeOptions) => 
      this.invoke<string>('text.chat', payload, options),
    
    chatStream: (payload: AiChatPayload, options?: AiInvokeOptions) => 
      this.invokeStream('text.chat', payload, options),
    
    translate: (payload: AiTranslatePayload, options?: AiInvokeOptions) => 
      this.invoke<string>('text.translate', payload, options),
    
    summarize: (payload: AiSummarizePayload, options?: AiInvokeOptions) => 
      this.invoke<string>('text.summarize', payload, options)
  }

  embedding = {
    generate: (payload: AiEmbeddingPayload, options?: AiInvokeOptions) => 
      this.invoke<number[]>('embedding.generate', payload, options)
  }

  /**
   * Test a provider connection
   * @param providerConfig - Provider configuration to test
   * @returns Test result with success status, message, and latency
   */
  async testProvider(providerConfig: AiProviderConfig): Promise<{
    success: boolean
    message: string
    latency?: number
    timestamp: number
  }> {
    const startTime = Date.now()
    const timestamp = Date.now()

    try {
      // Validate provider configuration
      if (!providerConfig.enabled) {
        return {
          success: false,
          message: 'Provider is disabled',
          timestamp
        }
      }

      if (!providerConfig.apiKey && providerConfig.type !== 'local') {
        return {
          success: false,
          message: 'API key is required',
          timestamp
        }
      }

      // Create a temporary provider instance for testing
      const manager = ensureProviderManager()
      const provider = manager.createProviderInstance(providerConfig)
      
      // Use a simple test payload
      const testPayload: AiChatPayload = {
        messages: [
          {
            role: 'user',
            content: 'Hello'
          }
        ],
        maxTokens: 10
      }

      const timeout = providerConfig.timeout || 30000

      // Test the provider with timeout
      const result = await Promise.race([
        provider.chat(testPayload, { timeout }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
      ])

      const latency = Date.now() - startTime

      return {
        success: true,
        message: `Connection successful. Model: ${result.model}`,
        latency,
        timestamp
      }
    } catch (error) {
      const latency = Date.now() - startTime
      let message = 'Connection failed'

      if (error instanceof Error) {
        // Parse common error messages
        if (error.message.includes('timeout')) {
          message = 'Request timeout - check your network connection'
        } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          message = 'Invalid API key'
        } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
          message = 'Access forbidden - check your API key permissions'
        } else if (error.message.includes('404')) {
          message = 'API endpoint not found - check your base URL'
        } else if (error.message.includes('429')) {
          message = 'Rate limit exceeded'
        } else if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
          message = 'Provider service error - try again later'
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          message = 'Network error - check your internet connection'
        } else {
          message = error.message
        }
      }

      return {
        success: false,
        message,
        latency,
        timestamp
      }
    }
  }
}

export const ai = new AiSDK()
function normalizeStrategyId(id?: string): string | undefined {
  if (!id) return id
  if (id === 'priority') return 'rule-based-default'
  if (id === 'adaptive') return 'adaptive-default'
  return id
}
