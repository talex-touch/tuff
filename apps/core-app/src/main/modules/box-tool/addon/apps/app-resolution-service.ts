import type { ResolvedApplication } from '@talex-touch/utils/transport/events/types'
import type { DbUtils } from '../../../../db/utils'
import type { ScannedAppInfo } from './app-types'
import { normalizeRenderableSource } from '../../../../utils/local-renderable-assets'

type DbApplication = Awaited<ReturnType<DbUtils['getFilesByPaths']>>[number]
export type DbApplicationWithExtensions = DbApplication & {
  extensions: Record<string, string | null>
}

interface ApplicationResolutionDependencies {
  dbUtils: DbUtils | null
  fetchExtensions: (applications: DbApplication[]) => Promise<DbApplicationWithExtensions[]>
  repairIconPointers: (applications: DbApplicationWithExtensions[]) => Promise<void>
  mapApplication: (application: DbApplicationWithExtensions) => ScannedAppInfo
  ensureIcon: (appPath: string, bundleId: string) => Promise<string | null>
  persistIcon: (appInfo: ScannedAppInfo, icon: string) => Promise<void>
}

export async function resolveApplicationProjection(
  identifier: string,
  dependencies: ApplicationResolutionDependencies
): Promise<ResolvedApplication | null> {
  const normalizedIdentifier = identifier.trim()
  if (!dependencies.dbUtils || !normalizedIdentifier || normalizedIdentifier.length > 512) {
    return null
  }

  const [pathMatches, bundleMatches] = await Promise.all([
    dependencies.dbUtils.getFilesByPaths([normalizedIdentifier]),
    dependencies.dbUtils.getFilesByBundleIds([normalizedIdentifier])
  ])
  const rowsById = new Map(
    [...pathMatches, ...bundleMatches]
      .filter((row) => row.type === 'app')
      .map((row) => [row.id, row])
  )
  const applications = await dependencies.fetchExtensions([...rowsById.values()])
  const application = applications.find(
    (candidate) =>
      candidate.path === normalizedIdentifier ||
      candidate.extensions.bundleId === normalizedIdentifier
  )
  if (!application) {
    return null
  }

  try {
    await dependencies.repairIconPointers([application])
  } catch {
    // A read-only application projection remains useful when pointer repair is unavailable.
  }

  const appInfo = dependencies.mapApplication(application)
  if (!appInfo.icon) {
    try {
      const hydratedIcon = await dependencies.ensureIcon(
        appInfo.iconSourcePath ?? appInfo.path,
        appInfo.bundleId
      )
      if (hydratedIcon) {
        appInfo.icon = hydratedIcon
        try {
          await dependencies.persistIcon(appInfo, hydratedIcon)
        } catch {
          // Keep the generated cache resource usable even if pointer persistence is busy.
        }
      }
    } catch {
      // Application identity is still returned when the platform has no icon.
    }
  }

  let icon: string | null = null
  if (appInfo.icon) {
    const normalizedIcon = normalizeRenderableSource(appInfo.icon)
    if (!('missing' in normalizedIcon) && normalizedIcon.value.startsWith('tfile:')) {
      icon = normalizedIcon.value
    }
  }

  const inputIsNativePath = /^(?:[a-z]:[\/]|[\/]{1,2}|shell:AppsFolder\\)/i.test(
    normalizedIdentifier
  )
  return {
    identifier:
      application.extensions.bundleId ||
      (inputIsNativePath ? application.name : normalizedIdentifier),
    displayName: appInfo.displayName || appInfo.name,
    icon
  }
}
