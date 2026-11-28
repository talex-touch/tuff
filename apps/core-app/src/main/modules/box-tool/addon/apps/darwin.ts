import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { normalizeFsPath } from '@talex-touch/utils/common/file-scan-utils'
import { execFileSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { iconService } from '../../../../service/icon-service'
import { readFile as readPlist } from 'simple-plist'
import { reportAppScanError } from './app-error-reporter'
import type { AppDisplayNameQuality, ScannedAppInfo } from './app-types'
import { resolveScannedAppCreatedAt } from './app-types'
import { readLocalizedStringsFile } from './localized-strings-parser'
import { createLogger } from '../../../../utils/logger'
import { getLocale } from '../../../../utils/i18n-helper'

const darwinAppLog = createLogger('AppScanner').child('Darwin')

const SPOTLIGHT_APP_QUERY = 'kMDItemContentType == "com.apple.application-bundle"'

/**
 * How far below a search root the folder walk looks for bundles: `/Applications/<App>.app` is
 * level 1, and `/Applications/Utilities/<App>.app` or a vendor folder is level 2. The app watcher
 * on `/Applications` reports changes down to that same level, so the walk never lists a bundle the
 * watcher could not report again.
 */
const APP_FOLDER_WALK_MAX_DEPTH = 2

/** Folders that are packages themselves; nothing inside one is a separate launchable app. */
const PACKAGE_FOLDER_PATTERN =
  /\.(?:bundle|framework|plugin|appex|xpc|kext|prefpane|systemextension|component|qlgenerator|mdimporter|saver|wdgt)$/i

/**
 * Spotlight alone left installed apps out of the index whenever its index was off or still being
 * rebuilt, as after an OS update; a failed query left the whole scan empty. The startup health
 * probe saw those bundles on disk, but the backfill it triggered asked Spotlight again and got the
 * same answer. The scan therefore takes the union of Spotlight and a bounded walk of the same roots:
 * Spotlight still contributes bundles nested deeper than the walk, and the walk contributes what
 * Spotlight has not indexed.
 *
 * @param searchRoots Tests point this at fixture folders; production always scans the system roots.
 */
export async function getApps(
  searchRoots: readonly string[] = getDarwinAppSearchRoots()
): Promise<ScannedAppInfo[]> {
  const roots = await resolveExistingRoots(searchRoots)
  const [spotlightPaths, folderPaths] = await Promise.all([
    findAppPathsViaSpotlight(roots),
    findAppPathsInFolders(roots)
  ])
  const spotlightAppPaths = mergeAppPaths(spotlightPaths ?? [])
  const appPaths = mergeAppPaths(spotlightAppPaths, folderPaths)

  if (spotlightPaths === null || appPaths.length > spotlightAppPaths.length) {
    darwinAppLog.info('App folders hold bundles Spotlight did not list', {
      meta: {
        spotlight: spotlightPaths === null ? 'failed' : spotlightAppPaths.length,
        folders: folderPaths.length,
        added: appPaths.length - spotlightAppPaths.length
      }
    })
  }

  return resolveAppInfos(appPaths)
}

// Helper to parse plist content with regex
function getValueFromPlist(content: string, key: string): string | null {
  const regex = new RegExp(`<key>${key}</key>\\s*<string>(.*?)</string>`)
  const match = content.match(regex)
  return match ? match[1] : null
}

// Promisified wrapper for simple-plist readFile (callback-based)
function readPlistAsync(filePath: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    readPlist(filePath, (err: Error | null, data: unknown) => {
      if (err) reject(err)
      else resolve((data ?? {}) as Record<string, unknown>)
    })
  })
}

export function extractLocalizedDisplayName(data: Record<string, unknown>): string | null {
  const displayName = data.CFBundleDisplayName
  if (typeof displayName === 'string' && displayName.trim()) {
    return displayName.trim()
  }

  const bundleName = data.CFBundleName
  if (typeof bundleName === 'string' && bundleName.trim()) {
    return bundleName.trim()
  }

  return null
}

function normalizeDisplayNameCandidate(rawValue: string | null | undefined): string | null {
  if (!rawValue) {
    return null
  }

  const normalizedValue = rawValue.trim()
  if (!normalizedValue || normalizedValue === '(null)') {
    return null
  }

  if (normalizedValue.endsWith('.app')) {
    return normalizedValue.slice(0, -4).trim() || null
  }

  return normalizedValue
}

function resolveDarwinDisplayName(
  localizedName: string | null,
  plistDisplayName: string | null,
  bundleName: string | null,
  fileName: string
): {
  displayName: string | null
  displayNameSource: string
  displayNameQuality: AppDisplayNameQuality
} {
  const candidates: Array<{
    value: string | null
    source: string
    quality: AppDisplayNameQuality
  }> = [
    { value: localizedName, source: 'InfoPlist.strings', quality: 'localized' },
    {
      value: normalizeDisplayNameCandidate(plistDisplayName),
      source: 'CFBundleDisplayName',
      quality: 'manifest'
    },
    {
      value: normalizeDisplayNameCandidate(bundleName),
      source: 'CFBundleName',
      quality: 'manifest'
    },
    { value: fileName, source: 'filename', quality: 'filename' }
  ]

  const matched = candidates.find((candidate) => candidate.value)
  return {
    displayName: matched?.value ?? null,
    displayNameSource: matched?.source ?? 'fallback',
    displayNameQuality: matched?.quality ?? 'fallback'
  }
}

function collectAlternateDisplayNames(
  displayName: string | null,
  candidates: Array<string | null | undefined>
): string[] {
  const normalizedDisplayName = displayName?.toLowerCase()
  const seen = new Set<string>()
  const alternateNames: string[] = []

  for (const candidate of candidates) {
    const normalized = normalizeDisplayNameCandidate(candidate)
    if (!normalized) continue

    const lookupKey = normalized.toLowerCase()
    if (lookupKey === normalizedDisplayName || seen.has(lookupKey)) continue

    seen.add(lookupKey)
    alternateNames.push(normalized)
  }

  return alternateNames
}

function isTruthyPlistFlag(value: unknown): boolean {
  if (value === true || value === 1) return true
  if (typeof value !== 'string') return false
  return ['1', 'true', 'yes'].includes(value.trim().toLowerCase())
}

function isNonUserFacingCoreServiceApp(
  appPath: string,
  plistData: Record<string, unknown>
): boolean {
  const normalizedPath = appPath.replace(/\\/g, '/').toLowerCase()
  if (!normalizedPath.startsWith('/system/library/coreservices/')) return false

  return isTruthyPlistFlag(plistData.LSBackgroundOnly) || isTruthyPlistFlag(plistData.LSUIElement)
}

// Helper to get localized display names from .lproj directories (both Chinese and English)
interface LocalizedNameCandidates {
  zh: string | null
  en: string | null
  primary: string | null
}

async function getLocalizedDisplayNames(appPath: string): Promise<LocalizedNameCandidates> {
  const resourcesPath = path.join(appPath, 'Contents', 'Resources')
  const zhLprojs = ['zh-Hans.lproj', 'zh_CN.lproj', 'zh-Hant.lproj', 'zh_TW.lproj']
  const enLprojs = ['en.lproj', 'en_US.lproj', 'en_GB.lproj', 'Base.lproj']

  let zhName: string | null = null
  let enName: string | null = null
  try {
    // 1. Prioritize modern macOS system application InfoPlist.loctable
    const loctablePath = path.join(resourcesPath, 'InfoPlist.loctable')
    try {
      const loctable = await readPlistAsync(loctablePath)
      if (loctable && typeof loctable === 'object') {
        const zhKeys = ['zh_CN', 'zh-Hans', 'zh_Hans', 'zh_HK', 'zh_TW', 'zh-Hant']
        const enKeys = ['en', 'en_US', 'en_GB', 'en_AU', 'en_CA', 'Base']
        for (const key of zhKeys) {
          const entry = loctable[key] as Record<string, unknown> | undefined
          if (entry && typeof entry === 'object') {
            const name = extractLocalizedDisplayName(entry)
            if (name) {
              zhName = name
              break
            }
          }
        }
        for (const key of enKeys) {
          const entry = loctable[key] as Record<string, unknown> | undefined
          if (entry && typeof entry === 'object') {
            const name = extractLocalizedDisplayName(entry)
            if (name) {
              enName = name
              break
            }
          }
        }
      }
    } catch {
      // InfoPlist.loctable does not exist or failed to parse, continue to lproj directories
    }

    // 2. Check traditional .lproj directories if names were not found in loctable
    if (!zhName || !enName) {
      const files = await fs.readdir(resourcesPath).catch(() => [])
      const availableLprojs = files.filter((f) => f.endsWith('.lproj'))

      const readLprojName = async (lprojs: string[]): Promise<string | null> => {
        for (const lproj of lprojs) {
          if (!availableLprojs.includes(lproj)) continue
          const stringsPath = path.join(resourcesPath, lproj, 'InfoPlist.strings')
          try {
            const data = await readPlistAsync(stringsPath)
            const name = extractLocalizedDisplayName(data)
            if (name) return name
          } catch {
            try {
              const parsed = await readLocalizedStringsFile(stringsPath)
              const name = extractLocalizedDisplayName(parsed)
              if (name) return name
            } catch {
              // continue
            }
          }
        }
        return null
      }

      if (!zhName) zhName = await readLprojName(zhLprojs)
      if (!enName) enName = await readLprojName(enLprojs)
    }
  } catch {
    // Resources directory doesn't exist
  }

  const isZh = (() => {
    try {
      return getLocale().startsWith('zh')
    } catch {
      return true
    }
  })()

  const primary = isZh ? zhName || enName : enName || zhName
  return { zh: zhName, en: enName, primary }
}

// The core logic for fetching app info, designed to throw errors on failure.
async function getAppInfoUnstable(appPath: string): Promise<ScannedAppInfo | null> {
  const plistPath = path.join(appPath, 'Contents', 'Info.plist')

  // Pre-check if Info.plist exists before proceeding
  try {
    await fs.access(plistPath, fs.constants.F_OK)
  } catch (err) {
    // If Info.plist doesn't exist, this is not a valid/complete app bundle.
    // Preserve the original error code so retrier can detect ENOENT
    const error = new Error(`Info.plist not found at ${plistPath}`) as Error & { code?: string }
    error.code = (err as NodeJS.ErrnoException).code
    throw error
  }

  const stats = await fs.stat(appPath)
  const plistContent = await fs.readFile(plistPath, 'utf-8')
  const plistData: Record<string, unknown> = await readPlistAsync(plistPath).catch(() => ({}))
  if (isNonUserFacingCoreServiceApp(appPath, plistData)) {
    return null
  }

  // Get names from Info.plist
  const plistDisplayName = getValueFromPlist(plistContent, 'CFBundleDisplayName')
  const bundleName = getValueFromPlist(plistContent, 'CFBundleName')
  const fileName = path.basename(appPath, '.app')

  // Try to get localized display names (both Chinese and English)
  const localized = await getLocalizedDisplayNames(appPath)
  const localizedName = localized.primary

  // mdls display-name corrections are handled by the background mdls scan.
  const displayNameMeta = resolveDarwinDisplayName(
    localizedName,
    plistDisplayName,
    bundleName,
    fileName
  )
  const displayName = displayNameMeta.displayName
  const alternateNames = collectAlternateDisplayNames(displayName, [
    localized.zh,
    localized.en,
    plistDisplayName,
    bundleName,
    fileName
  ])

  // `name` is always the file name
  const name = fileName

  const rawBundleId = getValueFromPlist(plistContent, 'CFBundleIdentifier') || ''
  const bundleId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(rawBundleId) ? rawBundleId : ''
  const version =
    getValueFromPlist(plistContent, 'CFBundleShortVersionString') ||
    getValueFromPlist(plistContent, 'CFBundleVersion') ||
    undefined
  // Scans only read the cache. Missing icons hydrate after indexing completes.
  const icon = (await iconService.getCachedAppIcon(appPath, bundleId)) ?? ''

  return {
    name,
    displayName: displayName || undefined,
    displayNameSource: displayNameMeta.displayNameSource,
    displayNameQuality: displayNameMeta.displayNameQuality,
    identityKind: 'macos-path',
    fileName,
    alternateNames: alternateNames.length > 0 ? alternateNames : undefined,
    path: appPath,
    icon,
    bundleId,
    ...(version ? { version } : {}),
    uniqueId: bundleId || appPath,
    stableId: appPath,
    launchKind: 'path',
    launchTarget: appPath,
    displayPath: appPath,
    lastModified: stats.mtime,
    createdAt: resolveScannedAppCreatedAt(stats)
  }
}

export async function getAppInfo(appPath: string): Promise<ScannedAppInfo | null> {
  // Pre-condition check, no need to retry this
  if (!appPath || !appPath.endsWith('.app')) {
    return null
  }

  try {
    return await getAppInfoUnstable(appPath)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : typeof error === 'string' ? error : String(error)
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: string }).code
        : undefined
    if (code === 'ENOENT') {
      darwinAppLog.debug('Skipping invalid app bundle without Info.plist', {
        meta: { pathLength: appPath.length, message: errorMessage, code }
      })
    } else {
      darwinAppLog.warn('Failed to get app info', {
        error,
        meta: { pathLength: appPath.length, message: errorMessage, code }
      })
    }
    if (code !== 'ENOENT') {
      reportAppScanError({
        platform: process.platform,
        path: appPath,
        message: errorMessage,
        timestamp: Date.now(),
        cause: error
      })
    }
    return null
  }
}

function getDarwinAppSearchRoots(): string[] {
  return [
    '/Applications',
    '/System/Applications',
    '/System/Library/CoreServices',
    path.join(os.homedir(), 'Applications')
  ]
}

async function resolveExistingRoots(roots: readonly string[]): Promise<string[]> {
  const existingRoots: string[] = []
  for (const root of roots) {
    try {
      await fs.access(root)
      existingRoots.push(root)
    } catch {
      // ignore missing roots
    }
  }
  return existingRoots
}

/** Resolves to `null` when Spotlight could not answer, which an empty index cannot be told from. */
async function findAppPathsViaSpotlight(roots: readonly string[]): Promise<string[] | null> {
  // Without `-onlyin` mdfind searches every volume.
  if (roots.length === 0) return []

  const args = roots.flatMap((root) => ['-onlyin', root])
  args.push(SPOTLIGHT_APP_QUERY)
  try {
    const { stdout } = await execFileSafe('mdfind', args, { maxBuffer: 1024 * 1024 * 10 })
    return stdout
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p.endsWith('.app'))
  } catch (error) {
    darwinAppLog.warn('Spotlight app query failed, listing app folders only', { error })
    return null
  }
}

/**
 * Lists the `.app` bundles in the search roots without Spotlight. Hidden folders (update staging
 * such as `/Applications/.<app>-update`) are skipped, and so is a folder that cannot be read; that
 * one is left to Spotlight.
 *
 * A symlinked bundle is listed under the link only when its target lies outside every root, which
 * is what Spotlight does: `/Applications/Safari.app` links into the Safari cryptex and is listed
 * at the link, while `/Applications/Utilities/Feedback Assistant.app` links to a bundle listed
 * under its own path in `/System/Library/CoreServices`, and listing the link too would index that
 * app twice. Symlinked folders are not followed.
 */
async function findAppPathsInFolders(roots: readonly string[]): Promise<string[]> {
  const appPaths: string[] = []
  const linkedAppPaths: string[] = []

  const visit = async (folder: string, depth: number): Promise<void> => {
    let entries: Dirent[]
    try {
      entries = await fs.readdir(folder, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const entryPath = path.join(folder, entry.name)
      if (entry.isSymbolicLink()) {
        if (entry.name.endsWith('.app')) linkedAppPaths.push(entryPath)
      } else if (!entry.isDirectory()) {
        continue
      } else if (entry.name.endsWith('.app')) {
        appPaths.push(entryPath)
      } else if (depth < APP_FOLDER_WALK_MAX_DEPTH && !PACKAGE_FOLDER_PATTERN.test(entry.name)) {
        await visit(entryPath, depth + 1)
      }
    }
  }

  for (const root of roots) {
    await visit(root, 1)
  }

  const realRoots = await Promise.all(roots.map((root) => fs.realpath(root).catch(() => root)))
  for (const linkPath of linkedAppPaths) {
    const target = await resolveFolderLinkTarget(linkPath)
    if (!target || realRoots.some((root) => target.startsWith(`${root}${path.sep}`))) continue
    appPaths.push(linkPath)
  }
  return appPaths
}

async function resolveFolderLinkTarget(linkPath: string): Promise<string | null> {
  try {
    const target = await fs.realpath(linkPath)
    return (await fs.stat(target)).isDirectory() ? target : null
  } catch {
    return null
  }
}

/**
 * Keeps the first path seen for each bundle, so a bundle both sources list keeps Spotlight's
 * path, the one its row has always been stored under. Both sources hand out names as the
 * filesystem stores them, which can be decomposed, so paths are compared in composed form and
 * kept as found.
 */
export function mergeAppPaths(...sources: ReadonlyArray<readonly string[]>): string[] {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const source of sources) {
    for (const appPath of source) {
      const key = normalizeFsPath(appPath, 'darwin')
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(appPath)
    }
  }
  return merged
}

async function resolveAppInfos(appPaths: readonly string[]): Promise<ScannedAppInfo[]> {
  const appInfos = await mapWithConcurrency(appPaths, 4, async (appPath) => {
    try {
      return await getAppInfo(appPath)
    } catch {
      return null
    }
  })

  return appInfos.filter((app): app is ScannedAppInfo => !!app)
}

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return []
  }

  const results: R[] = Array.from({ length: items.length })
  let nextIndex = 0

  const workerCount = Math.min(Math.max(concurrency, 1), items.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const currentIndex = nextIndex++
      if (currentIndex >= items.length) {
        return
      }

      results[currentIndex] = await mapper(items[currentIndex])
      // Yield to the event loop every 5 items to prevent blocking
      if (currentIndex % 5 === 0) {
        await yieldToEventLoop()
      }
    }
  })

  await Promise.all(workers)
  return results
}
