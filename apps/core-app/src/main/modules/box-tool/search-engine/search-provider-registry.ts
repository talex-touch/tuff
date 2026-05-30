import type {
  IndexedSourceDiagnostics,
  SearchProviderDescriptor,
  SearchProviderRegistryIssue,
  SearchProviderUserConfig
} from '@talex-touch/utils/search'
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import {
  getSearchProviderIdsForIndexedSource,
  normalizeSearchProviderUserConfigs
} from '@talex-touch/utils/search'

export interface SearchProviderRegistrySnapshotInput {
  indexedSources: IndexedSourceDiagnostics[]
  plugins?: Iterable<Pick<ITouchPlugin, 'name' | 'searchProviders' | 'issues'>>
  userConfigs?: SearchProviderUserConfig[]
}

export interface SearchProviderSourceLink {
  sourceId: string
  providerIds: string[]
}

export function toIndexedSearchProviderDescriptor(
  source: IndexedSourceDiagnostics
): SearchProviderDescriptor {
  return {
    id: source.descriptor.id,
    displayName: source.descriptor.displayName,
    kind: source.descriptor.kind,
    owner: source.descriptor.admission?.owner ?? 'core',
    mode: 'indexed',
    priority: source.descriptor.priority,
    defaultOrder: source.descriptor.priority === 'fast' ? 10 : 100,
    policy: {
      owner: source.descriptor.admission?.owner ?? 'core',
      mode: 'indexed',
      permissionScopes: source.descriptor.admission?.permissionScopes ?? ['none'],
      defaultState: source.descriptor.admission?.defaultState ?? 'enabled',
      requiresUserConsent: source.descriptor.admission?.requiresUserConsent,
      indexedSource: source.descriptor
    }
  }
}

export function collectPluginSearchProviderDescriptors(
  plugins: Iterable<Pick<ITouchPlugin, 'name' | 'searchProviders'>> = []
): SearchProviderDescriptor[] {
  const descriptors: SearchProviderDescriptor[] = []

  for (const plugin of plugins) {
    for (const provider of plugin.searchProviders ?? []) {
      descriptors.push({
        ...provider,
        policy: {
          ...provider.policy,
          permissionScopes: [...provider.policy.permissionScopes]
        }
      })
    }
  }

  return descriptors
}

export function collectPluginSearchProviderIssues(
  plugins: Iterable<Pick<ITouchPlugin, 'name' | 'issues'>> = []
): SearchProviderRegistryIssue[] {
  const issues: SearchProviderRegistryIssue[] = []

  for (const plugin of plugins) {
    for (const issue of plugin.issues ?? []) {
      if (typeof issue.code !== 'string' || !issue.code.startsWith('SEARCH_PROVIDER_')) {
        continue
      }

      issues.push({
        type: issue.type,
        code: issue.code as SearchProviderRegistryIssue['code'],
        message: issue.message,
        pluginName: plugin.name,
        providerId: typeof issue.meta?.providerId === 'string' ? issue.meta.providerId : undefined,
        source: issue.source,
        meta: isRecord(issue.meta) ? { ...issue.meta } : undefined
      })
    }
  }

  return issues
}

export function collectSearchProviderDescriptors(
  input: Pick<SearchProviderRegistrySnapshotInput, 'indexedSources' | 'plugins'>
): { descriptors: SearchProviderDescriptor[]; issues: SearchProviderRegistryIssue[] } {
  const descriptors = [
    ...input.indexedSources.map(toIndexedSearchProviderDescriptor),
    ...collectPluginSearchProviderDescriptors(input.plugins)
  ]
  const seen = new Set<string>()
  const issues: SearchProviderRegistryIssue[] = []

  const uniqueDescriptors = descriptors.filter((descriptor) => {
    if (seen.has(descriptor.id)) {
      issues.push({
        type: 'error',
        code: 'SEARCH_PROVIDER_ID_COLLISION',
        message: `Search provider '${descriptor.id}' was ignored because the provider id is already registered.`,
        providerId: descriptor.id,
        owner: descriptor.owner,
        mode: descriptor.mode,
        meta: {
          displayName: descriptor.displayName
        }
      })
      return false
    }
    seen.add(descriptor.id)
    return true
  })

  return {
    descriptors: uniqueDescriptors,
    issues
  }
}

export function buildSearchProviderRegistrySnapshot(input: SearchProviderRegistrySnapshotInput) {
  const plugins = [...(input.plugins ?? [])]
  const collected = collectSearchProviderDescriptors({
    indexedSources: input.indexedSources,
    plugins
  })
  const availableProviders = collected.descriptors
  return {
    providers: normalizeSearchProviderUserConfigs(availableProviders, input.userConfigs),
    availableProviders,
    sourceLinks: collectSearchProviderSourceLinks(input, availableProviders),
    issues: [...collectPluginSearchProviderIssues(plugins), ...collected.issues]
  }
}

export function collectSearchProviderIdsForIndexedSource(
  sourceId: string,
  input: Pick<SearchProviderRegistrySnapshotInput, 'indexedSources' | 'plugins'>
): string[] {
  return getSearchProviderIdsForIndexedSource(
    sourceId,
    collectSearchProviderDescriptors(input).descriptors
  )
}

export function collectSearchProviderSourceLinks(
  input: Pick<SearchProviderRegistrySnapshotInput, 'indexedSources'>,
  descriptors: SearchProviderDescriptor[]
): SearchProviderSourceLink[] {
  return input.indexedSources.map((source) => ({
    sourceId: source.descriptor.id,
    providerIds: getSearchProviderIdsForIndexedSource(source.descriptor.id, descriptors)
  }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
