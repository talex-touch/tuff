import type { TuffItem } from '@talex-touch/utils'
import type { DbUtils } from '../../../../db/utils'
import { matchNoisySystemAppRule } from '../../addon/apps/app-noise-filter'
import { mapAppsToRecommendationItems } from '../../addon/apps/search-processing-service'
import { isSelfAppIdentity } from '../../../system/self-app-identity'
import { createLogger } from '../../../../utils/logger'

const appSourceLog = createLogger('RecommendationEngine').child('AppSource')

export const APP_RECOMMENDATION_SOURCE_ID = 'app-provider'

/** `item_usage_stats` still carries both spellings for apps. */
export const APP_RECOMMENDATION_ALIASES = ['application', 'app'] as const

type AppRow = Awaited<ReturnType<DbUtils['getFilesByPaths']>>[number]
type AppWithExtensions = AppRow & { extensions: Record<string, string | null> }

/**
 * Attach each app's `file_extensions` rows, keyed by `fileId`.
 *
 * One batched read for the whole set; a per-app query here would be the N+1 the batched rebuild
 * contract exists to prevent.
 */
async function fetchExtensionsForApps(
  dbUtils: DbUtils,
  apps: AppRow[]
): Promise<AppWithExtensions[]> {
  const fileIds = apps.map((app) => app.id)
  const extensions = await dbUtils.getFileExtensionsByFileIds(fileIds)

  return apps.map((app) => ({
    ...app,
    extensions: extensions
      .filter((ext) => ext.fileId === app.id)
      .reduce(
        (acc, ext) => {
          acc[ext.key] = ext.value
          return acc
        },
        {} as Record<string, string | null>
      )
  }))
}

/**
 * Installed applications as a recommendation source.
 *
 * Registered as a standalone source rather than as an `AppProvider` capability for two reasons:
 * the catalog must be read through the engine's primary-bound `appCatalogDbUtils` handle (under
 * the search split the app catalog stays on the primary db, #295), and `addon/apps/app-provider`
 * imports back into `search-core → recommendation-engine`, so importing it from here would turn a
 * dynamic cycle into a static one.
 */
export function createAppRecommendationSource(appCatalogDbUtils: DbUtils): {
  sourceId: string
  aliases: readonly string[]
  rebuild(itemIds: readonly string[]): Promise<TuffItem[]>
} {
  return {
    sourceId: APP_RECOMMENDATION_SOURCE_ID,
    aliases: APP_RECOMMENDATION_ALIASES,
    async rebuild(itemIds) {
      if (itemIds.length === 0) return []

      try {
        // A candidate is stored under whichever identity the usage row carried: an absolute path
        // or a bundle id. The two need different lookups, and each stays batched.
        const paths = itemIds.filter((itemId) => itemId.startsWith('/'))
        const bundleIds = itemIds.filter((itemId) => !itemId.startsWith('/'))

        const [appsByPath, appsByBundleId] = await Promise.all([
          paths.length > 0 ? appCatalogDbUtils.getFilesByPaths(paths) : Promise.resolve([]),
          bundleIds.length > 0
            ? appCatalogDbUtils.getFilesByBundleIds(bundleIds)
            : Promise.resolve([])
        ])

        const apps = [...appsByPath, ...appsByBundleId]
        if (apps.length === 0) return []

        const appsWithExtensions = await fetchExtensionsForApps(appCatalogDbUtils, apps)

        // Both filters are load-bearing and invisible to the type system: without them the grid
        // recommends Touch itself and macOS CoreServices helpers.
        const recommendationApps = appsWithExtensions.filter(
          (app) =>
            !isSelfAppIdentity({
              executablePath: app.path,
              bundleId: app.extensions.bundleId
            }) &&
            !matchNoisySystemAppRule({
              path: app.path,
              bundleId: app.extensions.bundleId,
              name: app.displayName || app.name
            })
        )

        return mapAppsToRecommendationItems(recommendationApps)
      } catch (error) {
        appSourceLog.error('Failed to rebuild app items', {
          error,
          meta: { itemCount: itemIds.length }
        })
        return []
      }
    }
  }
}
