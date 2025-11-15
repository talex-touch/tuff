import type { AiProvider } from './base'
import type { AiProviderConfig } from '../../types/aisdk'
import { AiProviderType } from '../../types/aisdk'
import { OpenAIProvider } from './openai'
import { AnthropicProvider } from './anthropic'
import { DeepSeekProvider } from './deepseek'
import { LocalProvider } from './local'

export class ProviderManager {
  private providers = new Map<string, AiProvider>()
  private providerFactories = new Map<AiProviderType, (config: AiProviderConfig) => AiProvider>()

  constructor() {
    this.registerDefaultFactories()
  }

  private registerDefaultFactories(): void {
    this.registerFactory(AiProviderType.OPENAI, (config) => new OpenAIProvider(config))
    this.registerFactory(AiProviderType.ANTHROPIC, (config) => new AnthropicProvider(config))
    this.registerFactory(AiProviderType.DEEPSEEK, (config) => new DeepSeekProvider(config))
    this.registerFactory(AiProviderType.LOCAL, (config) => new LocalProvider(config))
  }

  registerFactory(type: AiProviderType, factory: (config: AiProviderConfig) => AiProvider): void {
    this.providerFactories.set(type, factory)
    console.log(`[ProviderManager] Registered factory for provider type: ${type}`)
  }

  register(provider: AiProvider): void {
    const config = provider.getConfig()
    if (this.providers.has(config.id)) {
      console.warn(`[ProviderManager] Provider ${config.id} already registered, overwriting`)
    }
    this.providers.set(config.id, provider)
    console.log(`[ProviderManager] Registered provider: ${config.id} (${config.type})`)
  }

  registerFromConfig(config: AiProviderConfig): AiProvider {
    const factory = this.providerFactories.get(config.type)
    if (!factory) {
      throw new Error(`[ProviderManager] No factory registered for provider type: ${config.type}`)
    }

    const provider = factory(config)
    this.register(provider)
    return provider
  }

  unregister(providerId: string): void {
    if (this.providers.delete(providerId)) {
      console.log(`[ProviderManager] Unregistered provider: ${providerId}`)
    } else {
      console.warn(`[ProviderManager] Provider ${providerId} not found`)
    }
  }

  get(providerId: string): AiProvider | undefined {
    return this.providers.get(providerId)
  }

  getByType(type: AiProviderType): AiProvider[] {
    return Array.from(this.providers.values()).filter(p => p.getConfig().type === type)
  }

  getAll(): AiProvider[] {
    return Array.from(this.providers.values())
  }

  getEnabled(): AiProvider[] {
    return Array.from(this.providers.values()).filter(p => p.isEnabled())
  }

  has(providerId: string): boolean {
    return this.providers.has(providerId)
  }

  clear(): void {
    this.providers.clear()
    console.log('[ProviderManager] Cleared all providers')
  }

  size(): number {
    return this.providers.size
  }

  updateConfig(providerId: string, config: Partial<AiProviderConfig>): void {
    const provider = this.get(providerId)
    if (!provider) {
      throw new Error(`[ProviderManager] Provider ${providerId} not found`)
    }
    provider.updateConfig(config)
    console.log(`[ProviderManager] Updated configuration for provider: ${providerId}`)
  }

  /**
   * Create a temporary provider instance without registering it
   * Useful for testing provider configurations
   */
  createProviderInstance(config: AiProviderConfig): AiProvider {
    const factory = this.providerFactories.get(config.type)
    if (!factory) {
      throw new Error(`[ProviderManager] No factory registered for provider type: ${config.type}`)
    }
    return factory(config)
  }
}

export const providerManager = new ProviderManager()
