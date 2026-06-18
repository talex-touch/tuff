import type {
  IntelligenceCapabilityConfig,
  IntelligenceInvokeOptions,
} from '../types/intelligence'
import { toRuntimeCapabilityId } from './capabilities'

export interface IntelligenceProviderRoutingProvider {
  id: string
  type: string
  name?: string
  enabled?: boolean
  apiKey?: string | null
  hasApiKey?: boolean
  models?: string[] | null
  defaultModel?: string | null
  timeout?: number | null
  priority?: number | null
  capabilities?: string[] | null
}

export interface IntelligenceProviderRoutingInput<TProvider extends IntelligenceProviderRoutingProvider = IntelligenceProviderRoutingProvider> {
  capabilityId: string
  providers: TProvider[]
  capability?: Pick<IntelligenceCapabilityConfig, 'providers'> | null
  options?: IntelligenceInvokeOptions & {
    providerId?: string
    model?: string
    timeoutMs?: number
  }
  defaultStrategy?: string | null
  requireApiKey?: boolean
  isProviderAvailable?: (provider: TProvider) => boolean
}

export interface IntelligenceProviderRoute<TProvider extends IntelligenceProviderRoutingProvider = IntelligenceProviderRoutingProvider> {
  provider: TProvider
  model?: string
  bindingModels: string[]
  timeoutMs?: number
}

export interface IntelligenceProviderRoutingResult<TProvider extends IntelligenceProviderRoutingProvider = IntelligenceProviderRoutingProvider> {
  routes: IntelligenceProviderRoute<TProvider>[]
  skipped: Array<{
    providerId: string
    reason: string
  }>
}

function providerSupportsCapability(provider: IntelligenceProviderRoutingProvider, capabilityId: string): boolean {
  if (!Array.isArray(provider.capabilities) || provider.capabilities.length <= 0) {
    return true
  }
  return provider.capabilities.some(item => toRuntimeCapabilityId(item) === capabilityId)
}

function resolveProviderPriority(
  provider: IntelligenceProviderRoutingProvider,
  capability: Pick<IntelligenceCapabilityConfig, 'providers'> | null | undefined,
): number {
  const binding = capability?.providers
    ?.filter(item => item.enabled !== false)
    .find(item => item.providerId === provider.id)
  return binding?.priority ?? provider.priority ?? 999
}

function resolveBindingModels(
  provider: IntelligenceProviderRoutingProvider,
  capability: Pick<IntelligenceCapabilityConfig, 'providers'> | null | undefined,
): string[] {
  const binding = capability?.providers?.find(item => item.providerId === provider.id)
  return binding?.models?.filter(Boolean) ?? []
}

function resolveRouteModel(
  provider: IntelligenceProviderRoutingProvider,
  bindingModels: string[],
  options: IntelligenceProviderRoutingInput['options'],
): string | undefined {
  const explicitModel = typeof options?.model === 'string' && options.model.trim()
    ? options.model.trim()
    : undefined
  if (explicitModel) {
    return explicitModel
  }

  for (const model of options?.modelPreference ?? []) {
    if (!model) continue
    if (bindingModels.length <= 0 || bindingModels.includes(model)) {
      if (!provider.models?.length || provider.models.includes(model) || provider.defaultModel === model) {
        return model
      }
    }
  }

  return bindingModels[0] ?? provider.defaultModel ?? provider.models?.[0]
}

export function resolveIntelligenceProviderRoutes<TProvider extends IntelligenceProviderRoutingProvider>(
  input: IntelligenceProviderRoutingInput<TProvider>,
): IntelligenceProviderRoutingResult<TProvider> {
  const capabilityId = toRuntimeCapabilityId(input.capabilityId)
  const options = input.options ?? {}
  const explicitProviderId = options.providerId || options.preferredProviderId
  const allowedProviderIds = new Set(
    explicitProviderId
      ? [explicitProviderId]
      : options.allowedProviderIds?.filter(Boolean) ?? [],
  )
  const capabilityProviderIds = new Set(
    input.capability?.providers
      ?.filter(binding => binding.enabled !== false)
      .map(binding => binding.providerId) ?? [],
  )
  const skipped: IntelligenceProviderRoutingResult<TProvider>['skipped'] = []
  const routes: IntelligenceProviderRoute<TProvider>[] = []

  for (const provider of input.providers) {
    if (provider.enabled === false) {
      skipped.push({ providerId: provider.id, reason: 'provider_disabled' })
      continue
    }
    if (allowedProviderIds.size > 0 && !allowedProviderIds.has(provider.id)) {
      skipped.push({ providerId: provider.id, reason: 'provider_not_allowed' })
      continue
    }
    if (capabilityProviderIds.size > 0 && !capabilityProviderIds.has(provider.id)) {
      skipped.push({ providerId: provider.id, reason: 'capability_binding_missing' })
      continue
    }
    if (!providerSupportsCapability(provider, capabilityId)) {
      skipped.push({ providerId: provider.id, reason: 'capability_not_supported' })
      continue
    }
    if (input.requireApiKey !== false && provider.type !== 'local' && !provider.apiKey && provider.hasApiKey !== true) {
      skipped.push({ providerId: provider.id, reason: 'api_key_missing' })
      continue
    }
    if (input.isProviderAvailable && !input.isProviderAvailable(provider)) {
      skipped.push({ providerId: provider.id, reason: 'provider_unavailable' })
      continue
    }

    const bindingModels = resolveBindingModels(provider, input.capability)
    const model = resolveRouteModel(provider, bindingModels, options)
    if (!model) {
      skipped.push({ providerId: provider.id, reason: 'model_missing' })
      continue
    }

    routes.push({
      provider,
      model,
      bindingModels,
      timeoutMs: options.timeoutMs ?? provider.timeout ?? undefined,
    })
  }

  routes.sort((a, b) => {
    if (explicitProviderId) {
      if (a.provider.id === explicitProviderId) return -1
      if (b.provider.id === explicitProviderId) return 1
    }

    if (options.modelPreference?.length) {
      const aModelRank = a.model ? options.modelPreference.indexOf(a.model) : -1
      const bModelRank = b.model ? options.modelPreference.indexOf(b.model) : -1
      if (aModelRank !== bModelRank) {
        if (aModelRank < 0) return 1
        if (bModelRank < 0) return -1
        return aModelRank - bModelRank
      }
    }

    const priorityDiff = resolveProviderPriority(a.provider, input.capability)
      - resolveProviderPriority(b.provider, input.capability)
    if (priorityDiff !== 0) {
      return priorityDiff
    }

    return a.provider.id.localeCompare(b.provider.id)
  })

  return { routes, skipped }
}

export function resolveFirstIntelligenceProviderRoute<TProvider extends IntelligenceProviderRoutingProvider>(
  input: IntelligenceProviderRoutingInput<TProvider>,
): IntelligenceProviderRoute<TProvider> | null {
  return resolveIntelligenceProviderRoutes(input).routes[0] ?? null
}
