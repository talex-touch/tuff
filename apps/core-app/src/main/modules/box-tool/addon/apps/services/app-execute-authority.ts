import { and, eq, inArray } from 'drizzle-orm'
import { fileExtensions, files as filesSchema } from '../../../../../db/schema'
import type { DbUtils } from '../../../../../db/utils'
import { APP_IDENTITY_EXTENSION_KEY, resolveAppItemIds } from '../app-index-metadata'
import { isWindowsUwpShellPath } from '../app-provider-path-utils'
import type { AppLaunchKind, ScannedAppInfo } from '../app-types'
import type { AppSearchCatalogService } from './app-search-catalog-service'

export type DbAppRecord = typeof filesSchema.$inferSelect
export type DbAppWithExtensions = DbAppRecord & { extensions: Record<string, string | null> }

export interface AuthoritativeAppExecuteDeps {
  searchCatalog: AppSearchCatalogService
  dbUtils: DbUtils | null
  fetchExtensionsForFiles: (files: DbAppRecord[]) => Promise<DbAppWithExtensions[]>
  mapDbAppToScannedInfo: (row: DbAppWithExtensions) => ScannedAppInfo
}

export interface AuthoritativeLaunchParams {
  name?: string
  path: string
  launchKind: AppLaunchKind
  launchTarget: string
  launchArgs?: string
  workingDirectory?: string
}

/**
 * Resolves the authoritative indexed app record for an execute request using only the
 * server-side catalog or SQLite app tables, ignoring any caller-supplied launch fields.
 */
export async function resolveAuthoritativeAppForExecute(
  deps: AuthoritativeAppExecuteDeps,
  itemId: string,
  hintedPath?: string
): Promise<ScannedAppInfo | null> {
  const normalizedItemId = itemId?.trim() || ''
  const normalizedHintedPath = hintedPath?.trim() || ''

  if (deps.searchCatalog.isReady()) {
    const fromCatalog =
      (normalizedItemId ? deps.searchCatalog.findRowByItemId(normalizedItemId) : null) ??
      (normalizedHintedPath ? deps.searchCatalog.findRowByItemId(normalizedHintedPath) : null)
    if (fromCatalog) {
      const mapped = deps.mapDbAppToScannedInfo(fromCatalog)
      if (!normalizedItemId || resolveAppItemIds(mapped).includes(normalizedItemId)) {
        return mapped
      }
    }
  }

  if (!deps.dbUtils) {
    return null
  }

  const candidates: DbAppRecord[] = []
  const seenIds = new Set<number>()
  const addCandidate = (record: DbAppRecord | null | undefined): void => {
    if (!record || record.type !== 'app' || seenIds.has(record.id)) return
    seenIds.add(record.id)
    candidates.push(record)
  }

  if (normalizedItemId && typeof deps.dbUtils.getFileByPath === 'function') {
    addCandidate(await deps.dbUtils.getFileByPath(normalizedItemId).catch(() => null))
  }
  if (
    normalizedHintedPath &&
    normalizedHintedPath !== normalizedItemId &&
    typeof deps.dbUtils.getFileByPath === 'function'
  ) {
    addCandidate(await deps.dbUtils.getFileByPath(normalizedHintedPath).catch(() => null))
  }

  if (candidates.length === 0 && normalizedItemId && typeof deps.dbUtils.getDb === 'function') {
    try {
      const db = deps.dbUtils.getDb()
      const extMatches = await db
        .select({ fileId: fileExtensions.fileId })
        .from(fileExtensions)
        .where(
          and(
            inArray(fileExtensions.key, [APP_IDENTITY_EXTENSION_KEY, 'bundleId']),
            eq(fileExtensions.value, normalizedItemId)
          )
        )
      const fileIds = Array.from(new Set(extMatches.map((row) => row.fileId)))
      if (fileIds.length > 0) {
        const matchedFiles = await db
          .select()
          .from(filesSchema)
          .where(and(eq(filesSchema.type, 'app'), inArray(filesSchema.id, fileIds)))
        for (const file of matchedFiles) {
          addCandidate(file)
        }
      }
    } catch {
      // Fallback lookup failed; refuse execution below
    }
  }

  if (candidates.length === 0) {
    return null
  }

  const withExtensions = await deps.fetchExtensionsForFiles(candidates)
  for (const row of withExtensions) {
    const mapped = deps.mapDbAppToScannedInfo(row)
    if (normalizedItemId && resolveAppItemIds(mapped).includes(normalizedItemId)) {
      return mapped
    }
  }
  for (const row of withExtensions) {
    if (normalizedHintedPath && row.path === normalizedHintedPath) {
      return deps.mapDbAppToScannedInfo(row)
    }
  }
  return null
}

export function buildAuthoritativeLaunchParams(
  authoritativeApp: ScannedAppInfo,
  fallbackTitle?: string
): AuthoritativeLaunchParams | null {
  const appPath = authoritativeApp.path
  if (!appPath) return null
  const launchKind: AppLaunchKind = authoritativeApp.launchKind || 'path'
  const rawLaunchTarget = authoritativeApp.launchTarget || appPath
  const launchTarget =
    launchKind === 'uwp' && isWindowsUwpShellPath(rawLaunchTarget)
      ? rawLaunchTarget.replace(/^shell:AppsFolder\\/i, '')
      : rawLaunchTarget
  return {
    name: authoritativeApp.displayName || authoritativeApp.name || fallbackTitle,
    path: appPath,
    launchKind,
    launchTarget,
    launchArgs: authoritativeApp.launchArgs,
    workingDirectory: authoritativeApp.workingDirectory
  }
}

export async function resolveAuthoritativeExecuteLaunch(
  deps: AuthoritativeAppExecuteDeps,
  itemId: string,
  hintedPath?: string,
  fallbackTitle?: string
): Promise<
  { status: 'ok'; params: AuthoritativeLaunchParams } | { status: 'refused' | 'missing-path' }
> {
  const authoritativeApp = await resolveAuthoritativeAppForExecute(deps, itemId, hintedPath)
  if (!authoritativeApp) {
    return { status: 'refused' }
  }
  const params = buildAuthoritativeLaunchParams(authoritativeApp, fallbackTitle)
  if (!params) {
    return { status: 'missing-path' }
  }
  return { status: 'ok', params }
}
