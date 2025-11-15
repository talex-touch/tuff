import type { AiProviderConfig, AiInvokeOptions } from '../types/aisdk'

export interface StrategyContext {
  capabilityId: string
  options: AiInvokeOptions
  availableProviders: AiProviderConfig[]
}

export interface StrategyResult {
  selectedProvider: AiProviderConfig
  fallbackProviders: AiProviderConfig[]
}

export abstract class AiStrategy {
  abstract readonly id: string
  abstract readonly name: string
  abstract readonly type: 'rule-based' | 'adaptive' | 'custom'

  abstract select(context: StrategyContext): Promise<StrategyResult>
}

export class RuleBasedStrategy extends AiStrategy {
  readonly id = 'rule-based-default'
  readonly name = 'Rule-Based Strategy'
  readonly type = 'rule-based' as const

  async select(context: StrategyContext): Promise<StrategyResult> {
    const { options, availableProviders } = context

    let providers = [...availableProviders].filter(p => p.enabled)

    if (providers.length === 0) {
      throw new Error('[RuleBasedStrategy] No enabled providers available')
    }

    if (options.modelPreference && options.modelPreference.length > 0) {
      const preferredProviders = providers.filter(p => 
        p.models?.some(model => options.modelPreference?.includes(model))
      )
      if (preferredProviders.length > 0) {
        providers = preferredProviders
      }
    }

    providers.sort((a, b) => (a.priority || 999) - (b.priority || 999))

    const [selectedProvider, ...fallbackProviders] = providers

    return {
      selectedProvider,
      fallbackProviders
    }
  }
}

export class AdaptiveStrategy extends AiStrategy {
  readonly id = 'adaptive-default'
  readonly name = 'Adaptive Strategy'
  readonly type = 'adaptive' as const

  private successRates = new Map<string, number>()
  private latencies = new Map<string, number[]>()

  async select(context: StrategyContext): Promise<StrategyResult> {
    const { options, availableProviders } = context

    let providers = [...availableProviders].filter(p => p.enabled)

    if (providers.length === 0) {
      throw new Error('[AdaptiveStrategy] No enabled providers available')
    }

    providers.sort((a, b) => {
      const aScore = this.calculateScore(a, options)
      const bScore = this.calculateScore(b, options)
      return bScore - aScore
    })

    const [selectedProvider, ...fallbackProviders] = providers

    return {
      selectedProvider,
      fallbackProviders
    }
  }

  private calculateScore(provider: AiProviderConfig, options: AiInvokeOptions): number {
    let score = 100

    const successRate = this.successRates.get(provider.id) || 1.0
    score *= successRate

    const latencies = this.latencies.get(provider.id) || []
    if (latencies.length > 0 && options.latencyTarget) {
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length
      if (avgLatency < options.latencyTarget) {
        score *= 1.2
      } else {
        score *= 0.8
      }
    }

    score /= (provider.priority || 1)

    return score
  }

  recordSuccess(providerId: string, latency: number): void {
    const currentRate = this.successRates.get(providerId) || 0.5
    this.successRates.set(providerId, Math.min(1.0, currentRate + 0.1))

    const latencies = this.latencies.get(providerId) || []
    latencies.push(latency)
    if (latencies.length > 100) {
      latencies.shift()
    }
    this.latencies.set(providerId, latencies)
  }

  recordFailure(providerId: string): void {
    const currentRate = this.successRates.get(providerId) || 0.5
    this.successRates.set(providerId, Math.max(0.0, currentRate - 0.2))
  }
}

export class StrategyManager {
  private strategies = new Map<string, AiStrategy>()
  private defaultStrategyId = 'adaptive-default'

  constructor() {
    this.registerDefaultStrategies()
  }

  private registerDefaultStrategies(): void {
    this.register(new RuleBasedStrategy())
    this.register(new AdaptiveStrategy())
  }

  register(strategy: AiStrategy): void {
    if (this.strategies.has(strategy.id)) {
      console.warn(`[StrategyManager] Strategy ${strategy.id} already registered, overwriting`)
    }
    this.strategies.set(strategy.id, strategy)
    console.log(`[StrategyManager] Registered strategy: ${strategy.id}`)
  }

  unregister(strategyId: string): void {
    if (this.strategies.delete(strategyId)) {
      console.log(`[StrategyManager] Unregistered strategy: ${strategyId}`)
    } else {
      console.warn(`[StrategyManager] Strategy ${strategyId} not found`)
    }
  }

  get(strategyId: string): AiStrategy | undefined {
    return this.strategies.get(strategyId)
  }

  getDefault(): AiStrategy {
    const strategy = this.strategies.get(this.defaultStrategyId)
    if (!strategy) {
      throw new Error(`[StrategyManager] Default strategy ${this.defaultStrategyId} not found`)
    }
    return strategy
  }

  setDefaultStrategy(strategyId: string): void {
    if (!this.strategies.has(strategyId)) {
      throw new Error(`[StrategyManager] Strategy ${strategyId} not found`)
    }
    this.defaultStrategyId = strategyId
    console.log(`[StrategyManager] Default strategy set to: ${strategyId}`)
  }

  async select(context: StrategyContext): Promise<StrategyResult> {
    const strategyId = context.options.strategy || this.defaultStrategyId
    const strategy = this.get(strategyId) || this.getDefault()
    return strategy.select(context)
  }
}

export const strategyManager = new StrategyManager()
