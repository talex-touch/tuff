import { and, eq, inArray, sql } from 'drizzle-orm'
import type { CoreDatabase, DbUtils } from '../../../../db/utils'
import { resolveMissingScannedExtensionKeys } from './app-provider-metadata-sync'
import { fileExtensions } from '../../../../db/schema'
import type { AppDisplayNameQuality, AppIdentityKind, ScannedAppInfo } from './app-types'
import { normalizeStringList, parseStringList, serializeStringList } from './app-utils'

export type AppExtensionInsert = { fileId: number; key: string; value: string }
export type AppExtensionMap = Record<string, string | null>

export const APP_IDENTITY_EXTENSION_KEY = 'appIdentity'
export const APP_LAUNCH_KIND_EXTENSION_KEY = 'launchKind'
export const APP_LAUNCH_TARGET_EXTENSION_KEY = 'launchTarget'
export const APP_LAUNCH_ARGS_EXTENSION_KEY = 'launchArgs'
export const APP_WORKING_DIRECTORY_EXTENSION_KEY = 'workingDirectory'
export const APP_DISPLAY_PATH_EXTENSION_KEY = 'displayPath'

/**
 * Epoch milliseconds of when this machine first got the app, as an integer string.
 *
 * Written once and never refreshed, so recommendation ranking can tell a fresh install from an
 * in-place update. Deliberately absent from `APP_SCANNED_OPTIONAL_EXTENSION_KEYS`: that list drives
 * the stale-key sweep, and a scan that cannot re-derive the value must not delete it.
 */
export const APP_INSTALLED_AT_EXTENSION_KEY = 'installedAt'

/**
 * How an app path reached the index. `watch` means a filesystem event surfaced it while Touch was
 * running, which is itself evidence of an install; `scan` covers full syncs and backfills, where a
 * row can be years old.
 */
export type AppDiscoveryKind = 'watch' | 'scan'

/** Options for a pass that syncs extension rows for one app path. */
export interface AppExtensionSyncOptions {
  discovery?: AppDiscoveryKind
  /** True only when the caller knows this pass created the `files` row. */
  insertedRow?: boolean
}
export const APP_DESCRIPTION_EXTENSION_KEY = 'description'
export const APP_ALTERNATE_NAMES_EXTENSION_KEY = 'alternateNames'
export const APP_IDENTITY_KIND_EXTENSION_KEY = 'identityKind'
export const APP_DISPLAY_NAME_SOURCE_EXTENSION_KEY = 'displayNameSource'
export const APP_DISPLAY_NAME_QUALITY_EXTENSION_KEY = 'displayNameQuality'
export const APP_ENTRY_SOURCE_EXTENSION_KEY = 'entrySource'
export const APP_ENTRY_ENABLED_EXTENSION_KEY = 'entryEnabled'
export const APP_ENTRY_SOURCE_MANUAL = 'manual'
export const APP_IDENTIFIER_EXTENSION_KEYS = [APP_IDENTITY_EXTENSION_KEY, 'bundleId'] as const
export const APP_SCANNED_OPTIONAL_EXTENSION_KEYS = [
  APP_LAUNCH_ARGS_EXTENSION_KEY,
  APP_WORKING_DIRECTORY_EXTENSION_KEY,
  APP_DISPLAY_PATH_EXTENSION_KEY,
  APP_DESCRIPTION_EXTENSION_KEY,
  APP_ALTERNATE_NAMES_EXTENSION_KEY,
  'icon',
  APP_IDENTITY_KIND_EXTENSION_KEY,
  APP_DISPLAY_NAME_SOURCE_EXTENSION_KEY,
  APP_DISPLAY_NAME_QUALITY_EXTENSION_KEY
] as const

const APP_IDENTIFIER_EXTENSION_KEY_SET = new Set<string>(APP_IDENTIFIER_EXTENSION_KEYS)

type AppExtensionSource = Pick<
  ScannedAppInfo,
  | 'bundleId'
  | 'icon'
  | 'stableId'
  | 'uniqueId'
  | 'launchKind'
  | 'launchTarget'
  | 'launchArgs'
  | 'workingDirectory'
  | 'displayPath'
  | 'description'
  | 'alternateNames'
  | 'identityKind'
  | 'displayNameSource'
  | 'displayNameQuality'
>

function addExtension(
  extensions: AppExtensionInsert[],
  fileId: number,
  key: string,
  value: string | null | undefined
): void {
  if (value) {
    extensions.push({ fileId, key, value })
  }
}

export function isAppIdentifierExtensionKey(
  value: string | null | undefined
): value is (typeof APP_IDENTIFIER_EXTENSION_KEYS)[number] {
  return typeof value === 'string' && APP_IDENTIFIER_EXTENSION_KEY_SET.has(value)
}

export function resolveAppItemId(value: {
  bundleId?: string | null
  stableId?: string | null
  uniqueId?: string | null
  appIdentity?: string | null
  path: string
}): string {
  return value.stableId || value.appIdentity || value.uniqueId || value.path || value.bundleId || ''
}

export function resolveAppItemIds(value: {
  bundleId?: string | null
  stableId?: string | null
  uniqueId?: string | null
  appIdentity?: string | null
  path: string
}): string[] {
  return normalizeStringList([
    resolveAppItemId(value),
    value.appIdentity,
    value.stableId,
    value.uniqueId,
    value.path,
    value.bundleId
  ])
}

export function isManagedEntryExtensionMap(extensions: AppExtensionMap | undefined): boolean {
  return extensions?.[APP_ENTRY_SOURCE_EXTENSION_KEY] === APP_ENTRY_SOURCE_MANUAL
}

export function isManagedEntryEnabledExtensionMap(
  extensions: AppExtensionMap | undefined
): boolean {
  return isAppEntryEnabledExtensionMap(extensions)
}

export function isAppEntryEnabledExtensionMap(extensions: AppExtensionMap | undefined): boolean {
  const raw = extensions?.[APP_ENTRY_ENABLED_EXTENSION_KEY]
  return raw !== '0' && raw !== 'false'
}

export function normalizeAppDisplayNameQuality(
  value: string | null | undefined
): AppDisplayNameQuality | undefined {
  switch (value) {
    case 'localized':
    case 'system':
    case 'manifest':
    case 'registry':
    case 'filename':
    case 'fallback':
      return value
    default:
      return undefined
  }
}

export function shouldScanMdlsDisplayName(
  appInfo: Pick<ScannedAppInfo, 'displayName' | 'displayNameQuality'>
): boolean {
  if (!appInfo.displayName) return true
  return !['localized', 'system', 'registry'].includes(appInfo.displayNameQuality ?? '')
}

export function buildAppExtensions(fileId: number, app: AppExtensionSource): AppExtensionInsert[] {
  const extensions: AppExtensionInsert[] = []
  addExtension(extensions, fileId, 'bundleId', app.bundleId)
  addExtension(extensions, fileId, 'icon', app.icon)
  addExtension(extensions, fileId, APP_IDENTITY_EXTENSION_KEY, app.stableId || app.uniqueId)
  addExtension(extensions, fileId, APP_LAUNCH_KIND_EXTENSION_KEY, app.launchKind)
  addExtension(extensions, fileId, APP_LAUNCH_TARGET_EXTENSION_KEY, app.launchTarget)
  addExtension(extensions, fileId, APP_LAUNCH_ARGS_EXTENSION_KEY, app.launchArgs)
  addExtension(extensions, fileId, APP_WORKING_DIRECTORY_EXTENSION_KEY, app.workingDirectory)
  addExtension(extensions, fileId, APP_DISPLAY_PATH_EXTENSION_KEY, app.displayPath)
  addExtension(extensions, fileId, APP_DESCRIPTION_EXTENSION_KEY, app.description)
  addExtension(
    extensions,
    fileId,
    APP_ALTERNATE_NAMES_EXTENSION_KEY,
    serializeStringList(app.alternateNames)
  )
  addExtension(extensions, fileId, APP_IDENTITY_KIND_EXTENSION_KEY, app.identityKind)
  addExtension(extensions, fileId, APP_DISPLAY_NAME_SOURCE_EXTENSION_KEY, app.displayNameSource)
  addExtension(extensions, fileId, APP_DISPLAY_NAME_QUALITY_EXTENSION_KEY, app.displayNameQuality)
  return extensions
}

export function buildManagedEntryExtensions(
  fileId: number,
  app: AppExtensionSource,
  enabled: boolean
): AppExtensionInsert[] {
  return [
    ...buildAppExtensions(fileId, app),
    { fileId, key: APP_ENTRY_SOURCE_EXTENSION_KEY, value: APP_ENTRY_SOURCE_MANUAL },
    { fileId, key: APP_ENTRY_ENABLED_EXTENSION_KEY, value: enabled ? '1' : '0' }
  ]
}

export function readAppIdentityKind(value: string | null | undefined): AppIdentityKind | undefined {
  switch (value) {
    case 'macos-path':
    case 'macos-bundle':
    case 'windows-uwp':
    case 'windows-shortcut':
    case 'windows-path':
    case 'windows-protocol':
    case 'linux-desktop':
    case 'fallback':
      return value
    default:
      return undefined
  }
}

export function readAlternateNames(extensions: AppExtensionMap): string[] {
  return parseStringList(extensions[APP_ALTERNATE_NAMES_EXTENSION_KEY])
}

/**
 * Inserts extension rows that must never clobber what is already stored.
 *
 * `upsertAppExtensions` overwrites on conflict, which is right for metadata a scan re-derives
 * every pass. The install time is the opposite: the first value is the true one, and the callers
 * cannot tell an insert from an update anyway — `persistScannedAppAdditions` upserts on
 * `files.path` and hands every row `EMPTY_APP_EXTENSION_MAP`, so the write itself has to be the
 * thing that refuses to overwrite.
 */
/** The narrow write surface these helpers need; the provider re-exports its wider variants from here. */
export type AppFileWriteDb = Pick<CoreDatabase, 'insert' | 'delete'>

export async function insertMissingAppExtensions(
  writer: AppFileWriteDb | undefined,
  fallbackDb: () => AppFileWriteDb,
  extensions: Array<{ fileId: number; key: string; value: string }>
): Promise<void> {
  if (extensions.length === 0) return
  const insertWriter = writer ?? fallbackDb()
  await insertWriter
    .insert(fileExtensions)
    .values(extensions)
    .onConflictDoNothing({ target: [fileExtensions.fileId, fileExtensions.key] })
}

/**
 * Resolves the install time to record for a scanned app, or null when nothing trustworthy is
 * available. Scanners only report a birth time their filesystem actually vouches for, so an
 * absent one on a watch-discovered row means "the event is the best evidence we have".
 */
export function resolveScannedInstalledAt(
  app: Pick<ScannedAppInfo, 'createdAt'>,
  options?: AppExtensionSyncOptions
): number | null {
  const createdAtMs = app.createdAt?.getTime()
  if (typeof createdAtMs === 'number' && Number.isFinite(createdAtMs) && createdAtMs > 0) {
    return createdAtMs
  }

  // Only for a row this pass created: a `change` event on an app that has been installed for
  // months must not restart its freshness window.
  if (options?.discovery === 'watch' && options.insertedRow === true) {
    return Date.now()
  }

  return null
}

export async function upsertAppExtensions(
  writer: AppFileWriteDb | undefined,
  dbUtils: Pick<DbUtils, 'addFileExtensions'>,
  extensions: Array<{ fileId: number; key: string; value: string }>
): Promise<void> {
  if (extensions.length === 0) return
  if (!writer) {
    await dbUtils.addFileExtensions(extensions)
    return
  }
  await writer
    .insert(fileExtensions)
    .values(extensions)
    .onConflictDoUpdate({
      target: [fileExtensions.fileId, fileExtensions.key],
      set: { value: sql`excluded.value` }
    })
}

export async function syncScannedAppExtensions(
  fileId: number,
  app: Pick<
    ScannedAppInfo,
    | 'bundleId'
    | 'icon'
    | 'stableId'
    | 'uniqueId'
    | 'launchKind'
    | 'launchTarget'
    | 'launchArgs'
    | 'workingDirectory'
    | 'displayPath'
    | 'description'
    | 'alternateNames'
    | 'identityKind'
    | 'displayNameSource'
    | 'displayNameQuality'
    | 'createdAt'
  >,
  dbUtils: Pick<DbUtils, 'getDb' | 'addFileExtensions'>,
  writer?: AppFileWriteDb,
  existingExtensions?: Readonly<Record<string, string | null>>,
  options?: AppExtensionSyncOptions
): Promise<void> {
  const extensions = buildAppExtensions(fileId, app)
  await upsertAppExtensions(writer, dbUtils, extensions)

  // A known-stored install time short-circuits the write; an empty map only means the caller
  // could not tell, which the conflict clause below settles.
  if (!existingExtensions?.[APP_INSTALLED_AT_EXTENSION_KEY]) {
    const installedAt = resolveScannedInstalledAt(app, options)
    if (installedAt !== null) {
      await insertMissingAppExtensions(writer, () => dbUtils.getDb(), [
        { fileId, key: APP_INSTALLED_AT_EXTENSION_KEY, value: String(installedAt) }
      ])
    }
  }

  const missingExtensionKeys = resolveMissingScannedExtensionKeys(
    extensions,
    APP_SCANNED_OPTIONAL_EXTENSION_KEYS
  )
  const staleExtensionKeys = existingExtensions
    ? missingExtensionKeys.filter((key) => Object.hasOwn(existingExtensions, key))
    : missingExtensionKeys

  if (staleExtensionKeys.length > 0) {
    const deleteWriter = writer ?? dbUtils.getDb()
    await deleteWriter
      .delete(fileExtensions)
      .where(
        and(eq(fileExtensions.fileId, fileId), inArray(fileExtensions.key, staleExtensionKeys))
      )
  }
}
