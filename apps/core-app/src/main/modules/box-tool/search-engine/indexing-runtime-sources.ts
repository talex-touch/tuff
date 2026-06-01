import type { IndexingRuntime } from './indexing-runtime'
import { buildAppIndexedSource } from './app-indexed-source'
import { buildBrowserBookmarksIndexedSource } from './browser-bookmarks-indexed-source'
import { isBrowserBookmarksSourceEnabled } from './browser-bookmarks-source-config'
import { buildEverythingIndexedSource } from './everything-indexed-source'
import { buildFileIndexedSource } from './file-indexed-source'
import { buildQuicklinksIndexedSource } from './quicklinks-indexed-source'
import { isQuicklinksSourceEnabled } from './quicklinks-source-config'

export function registerCoreIndexedSources(runtime: IndexingRuntime): void {
  runtime.registerSource(buildAppIndexedSource())
  runtime.registerSource(buildFileIndexedSource())
  runtime.registerSource(buildEverythingIndexedSource())
  runtime.registerSource(
    buildQuicklinksIndexedSource({
      isEnabled: isQuicklinksSourceEnabled
    })
  )
  runtime.registerSource(
    buildBrowserBookmarksIndexedSource({
      isEnabled: isBrowserBookmarksSourceEnabled
    })
  )
}
