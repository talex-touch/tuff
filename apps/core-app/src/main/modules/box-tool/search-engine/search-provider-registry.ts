import type { IProviderActivate, ISearchProvider } from '@talex-touch/utils'
import type {
  IndexedSourceDiagnostics,
  SearchProviderDescriptor,
  SearchProviderRegistryIssue,
  SearchProviderRuntimeConfig,
  SearchProviderUserConfig
} from '@talex-touch/utils/search'
import type { TouchApp } from '../../../core/touch-app'
import type { ProviderContext } from './types'
import {
  getSearchProviderIdsForIndexedSource,
  getSearchProviderUserConfigSignature,
  normalizeSearchProviderUserConfigs
} from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { enterPerfContext } from '../../../utils/perf-context'
import { databaseModule } from '../../database'
import type { OnboardingGateDecision } from '../../storage'
import { onboardingGate, storageModule } from '../../storage'
import { getActivationKey } from './search-core-utils'
import { getSearchProviderUserConfigs } from './search-provider-config'
import type { SearchIndexService } from './search-index-service'

const log = getLogger('search-engine')

const PROVIDER_LOAD_RETRY_BASE_MS = 1_000
const PROVIDER_LOAD_RETRY_MAX_MS = 30_000

export interface SearchProviderRegistryPluginIssue {
  type: 'error' | 'warning'
  code?: string
  message: string
  source?: string
  meta?: unknown
}

export interface SearchProviderRegistryPlugin {
  name: string
  searchProviders?: readonly SearchProviderDescriptor[]
  issues?: readonly SearchProviderRegistryPluginIssue[]
}

export interface SearchProviderRegistrySnapshotInput {
  indexedSources: readonly IndexedSourceDiagnostics[]
  plugins?: Iterable<SearchProviderRegistryPlugin>
  userConfigs?: SearchProviderUserConfig[]
}

export interface SearchProviderRegistrySnapshot {
  availableProviders: SearchProviderDescriptor[]
  providers: SearchProviderRuntimeConfig[]
  sourceLinks: Array<{ sourceId: string; providerIds: string[] }>
  issues: SearchProviderRegistryIssue[]
}

type DestroyableSearchProvider = ISearchProvider<ProviderContext> & {
  onDestroy?: () => void
}

const SEARCH_PROVIDER_ISSUE_CODES: Record<SearchProviderRegistryIssue['code'], true> = {
  SEARCH_PROVIDER_DERIVED_FROM_PUSH_FEATURE: true,
  SEARCH_PROVIDER_INVALID: true,
  SEARCH_PROVIDER_POLICY_BLOCKED: true,
  SEARCH_PROVIDER_PERMISSION_MISSING: true,
  SEARCH_PROVIDER_ID_COLLISION: true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toIndexedSourceProviderDescriptor(
  source: IndexedSourceDiagnostics,
  index: number
): SearchProviderDescriptor | null {
  const admission = source.descriptor.admission
  if (!admission) return null
  return {
    id: source.descriptor.id,
    displayName: source.descriptor.displayName,
    kind: source.descriptor.kind,
    owner: admission.owner,
    mode: 'indexed',
    priority: source.descriptor.priority,
    defaultOrder: index,
    policy: {
      owner: admission.owner,
      mode: 'indexed',
      permissionScopes: admission.permissionScopes,
      defaultState: admission.defaultState,
      requiresUserConsent: admission.requiresUserConsent
    }
  }
}

/** Creates the settings-facing provider registry from runtime sources and plugin descriptors. */
export function buildSearchProviderRegistrySnapshot(
  input: SearchProviderRegistrySnapshotInput
): SearchProviderRegistrySnapshot {
  const descriptors: SearchProviderDescriptor[] = []
  const issues: SearchProviderRegistryIssue[] = []
  const knownIds = new Set<string>()

  for (const [index, source] of input.indexedSources.entries()) {
    const descriptor = toIndexedSourceProviderDescriptor(source, index)
    if (!descriptor || knownIds.has(descriptor.id)) continue
    knownIds.add(descriptor.id)
    descriptors.push(descriptor)
  }

  for (const plugin of input.plugins ?? []) {
    for (const issue of plugin.issues ?? []) {
      if (!issue.code || !(issue.code in SEARCH_PROVIDER_ISSUE_CODES)) continue
      const code = issue.code as SearchProviderRegistryIssue['code']
      const providerId =
        isRecord(issue.meta) && typeof issue.meta.providerId === 'string'
          ? issue.meta.providerId
          : issue.source?.startsWith('searchProvider:')
            ? issue.source.slice('searchProvider:'.length)
            : undefined
      const meta = isRecord(issue.meta) ? issue.meta : undefined
      issues.push({
        type: issue.type,
        code,
        message: issue.message,
        pluginName: plugin.name,
        ...(providerId ? { providerId } : {}),
        ...(issue.source ? { source: issue.source } : {}),
        ...(meta ? { meta } : {})
      })
    }

    for (const descriptor of plugin.searchProviders ?? []) {
      if (knownIds.has(descriptor.id)) {
        issues.push({
          type: 'error',
          code: 'SEARCH_PROVIDER_ID_COLLISION',
          message: `Search provider '${descriptor.id}' was ignored because the provider id is already registered.`,
          providerId: descriptor.id,
          owner: descriptor.owner,
          mode: descriptor.mode,
          meta: { displayName: descriptor.displayName }
        })
        continue
      }
      knownIds.add(descriptor.id)
      descriptors.push(descriptor)
    }
  }

  return {
    availableProviders: descriptors,
    providers: normalizeSearchProviderUserConfigs(descriptors, input.userConfigs),
    sourceLinks: input.indexedSources.map((source) => ({
      sourceId: source.descriptor.id,
      providerIds: getSearchProviderIdsForIndexedSource(source.descriptor.id, descriptors)
    })),
    issues
  }
}

/** Resolves every registered provider associated with a runtime indexed source. */
export function collectSearchProviderIdsForIndexedSource(
  sourceId: string,
  input: Omit<SearchProviderRegistrySnapshotInput, 'userConfigs'>
): string[] {
  return (
    buildSearchProviderRegistrySnapshot(input).sourceLinks.find(
      (link) => link.sourceId === sourceId
    )?.providerIds ?? []
  )
}

export interface SearchProviderRegistryDeps {
  getTouchApp: () => TouchApp | null
  getSearchIndexService: () => SearchIndexService | null
  beforeProvidersLoad?: (reason: string) => Promise<void>
  onProvidersReady: () => Promise<void> | void
  onProviderDeactivated: (key: string, pluginFeature: boolean, allDeactivated: boolean) => void
}

export class SearchProviderRegistry {
  private readonly providers = new Map<string, ISearchProvider<ProviderContext>>()
  private providersToLoad: ISearchProvider<ProviderContext>[] = []
  private activatedProviders: Map<string, IProviderActivate> | null = null
  private providersLoaded = false
  private providerLoadPromise: Promise<void> | null = null
  private onboardingReadyUnsubscribe: (() => void) | null = null
  private providerLoadRetryTimer: NodeJS.Timeout | null = null
  private providerLoadRetryAttempt = 0
  private destroyed = false
  private lifecycleGeneration = 0
  private readonly ensureLoadedOperations = new Set<Promise<void>>()

  constructor(private readonly deps: SearchProviderRegistryDeps) {}

  register(provider: ISearchProvider<ProviderContext>): void {
    if (this.providers.has(provider.id)) {
      log.warn(`Search provider '${provider.id}' is already registered`)
      return
    }
    this.providers.set(provider.id, provider)
    log.info(`Search provider '${provider.id}' registered`)
    if (provider.onLoad) this.providersToLoad.push(provider)
  }

  unregister(providerId: string): void {
    const provider = this.providers.get(providerId)
    if (!provider) {
      log.warn(`Search provider '${providerId}' is not registered`)
      return
    }
    provider.onDeactivate?.()
    this.providers.delete(providerId)
    this.providersToLoad = this.providersToLoad.filter((candidate) => candidate.id !== providerId)
    log.info(`Search provider '${providerId}' unregistered`)
  }

  activate(activations: IProviderActivate[] | null): void {
    if (!activations?.length) {
      this.deactivateAll()
      return
    }
    const uniqueProviders = new Map<string, IProviderActivate>()
    for (const activation of activations) {
      const key = getActivationKey(activation)
      if (!uniqueProviders.has(key)) uniqueProviders.set(key, activation)
    }
    this.activatedProviders = uniqueProviders.size > 0 ? uniqueProviders : null
  }

  deactivate(key: string): void {
    const activation = this.activatedProviders?.get(key)
    if (!activation || !this.activatedProviders) return
    this.activatedProviders.delete(key)
    const allDeactivated = this.activatedProviders.size === 0
    this.deps.onProviderDeactivated(key, activation.id === 'plugin-features', allDeactivated)
    if (allDeactivated) this.activatedProviders = null
  }

  deactivateAll(): void {
    this.activatedProviders = null
    this.deps.onProviderDeactivated('*', false, true)
  }

  get(providerId: string): ISearchProvider<ProviderContext> | undefined {
    return this.providers.get(providerId)
  }

  getByIds(ids: string[]): ISearchProvider<ProviderContext>[] {
    return ids
      .map((id) => this.providers.get(id))
      .filter((provider): provider is ISearchProvider<ProviderContext> => Boolean(provider))
  }

  getActive(): ISearchProvider<ProviderContext>[] {
    return this.getActiveFor(this.activatedProviders)
  }

  getActiveFor(
    activations: ReadonlyMap<string, IProviderActivate> | null
  ): ISearchProvider<ProviderContext>[] {
    if (!activations) return this.applyUserConfig([...this.providers.values()])
    return this.getByIds([...new Set([...activations.values()].map((activation) => activation.id))])
  }

  getActivationState(): IProviderActivate[] | null {
    return this.activatedProviders ? [...this.activatedProviders.values()] : null
  }

  getActivationMap(): ReadonlyMap<string, IProviderActivate> | null {
    return this.activatedProviders
  }

  getConfigSignature(): string {
    return getSearchProviderUserConfigSignature(this.getUserConfigs())
  }

  private assertActive(generation = this.lifecycleGeneration): void {
    if (this.destroyed || generation !== this.lifecycleGeneration) {
      throw new Error('SEARCH_PROVIDER_REGISTRY_DESTROYED')
    }
  }

  ensureLoaded(reason: string): Promise<void> {
    const operation = this.ensureLoadedInternal(reason)
    this.ensureLoadedOperations.add(operation)
    operation.then(
      () => this.ensureLoadedOperations.delete(operation),
      () => this.ensureLoadedOperations.delete(operation)
    )
    return operation
  }

  private async ensureLoadedInternal(reason: string): Promise<void> {
    const generation = this.lifecycleGeneration
    this.assertActive(generation)
    if (this.providersLoaded) {
      await this.deps.onProvidersReady()
      this.assertActive(generation)
      this.providerLoadRetryAttempt = 0
      this.clearProviderLoadRetry()
      return
    }
    if (!this.providerLoadPromise) {
      this.providerLoadPromise = (async () => {
        await this.deps.beforeProvidersLoad?.(reason)
        this.assertActive(generation)
        await this.loadAll(reason, generation)
      })().finally(() => {
        this.providerLoadPromise = null
      })
    }
    await this.providerLoadPromise
    this.assertActive(generation)
    await this.deps.onProvidersReady()
    this.assertActive(generation)
    this.providerLoadRetryAttempt = 0
    this.clearProviderLoadRetry()
  }

  async loadWhenOnboardingAllows(reason: string): Promise<OnboardingGateDecision> {
    const decision = await onboardingGate.waitForDecision()
    if (decision.state === 'allowed') {
      this.clearOnboardingSubscription()
      await this.ensureLoaded(reason)
      return decision
    }

    this.deferUntilOnboardingReady()
    log.warn('Search provider startup deferred by onboarding gate', {
      meta: {
        state: decision.state,
        reason: decision.reason,
        recoverable: decision.recoverable
      }
    })
    return decision
  }

  deferUntilOnboardingReady(): void {
    if (this.onboardingReadyUnsubscribe) return

    this.onboardingReadyUnsubscribe = () => {}
    const unsubscribe = onboardingGate.subscribe((decision) => {
      if (decision.state !== 'allowed') return
      this.clearOnboardingSubscription()
      void this.ensureLoadedWithRetry('onboarding-complete')
    })

    if (this.onboardingReadyUnsubscribe) {
      this.onboardingReadyUnsubscribe = unsubscribe
    } else {
      unsubscribe()
    }
  }

  private async ensureLoadedWithRetry(reason: string): Promise<void> {
    try {
      await this.ensureLoaded(reason)
    } catch (error) {
      log.warn('Search provider startup failed; retry scheduled', { error })
      this.scheduleProviderLoadRetry()
    }
  }

  private scheduleProviderLoadRetry(): void {
    if (this.destroyed || this.providerLoadRetryTimer) return
    const delay = Math.min(
      PROVIDER_LOAD_RETRY_MAX_MS,
      PROVIDER_LOAD_RETRY_BASE_MS * 2 ** Math.min(this.providerLoadRetryAttempt, 5)
    )
    this.providerLoadRetryAttempt += 1
    this.providerLoadRetryTimer = setTimeout(() => {
      this.providerLoadRetryTimer = null
      void this.ensureLoadedWithRetry('provider-load-retry')
    }, delay)
    this.providerLoadRetryTimer.unref?.()
  }

  private clearProviderLoadRetry(): void {
    if (!this.providerLoadRetryTimer) return
    clearTimeout(this.providerLoadRetryTimer)
    this.providerLoadRetryTimer = null
  }

  clearOnboardingSubscription(): void {
    this.onboardingReadyUnsubscribe?.()
    this.onboardingReadyUnsubscribe = null
  }

  async destroy(): Promise<void> {
    this.destroyed = true
    this.lifecycleGeneration += 1
    this.clearProviderLoadRetry()
    this.clearOnboardingSubscription()
    const activeLoads = [...this.ensureLoadedOperations]
    if (activeLoads.length > 0) await Promise.allSettled(activeLoads)
    for (const provider of this.providers.values()) {
      try {
        const destroyableProvider = provider as DestroyableSearchProvider
        if (destroyableProvider.onDestroy) destroyableProvider.onDestroy()
        else provider.onDeactivate?.()
      } catch (error) {
        log.warn(`Provider '${provider.id}' cleanup failed`, { error })
      }
    }
    this.providers.clear()
    this.providersToLoad = []
    this.activatedProviders = null
    this.providersLoaded = false
  }

  private async loadAll(reason: string, generation: number): Promise<void> {
    const dispose = enterPerfContext('SearchEngine.loadProviders')
    try {
      this.assertActive(generation)
      log.debug(
        `Loading ${this.providersToLoad.length} providers sequentially (reason: ${reason})...`
      )
      while (this.providersToLoad.length > 0) {
        const provider = this.providersToLoad[0]!
        this.assertActive(generation)
        await this.load(provider)
        this.assertActive(generation)
        this.providersToLoad.shift()
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
      this.assertActive(generation)
      this.providersToLoad = []
      this.providersLoaded = true
      log.info('All providers loaded successfully')
    } finally {
      dispose()
    }
  }

  private async load(provider: ISearchProvider<ProviderContext>): Promise<void> {
    const touchApp = this.deps.getTouchApp()
    const searchIndex = this.deps.getSearchIndexService()
    if (!touchApp || !searchIndex) throw new Error('SEARCH_PROVIDER_CONTEXT_UNAVAILABLE')
    const startedAt = Date.now()
    try {
      await provider.onLoad?.({
        touchApp,
        databaseManager: databaseModule,
        storageManager: storageModule,
        searchIndex
      })
      log.info(`Provider '${provider.id}' loaded in ${Date.now() - startedAt}ms`)
    } catch (error) {
      log.error(`Failed to load provider '${provider.id}' after ${Date.now() - startedAt}ms`, {
        error
      })
      throw error
    }
  }

  private getUserConfigs() {
    return getSearchProviderUserConfigs()
  }

  private applyUserConfig(
    providers: ISearchProvider<ProviderContext>[]
  ): ISearchProvider<ProviderContext>[] {
    const configs = this.getUserConfigs()
    if (!configs.length) return providers
    const byId = new Map(configs.map((config) => [config.providerId, config]))
    return providers
      .filter((provider) => byId.get(provider.id)?.enabled !== false)
      .sort(
        (left, right) =>
          (byId.get(left.id)?.order ?? Number.MAX_SAFE_INTEGER) -
          (byId.get(right.id)?.order ?? Number.MAX_SAFE_INTEGER)
      )
  }
}
