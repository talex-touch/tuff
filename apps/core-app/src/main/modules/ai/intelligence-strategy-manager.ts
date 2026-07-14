import type {
  IntelligenceInvokeOptions,
  IntelligenceProviderConfig,
} from '@talex-touch/tuff-intelligence'

export interface StrategySelectionRequest {
  capabilityId: string
  options: IntelligenceInvokeOptions
  availableProviders: IntelligenceProviderConfig[]
}

export interface StrategySelectionResult {
  selectedProvider: IntelligenceProviderConfig
  fallbackProviders: IntelligenceProviderConfig[]
  reasoning?: string
}

export interface StrategyManager {
  setDefaultStrategy: (strategyId: string) => void
  select: (request: StrategySelectionRequest) => Promise<StrategySelectionResult>
}

const DEFAULT_STRATEGY_ID = 'adaptive-default'

function normalizeStrategyId(strategyId?: string | null): string {
  if (!strategyId)
    return DEFAULT_STRATEGY_ID
  if (strategyId === 'priority')
    return 'rule-based-default'
  if (strategyId === 'adaptive')
    return DEFAULT_STRATEGY_ID
  return strategyId
}

function sortByPriority(providers: IntelligenceProviderConfig[]): IntelligenceProviderConfig[] {
  return [...providers].sort((a, b) => {
    const priorityA = a.priority ?? 999
    const priorityB = b.priority ?? 999
    if (priorityA !== priorityB)
      return priorityA - priorityB
    return a.id.localeCompare(b.id)
  })
}

function buildFallbackProviders(
  providers: IntelligenceProviderConfig[],
  selectedProviderId: string,
): IntelligenceProviderConfig[] {
  return providers.filter(provider => provider.id !== selectedProviderId)
}

class DefaultStrategyManager implements StrategyManager {
  private defaultStrategyId = DEFAULT_STRATEGY_ID
  private roundRobinCursor = new Map<string, number>()

  setDefaultStrategy(strategyId: string): void {
    const normalized = normalizeStrategyId(strategyId)
    if (normalized !== this.defaultStrategyId) {
      this.roundRobinCursor.clear()
    }
    this.defaultStrategyId = normalized
  }

  async select(request: StrategySelectionRequest): Promise<StrategySelectionResult> {
    const { options, availableProviders } = request

    if (availableProviders.length === 0) {
      throw new Error('No providers available for selection')
    }

    const sortedProviders = sortByPriority(availableProviders)

    // Handle explicit provider preference.
    if (options.preferredProviderId) {
      const preferred = sortedProviders.find(
        provider => provider.id === options.preferredProviderId,
      )
      if (preferred) {
        return {
          selectedProvider: preferred,
          fallbackProviders: buildFallbackProviders(sortedProviders, preferred.id),
          reasoning: `Explicit preference for ${options.preferredProviderId}`,
        }
      }
    }

    // Handle model preference.
    if (options.modelPreference && options.modelPreference.length > 0) {
      for (const preferredModel of options.modelPreference) {
        const providerWithModel = sortedProviders.find(
          provider =>
            provider.models?.includes(preferredModel) || provider.defaultModel === preferredModel,
        )
        if (providerWithModel) {
          return {
            selectedProvider: providerWithModel,
            fallbackProviders: buildFallbackProviders(sortedProviders, providerWithModel.id),
            reasoning: `Model preference for ${preferredModel}`,
          }
        }
      }
    }

    const strategyId = normalizeStrategyId(options.strategy || this.defaultStrategyId)
    if (strategyId === 'round-robin') {
      const cursorKey = request.capabilityId
      const cursor = this.roundRobinCursor.get(cursorKey) ?? 0
      const selectedIndex = cursor % sortedProviders.length
      const selectedProvider = sortedProviders[selectedIndex]
      this.roundRobinCursor.set(cursorKey, (selectedIndex + 1) % sortedProviders.length)

      return {
        selectedProvider,
        fallbackProviders: [
          ...sortedProviders.slice(selectedIndex + 1),
          ...sortedProviders.slice(0, selectedIndex),
        ],
        reasoning: 'Round-robin provider selection',
      }
    }

    // adaptive-default currently keeps deterministic priority ordering until live telemetry is available.
    const [selected, ...fallbacks] = sortedProviders

    return {
      selectedProvider: selected,
      fallbackProviders: fallbacks,
      reasoning: `${strategyId} priority-based selection`,
    }
  }
}

export const strategyManager: StrategyManager = new DefaultStrategyManager()
