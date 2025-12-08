import type { AiInvokeOptions, IntelligenceProviderConfig } from '@talex-touch/utils'

export interface StrategySelectionRequest {
  capabilityId: string
  options: AiInvokeOptions
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

class DefaultStrategyManager implements StrategyManager {
  setDefaultStrategy(_strategyId: string): void {
    // Note: Strategy implementation can be extended here in the future
  }

  async select(request: StrategySelectionRequest): Promise<StrategySelectionResult> {
    const { options, availableProviders } = request

    if (availableProviders.length === 0) {
      throw new Error('No providers available for selection')
    }

    // Handle explicit provider preference
    if (options.preferredProviderId) {
      const preferred = availableProviders.find(p => p.id === options.preferredProviderId)
      if (preferred) {
        return {
          selectedProvider: preferred,
          fallbackProviders: availableProviders.filter(p => p.id !== options.preferredProviderId),
          reasoning: `Explicit preference for ${options.preferredProviderId}`,
        }
      }
    }

    // Sort providers by priority (lower numbers = higher priority)
    const sortedProviders = [...availableProviders].sort((a, b) => {
      const priorityA = a.priority ?? 999
      const priorityB = b.priority ?? 999
      return priorityA - priorityB
    })

    // Handle model preference
    if (options.modelPreference && options.modelPreference.length > 0) {
      for (const preferredModel of options.modelPreference) {
        const providerWithModel = sortedProviders.find(p =>
          p.models?.includes(preferredModel) || p.defaultModel === preferredModel,
        )
        if (providerWithModel) {
          return {
            selectedProvider: providerWithModel,
            fallbackProviders: sortedProviders.filter(p => p.id !== providerWithModel.id),
            reasoning: `Model preference for ${preferredModel}`,
          }
        }
      }
    }

    // Default: select highest priority provider
    const [selected, ...fallbacks] = sortedProviders

    return {
      selectedProvider: selected,
      fallbackProviders: fallbacks,
      reasoning: `Default priority-based selection`,
    }
  }
}

export const strategyManager: StrategyManager = new DefaultStrategyManager()
