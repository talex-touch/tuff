import type { IProviderActivate, ISearchProvider, TuffItem, TuffQuery } from '@talex-touch/utils'
import { TuffInputType } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { enterPerfContext } from '../../../utils/perf-context'
import { everythingProvider } from '../addon/files/everything-provider'
import { fileProvider } from '../addon/files/file-provider'
import { resolveClipboardInputs } from './utils/resolve-clipboard-inputs'
import {
  buildSearchCacheKey,
  isExplicitEverythingProviderFilter,
  isExplicitFileCategoryFilter,
  isExplicitFileProviderFilter,
  matchesProviderFilter,
  parseProviderFilter,
  toQueryHash
} from './search-core-utils'
import type { ProviderContext } from './types'

const log = getLogger('search-engine')

export interface SearchQueryOrchestratorDeps {
  getProviderConfigSignature: () => string
  getActivations: () => Map<string, IProviderActivate> | null
  shouldSkipProvider: (providerId: string) => boolean
}

export interface SearchQueryOrchestrationResult {
  providerFilter?: string
  cacheKey: string
  providerConfigSignature: string
  durationMs: number
}

/** Query normalization and provider selection, isolated from facade lifecycle state. */
export class SearchQueryOrchestrator {
  constructor(private readonly deps: SearchQueryOrchestratorDeps) {}

  async orchestrate(query: TuffQuery): Promise<SearchQueryOrchestrationResult> {
    const startedAt = performance.now()
    const dispose = enterPerfContext('Search.pipeline.parse', {
      queryLength: (query.text || '').length,
      inputCount: query.inputs?.length || 0
    })
    try {
      if (query.text) query.text = query.text.trim()
      const parsed = parseProviderFilter(query.text || '')
      if (parsed.providerFilter) {
        query.text = parsed.text
        log.debug(
          `Provider filter detected: @${parsed.providerFilter}, query.len=${query.text?.length ?? 0}, query.hash=${toQueryHash(query.text || '')}`
        )
      }
      const resolved = await resolveClipboardInputs(query.inputs)
      if (resolved.resolvedCount > 0) {
        log.debug('Resolved clipboard inputs', {
          meta: { resolvedCount: resolved.resolvedCount, clipboardIds: resolved.clipboardIds }
        })
      }
      const providerConfigSignature = this.deps.getProviderConfigSignature()
      return {
        providerFilter: parsed.providerFilter,
        providerConfigSignature,
        cacheKey: buildSearchCacheKey(query, parsed.providerFilter, this.deps.getActivations(), {
          providerConfigSignature
        }),
        durationMs: performance.now() - startedAt
      }
    } finally {
      dispose()
    }
  }

  aggregate(
    providers: ISearchProvider<ProviderContext>[],
    query: TuffQuery,
    options: { providerFilter?: string }
  ): { providers: ISearchProvider<ProviderContext>[]; durationMs: number } {
    const startedAt = performance.now()
    const dispose = enterPerfContext('Search.pipeline.providers', {
      providerCount: providers.length,
      inputCount: query.inputs?.length || 0,
      providerFilter: options.providerFilter || undefined
    })
    try {
      let selected = providers
      const inputTypes = query.inputs?.map((input) => input.type) ?? []
      if (inputTypes.some((type) => type !== TuffInputType.Text)) {
        selected = selected.filter(
          (provider) =>
            provider.id === 'plugin-features' ||
            inputTypes.some((type) => provider.supportedInputTypes?.includes(type))
        )
      }
      if (options.providerFilter)
        selected = selected.filter((provider) =>
          matchesProviderFilter(provider.id, options.providerFilter!)
        )
      if (!options.providerFilter && !this.deps.getActivations()?.size)
        selected = selected.filter((provider) => !this.deps.shouldSkipProvider(provider.id))
      return {
        providers: this.routeWindowsFileProviders(selected, query, options.providerFilter),
        durationMs: performance.now() - startedAt
      }
    } finally {
      dispose()
    }
  }

  appendCompatibilityNotice(
    items: TuffItem[],
    query: TuffQuery,
    providerFilter?: string
  ): TuffItem[] {
    if (
      items.length > 0 ||
      process.platform !== 'win32' ||
      !(
        isExplicitEverythingProviderFilter(providerFilter) ||
        isExplicitFileProviderFilter(providerFilter) ||
        isExplicitFileCategoryFilter(providerFilter)
      )
    )
      return items
    const notice = everythingProvider.buildUnavailableNotice(query)
    return notice ? [notice] : items
  }

  private routeWindowsFileProviders(
    providers: ISearchProvider<ProviderContext>[],
    query: TuffQuery,
    providerFilter?: string
  ): ISearchProvider<ProviderContext>[] {
    if (process.platform !== 'win32') return providers
    const everything = providers.find((provider) => provider.id === 'everything-provider')
    const file = providers.find((provider) => provider.id === 'file-provider')
    if (!everything && !file) return providers
    let selectedFileProviderId: 'everything-provider' | 'file-provider' | null
    if (isExplicitEverythingProviderFilter(providerFilter)) {
      selectedFileProviderId = everything ? 'everything-provider' : null
    } else if (isExplicitFileProviderFilter(providerFilter)) {
      selectedFileProviderId = file ? 'file-provider' : null
    } else if (isExplicitFileCategoryFilter(providerFilter)) {
      selectedFileProviderId =
        fileProvider.hasSearchFilters(query.text || '') || !everythingProvider.isSearchReady()
          ? file
            ? 'file-provider'
            : null
          : everything
            ? 'everything-provider'
            : null
    } else {
      selectedFileProviderId =
        fileProvider.hasSearchFilters(query.text || '') || !everythingProvider.isSearchReady()
          ? file
            ? 'file-provider'
            : null
          : everything
            ? 'everything-provider'
            : null
    }
    const keepWindowsShell =
      providerFilter === undefined || isExplicitFileCategoryFilter(providerFilter)
    return providers.filter((provider) => {
      if (provider.id === 'windows-shell-file-provider') return keepWindowsShell
      if (provider.id !== 'everything-provider' && provider.id !== 'file-provider') return true
      return provider.id === selectedFileProviderId
    })
  }
}
