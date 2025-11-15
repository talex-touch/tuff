import type {
  AiInvokeOptions,
  AiInvokeResult,
  AiStreamChunk,
  AiChatPayload,
  AiEmbeddingPayload,
  AiTranslatePayload,
  AiSummarizePayload,
  AiSDKConfig,
  AiAuditLog
} from '../types/aisdk'
import { aiCapabilityRegistry } from './registry'
import { strategyManager } from './strategy'
import { providerManager } from './providers'

export class AiSDK {
  private config: AiSDKConfig = {
    providers: [],
    defaultStrategy: 'adaptive-default',
    enableAudit: true,
    enableCache: false
  }

  private auditLogs: AiAuditLog[] = []
  private cache = new Map<string, { result: any; timestamp: number }>()

  constructor(config?: Partial<AiSDKConfig>) {
    if (config) {
      this.updateConfig(config)
    }
  }

  updateConfig(config: Partial<AiSDKConfig>): void {
    this.config = { ...this.config, ...config }

    if (config.providers) {
      providerManager.clear()
      config.providers.forEach(providerConfig => {
        try {
          providerManager.registerFromConfig(providerConfig)
        } catch (error) {
          console.error(`[AiSDK] Failed to register provider ${providerConfig.id}:`, error)
        }
      })
    }

    if (config.defaultStrategy) {
      strategyManager.setDefaultStrategy(config.defaultStrategy)
    }

    console.log('[AiSDK] Configuration updated:', this.config)
  }

  async invoke<T = any>(
    capabilityId: string,
    payload: any,
    options: AiInvokeOptions = {}
  ): Promise<AiInvokeResult<T>> {
    const capability = aiCapabilityRegistry.get(capabilityId)
    if (!capability) {
      throw new Error(`[AiSDK] Capability ${capabilityId} not found`)
    }

    const cacheKey = this.getCacheKey(capabilityId, payload, options)
    if (this.config.enableCache && !options.stream) {
      const cached = this.getFromCache(cacheKey)
      if (cached) {
        console.log(`[AiSDK] Returning cached result for ${capabilityId}`)
        return cached
      }
    }

    const availableProviders = providerManager
      .getEnabled()
      .map(p => p.getConfig())
      .filter(config => capability.supportedProviders.includes(config.type))

    if (availableProviders.length === 0) {
      throw new Error(`[AiSDK] No enabled providers available for capability ${capabilityId}`)
    }

    const strategyResult = await strategyManager.select({
      capabilityId,
      options,
      availableProviders
    })

    const provider = providerManager.get(strategyResult.selectedProvider.id)
    if (!provider) {
      throw new Error(`[AiSDK] Provider ${strategyResult.selectedProvider.id} not found`)
    }

    let result: AiInvokeResult<T>
    const startTime = Date.now()

    try {
      switch (capability.type) {
        case 'chat':
          result = await provider.chat(payload as AiChatPayload, options) as AiInvokeResult<T>
          break
        case 'embedding':
          result = await provider.embedding(payload as AiEmbeddingPayload, options) as AiInvokeResult<T>
          break
        case 'translate':
          result = await provider.translate(payload as AiTranslatePayload, options) as AiInvokeResult<T>
          break
        default:
          throw new Error(`[AiSDK] Capability type ${capability.type} not implemented`)
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

      return result
    } catch (error) {
      console.error(`[AiSDK] Invoke error for ${capabilityId}:`, error)

      if (this.config.enableAudit) {
        this.addAuditLog({
          traceId: `error-${Date.now()}`,
          timestamp: startTime,
          capabilityId,
          provider: strategyResult.selectedProvider.type,
          model: 'unknown',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latency: Date.now() - startTime,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }

      if (strategyResult.fallbackProviders.length > 0) {
        console.log(`[AiSDK] Attempting fallback providers for ${capabilityId}`)
        for (const fallbackConfig of strategyResult.fallbackProviders) {
          const fallbackProvider = providerManager.get(fallbackConfig.id)
          if (!fallbackProvider) continue

          try {
            switch (capability.type) {
              case 'chat':
                result = await fallbackProvider.chat(payload as AiChatPayload, options) as AiInvokeResult<T>
                break
              case 'embedding':
                result = await fallbackProvider.embedding(payload as AiEmbeddingPayload, options) as AiInvokeResult<T>
                break
              case 'translate':
                result = await fallbackProvider.translate(payload as AiTranslatePayload, options) as AiInvokeResult<T>
                break
              default:
                continue
            }

            console.log(`[AiSDK] Fallback successful with provider ${fallbackConfig.id}`)
            return result
          } catch (fallbackError) {
            console.error(`[AiSDK] Fallback provider ${fallbackConfig.id} also failed:`, fallbackError)
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
      throw new Error(`[AiSDK] Capability ${capabilityId} not found`)
    }

    const availableProviders = providerManager
      .getEnabled()
      .map(p => p.getConfig())
      .filter(config => capability.supportedProviders.includes(config.type))

    if (availableProviders.length === 0) {
      throw new Error(`[AiSDK] No enabled providers available for capability ${capabilityId}`)
    }

    const strategyResult = await strategyManager.select({
      capabilityId,
      options: { ...options, stream: true },
      availableProviders
    })

    const provider = providerManager.get(strategyResult.selectedProvider.id)
    if (!provider) {
      throw new Error(`[AiSDK] Provider ${strategyResult.selectedProvider.id} not found`)
    }

    if (capability.type !== 'chat') {
      throw new Error(`[AiSDK] Stream is only supported for chat capability`)
    }

    yield* provider.chatStream(payload as AiChatPayload, options)
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
    console.log('[AiSDK] Cache cleared')
  }

  clearAuditLogs(): void {
    this.auditLogs = []
    console.log('[AiSDK] Audit logs cleared')
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
}

export const ai = new AiSDK()
