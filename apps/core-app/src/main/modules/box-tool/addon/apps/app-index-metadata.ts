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
  appIdentity?: string | null
  path: string
}): string {
  return value.appIdentity || value.stableId || value.path || value.bundleId || ''
}

export function resolveAppItemIds(value: {
  bundleId?: string | null
  stableId?: string | null
  appIdentity?: string | null
  path: string
}): string[] {
  return normalizeStringList([
    resolveAppItemId(value),
    value.appIdentity,
    value.stableId,
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
  if (!isManagedEntryExtensionMap(extensions)) {
    return true
  }
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
