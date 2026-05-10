import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execFileSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { readFile as readPlist } from 'simple-plist'
import { reportAppScanError } from './app-error-reporter'
import type { ScannedAppInfo } from './app-types'
import { readLocalizedStringsFile } from './localized-strings-parser'
import { createLogger } from '../../../../utils/logger'

const ICON_CACHE_DIR = path.join(os.tmpdir(), 'talex-touch-app-icons')
const darwinAppLog = createLogger('AppScanner').child('Darwin')

export async function getApps(): Promise<ScannedAppInfo[]> {
  await fs.mkdir(ICON_CACHE_DIR, { recursive: true })
  // Switch to mdfind as the primary method for discovering applications for better coverage.
  return getAppsViaMdfind()
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

// Helper to get localized display name from .lproj directories
async function getLocalizedDisplayName(appPath: string): Promise<string | null> {
  const resourcesPath = path.join(appPath, 'Contents', 'Resources')

  // Priority order: zh-Hans (Simplified Chinese), zh_CN, zh-Hant, zh_TW, Base, en
  const lprojPriority = [
    'zh-Hans.lproj',
    'zh_CN.lproj',
    'zh-Hant.lproj',
    'zh_TW.lproj',
    'Base.lproj',
    'en.lproj'
  ]

  try {
    const files = await fs.readdir(resourcesPath).catch(() => [])

    // Find available lproj directories
    const availableLprojs = files.filter((f) => f.endsWith('.lproj'))

    // Try in priority order
    for (const lproj of lprojPriority) {
      if (!availableLprojs.includes(lproj)) continue

      const stringsPath = path.join(resourcesPath, lproj, 'InfoPlist.strings')
      try {
        // 优先使用 simple-plist（兼容可直接解析的格式）
        const data = await readPlistAsync(stringsPath)
        const localizedName = extractLocalizedDisplayName(data)
        if (localizedName) return localizedName
      } catch {
        // simple-plist 无法解析 .strings 时回退到轻量解析器
        try {
          const parsed = await readLocalizedStringsFile(stringsPath)
          const localizedName = extractLocalizedDisplayName(parsed)
          if (localizedName) return localizedName
        } catch {
          // File doesn't exist or can't be read, continue to next
        }
      }
    }
  } catch {
    // Resources directory doesn't exist
  }

  return null
}

// The core logic for fetching app info, designed to throw errors on failure.
async function getAppInfoUnstable(appPath: string): Promise<ScannedAppInfo> {
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

  // Get names from Info.plist
  const plistDisplayName = getValueFromPlist(plistContent, 'CFBundleDisplayName')
  const bundleName = getValueFromPlist(plistContent, 'CFBundleName')
  const fileName = path.basename(appPath, '.app')

  // Try to get localized display name (e.g., "微信" for WeChat)
  const localizedName = await getLocalizedDisplayName(appPath)

  // mdls display-name corrections are handled by the background mdls scan.
  const displayName =
    localizedName ||
    normalizeDisplayNameCandidate(plistDisplayName) ||
    normalizeDisplayNameCandidate(bundleName)
  const alternateNames = collectAlternateDisplayNames(displayName, [
    localizedName,
    plistDisplayName,
    bundleName,
    fileName
  ])

  // `name` is always the file name
  const name = fileName

  const bundleId = getValueFromPlist(plistContent, 'CFBundleIdentifier') || ''

  const safeIconName = (displayName || name).replace(/[/\\?%*:|"<>]/g, '-')
  const cachedIconPath = path.join(ICON_CACHE_DIR, `${safeIconName}.png`)
  const icon = await fs
    .stat(cachedIconPath)
    .then(() => cachedIconPath)
    .catch(() => '')

  return {
    name,
    displayName: displayName || undefined,
    fileName,
    alternateNames: alternateNames.length > 0 ? alternateNames : undefined,
    path: appPath,
    icon,
    bundleId,
    uniqueId: bundleId || appPath,
    stableId: appPath,
    launchKind: 'path',
    launchTarget: appPath,
    displayPath: appPath,
    lastModified: stats.mtime
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
    reportAppScanError({
      platform: process.platform,
      path: appPath,
      message: errorMessage,
      timestamp: Date.now()
    })
    return null
  }
}

export async function getAppsViaMdfind(): Promise<ScannedAppInfo[]> {
  const query = 'kMDItemContentType == "com.apple.application-bundle"'
  const searchRoots = [
    '/Applications',
    '/System/Applications',
    '/System/Library/CoreServices',
    path.join(os.homedir(), 'Applications')
  ]

  const existingRoots: string[] = []
  for (const root of searchRoots) {
    try {
      await fs.access(root)
      existingRoots.push(root)
    } catch {
      // ignore missing roots
    }
  }

  const args = existingRoots.flatMap((root) => ['-onlyin', root])
  args.push(query)

  const { stdout } = await execFileSafe('mdfind', args, { maxBuffer: 1024 * 1024 * 10 })
  const appPaths = Array.from(
    new Set(
      stdout
        .split('\n')
        .map((p) => p.trim())
        .filter((p) => p.endsWith('.app'))
    )
  )

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
