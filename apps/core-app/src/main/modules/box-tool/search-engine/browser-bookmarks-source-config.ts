import type { SearchProviderDescriptor } from '@talex-touch/utils/search'
import {
  getSearchProviderIdsForIndexedSource,
  isIndexedSourceEnabledByProviderConfig,
  resolveIndexedSourceProviderConfigEnablement
} from '@talex-touch/utils/search'
import {
  BROWSER_BOOKMARKS_INDEXED_SOURCE_ID,
  buildBrowserBookmarksOfficialProviderDescriptor
} from './browser-bookmarks-indexed-source'
import { getSearchProviderUserConfigs } from './search-provider-config'

const BROWSER_BOOKMARKS_PROVIDER_LINKS: SearchProviderDescriptor[] = [
  buildBrowserBookmarksOfficialProviderDescriptor()
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

export function getBrowserBookmarksSourceEnablement() {
  return resolveIndexedSourceProviderConfigEnablement(
    BROWSER_BOOKMARKS_INDEXED_SOURCE_ID,
    getBrowserBookmarksLinkedProviderIds(),
    getSearchProviderUserConfigs()
  )
}
