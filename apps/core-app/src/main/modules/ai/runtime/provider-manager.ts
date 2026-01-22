import type {
  IntelligenceProviderAdapter,
  IntelligenceProviderConfig,
  IntelligenceProviderType,
  ProviderManagerAdapter
} from '@talex-touch/utils'
import { createLogger } from '../../../utils/logger'

const providerManagerLog = createLogger('Intelligence').child('ProviderManager')

export class IntelligenceProviderManager implements ProviderManagerAdapter {
  private providers = new Map<string, IntelligenceProviderAdapter>()
  private factories = new Map<
    IntelligenceProviderType,
    (config: IntelligenceProviderConfig) => IntelligenceProviderAdapter
  >()

  registerFactory(
    type: IntelligenceProviderType,
    factory: (config: IntelligenceProviderConfig) => IntelligenceProviderAdapter
  ): void {
    this.factories.set(type, factory)
  }

  clear(): void {
    this.providers.clear()
  }

  private register(provider: IntelligenceProviderAdapter): void {
    const config = provider.getConfig()
    this.providers.set(config.id, provider)
  }

  registerFromConfig(config: IntelligenceProviderConfig): IntelligenceProviderAdapter {
    const factory = this.factories.get(config.type)
    if (!factory) {
      throw new Error(`No provider factory for type ${config.type}`)
    }
    const provider = factory(config)
    this.register(provider)
    providerManagerLog.info(
      `Registered provider ${config.id} (${config.type}), enabled: ${provider.isEnabled()}`
    )
    return provider
  }

  getEnabled(): IntelligenceProviderAdapter[] {
    return Array.from(this.providers.values()).filter((provider) => provider.isEnabled())
  }

  get(providerId: string): IntelligenceProviderAdapter | undefined {
    return this.providers.get(providerId)
  }

  createProviderInstance(config: IntelligenceProviderConfig): IntelligenceProviderAdapter {
    const factory = this.factories.get(config.type)
    if (!factory) {
      throw new Error(`No provider factory for type ${config.type}`)
    }
    return factory(config)
  }
}
