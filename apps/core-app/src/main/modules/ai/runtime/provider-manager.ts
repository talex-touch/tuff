import type {
  AiProviderConfig,
  AiProviderType,
  AiProviderAdapter,
  ProviderManagerAdapter
} from '@talex-touch/utils/types/aisdk'
import { createLogger } from '../../../utils/logger'

const providerManagerLog = createLogger('Intelligence').child('ProviderManager')

export class IntelligenceProviderManager implements ProviderManagerAdapter {
  private providers = new Map<string, AiProviderAdapter>()
  private factories = new Map<AiProviderType, (config: AiProviderConfig) => AiProviderAdapter>()

  registerFactory(type: AiProviderType, factory: (config: AiProviderConfig) => AiProviderAdapter): void {
    this.factories.set(type, factory)
  }

  clear(): void {
    this.providers.clear()
  }

  private register(provider: AiProviderAdapter): void {
    const config = provider.getConfig()
    this.providers.set(config.id, provider)
  }

  registerFromConfig(config: AiProviderConfig): AiProviderAdapter {
    const factory = this.factories.get(config.type)
    if (!factory) {
      throw new Error(`No provider factory for type ${config.type}`)
    }
    const provider = factory(config)
    this.register(provider)
    providerManagerLog.info(`Registered provider ${config.id} (${config.type})`)
    return provider
  }

  getEnabled(): AiProviderAdapter[] {
    return Array.from(this.providers.values()).filter((provider) => provider.isEnabled())
  }

  get(providerId: string): AiProviderAdapter | undefined {
    return this.providers.get(providerId)
  }

  createProviderInstance(config: AiProviderConfig): AiProviderAdapter {
    const factory = this.factories.get(config.type)
    if (!factory) {
      throw new Error(`No provider factory for type ${config.type}`)
    }
    return factory(config)
  }
}
