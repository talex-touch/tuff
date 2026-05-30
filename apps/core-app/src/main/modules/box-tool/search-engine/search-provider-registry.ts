import type {
  IndexedSourceDiagnostics,
  SearchProviderDescriptor,
  SearchProviderUserConfig
} from '@talex-touch/utils/search'
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import {
  getSearchProviderIdsForIndexedSource,
  normalizeSearchProviderUserConfigs
} from '@talex-touch/utils/search'

export interface SearchProviderRegistrySnapshotInput {
  indexedSources: IndexedSourceDiagnostics[]
  plugins?: Iterable<Pick<ITouchPlugin, 'name' | 'searchProviders'>>
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

export function collectSearchProviderDescriptors(
  input: Pick<SearchProviderRegistrySnapshotInput, 'indexedSources' | 'plugins'>
): SearchProviderDescriptor[] {
  const descriptors = [
    ...input.indexedSources.map(toIndexedSearchProviderDescriptor),
    ...collectPluginSearchProviderDescriptors(input.plugins)
  ]
  const seen = new Set<string>()

  return descriptors.filter((descriptor) => {
    if (seen.has(descriptor.id)) return false
    seen.add(descriptor.id)
    return true
  })
}

export function buildSearchProviderRegistrySnapshot(input: SearchProviderRegistrySnapshotInput) {
  const availableProviders = collectSearchProviderDescriptors(input)
  return {
    providers: normalizeSearchProviderUserConfigs(availableProviders, input.userConfigs),
    availableProviders,
    sourceLinks: collectSearchProviderSourceLinks(input, availableProviders)
  }
}

export function collectSearchProviderIdsForIndexedSource(
  sourceId: string,
  input: Pick<SearchProviderRegistrySnapshotInput, 'indexedSources' | 'plugins'>
): string[] {
  return getSearchProviderIdsForIndexedSource(sourceId, collectSearchProviderDescriptors(input))
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
