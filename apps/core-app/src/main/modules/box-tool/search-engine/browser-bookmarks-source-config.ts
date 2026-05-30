import type { SearchProviderDescriptor } from '@talex-touch/utils/search'
import {
  getSearchProviderIdsForIndexedSource,
  isIndexedSourceEnabledByProviderConfig
} from '@talex-touch/utils/search'
import { BROWSER_BOOKMARKS_INDEXED_SOURCE_ID } from './browser-bookmarks-indexed-source'
import { getSearchProviderUserConfigs } from './search-provider-config'

const BROWSER_BOOKMARKS_PROVIDER_LINKS: SearchProviderDescriptor[] = [
  {
    id: 'touch-browser-data.browser-bookmarks',
    displayName: 'Browser Bookmarks',
    kind: 'browser-bookmark',
    owner: 'official-plugin',
    mode: 'push',
    priority: 'fast',
    defaultOrder: 60,
    policy: {
      owner: 'official-plugin',
      mode: 'push',
      permissionScopes: ['root-results', 'browser-data'],
      defaultState: 'ask',
      requiresUserConsent: true,
      pushesToRootResults: true,
      indexedSourceId: BROWSER_BOOKMARKS_INDEXED_SOURCE_ID
    }
  }
]

export function getBrowserBookmarksLinkedProviderIds(
  descriptors: SearchProviderDescriptor[] = BROWSER_BOOKMARKS_PROVIDER_LINKS
): string[] {
  return getSearchProviderIdsForIndexedSource(BROWSER_BOOKMARKS_INDEXED_SOURCE_ID, descriptors)
}

export function isBrowserBookmarksSourceEnabled(): boolean {
  return isIndexedSourceEnabledByProviderConfig(
    BROWSER_BOOKMARKS_INDEXED_SOURCE_ID,
    getBrowserBookmarksLinkedProviderIds(),
    getSearchProviderUserConfigs()
  )
}
