import type { SearchProviderDescriptor } from '@talex-touch/utils/search'
import {
  getSearchProviderIdsForIndexedSource,
  isIndexedSourceEnabledByProviderConfig
} from '@talex-touch/utils/search'
import { QUICKLINKS_INDEXED_SOURCE_ID } from './quicklinks-indexed-source'
import { getSearchProviderUserConfigs } from './search-provider-config'

const QUICKLINKS_PROVIDER_LINKS: SearchProviderDescriptor[] = [
  {
    id: 'touch-browser-bookmarks.quicklinks',
    displayName: 'Browser Bookmarks',
    kind: 'quicklink',
    owner: 'official-plugin',
    mode: 'push',
    priority: 'fast',
    defaultOrder: 65,
    policy: {
      owner: 'official-plugin',
      mode: 'push',
      permissionScopes: ['root-results'],
      defaultState: 'ask',
      requiresUserConsent: true,
      pushesToRootResults: true,
      indexedSourceId: QUICKLINKS_INDEXED_SOURCE_ID
    }
  },
  {
    id: 'touch-dev-toolbox.dev-toolbox',
    displayName: 'Developer Toolbox',
    featureId: 'dev-toolbox',
    kind: 'quicklink',
    owner: 'official-plugin',
    mode: 'push',
    priority: 'fast',
    defaultOrder: 101,
    policy: {
      owner: 'official-plugin',
      mode: 'push',
      permissionScopes: ['root-results'],
      defaultState: 'ask',
      requiresUserConsent: true,
      pushesToRootResults: true,
      indexedSourceId: QUICKLINKS_INDEXED_SOURCE_ID
    }
  }
]

export function getQuicklinksLinkedProviderIds(
  descriptors: SearchProviderDescriptor[] = QUICKLINKS_PROVIDER_LINKS
): string[] {
  return getSearchProviderIdsForIndexedSource(QUICKLINKS_INDEXED_SOURCE_ID, descriptors)
}

export function isQuicklinksSourceEnabled(): boolean {
  return isIndexedSourceEnabledByProviderConfig(
    QUICKLINKS_INDEXED_SOURCE_ID,
    getQuicklinksLinkedProviderIds(),
    getSearchProviderUserConfigs(),
    { defaultEnabled: true }
  )
}
