import { exec } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { createRetrier } from '@talex-touch/utils'
import { reportAppScanError } from './app-error-reporter'

const ICON_CACHE_DIR = path.join(os.tmpdir(), 'talex-touch-app-icons')
const execAsync = promisify(exec)

async function convertIcnsToPng(icnsPath: string, pngPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const command = `sips -s format png "${icnsPath}" --out "${pngPath}" --resampleHeightWidth 64 64`
    exec(command, (error) => {
      if (error) {
        return reject(new Error(`sips command failed for ${icnsPath}: ${error.message}`))
      }
      resolve(pngPath)
    })
  })
}

async function getAppIcon(app: { path: string; name: string }): Promise<string | null> {
  const safeName = app.name.replace(/[/\\?%*:|"<>]/g, '-')
  const cachedIconPath = path.join(ICON_CACHE_DIR, `${safeName}.png`)
  const noneMarkerPath = path.join(ICON_CACHE_DIR, `${safeName}.none`)

  try {
    // 1. Check for cached PNG
    if (await fs.stat(cachedIconPath).catch(() => false)) {
      const buffer = await fs.readFile(cachedIconPath)
      return buffer.toString('base64')
    }

    // 2. Check for "none" marker
    if (await fs.stat(noneMarkerPath).catch(() => false)) {
      return null
    }

    // 3. Find .icns file
    const plistPath = path.join(app.path, 'Contents', 'Info.plist')
    const resourcesPath = path.join(app.path, 'Contents', 'Resources')
    let icnsFile: string | undefined

    try {
      const plistContent = await fs.readFile(plistPath, 'utf-8')
      const iconNameMatch = plistContent.match(
        /<key>CFBundleIconFile<\/key>\s*<string>(.*?)<\/string>/
      )
      if (iconNameMatch?.[1]) {
        let iconFile = iconNameMatch[1]
        if (!iconFile.endsWith('.icns')) {
          iconFile += '.icns'
        }
        const potentialPath = path.join(resourcesPath, iconFile)
        if (await fs.stat(potentialPath).catch(() => false)) {
          icnsFile = potentialPath
        }
      }
    } catch {
      // Plist might not exist or be readable, continue to scan directory
    }

    if (!icnsFile) {
      const files = await fs.readdir(resourcesPath).catch(() => [])
      const found = files.find((f) => f.endsWith('.icns'))
      if (found) {
        icnsFile = path.join(resourcesPath, found)
      }
    }

    if (!icnsFile) {
      await fs.writeFile(noneMarkerPath, '')
      return null
    }

    // 4. Convert .icns to .png
    await convertIcnsToPng(icnsFile, cachedIconPath)
    const buffer = await fs.readFile(cachedIconPath)
    return buffer.toString('base64')
  } catch (error) {
    console.warn(`[Darwin] Failed to get icon for ${app.name}:`, error)
    await fs.writeFile(noneMarkerPath, '').catch(() => {})
    return null
  }
}

export async function getApps(): Promise<
  {
    name: string
    displayName: string | undefined
    fileName: string
    path: string
    icon: string
    bundleId: string
    uniqueId: string
    lastModified: Date
  }[]
> {
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
        // Read file as buffer to detect encoding
        const buffer = await fs.readFile(stringsPath)
        let content: string

        // Detect encoding by BOM (Byte Order Mark)
        if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
          // UTF-16 LE with BOM
          content = buffer.toString('utf16le')
        } else if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
          // UTF-16 BE with BOM - use iconv-lite for proper decoding
          try {
            const iconv = await import('iconv-lite')
            content = iconv.decode(buffer, 'utf16be')
          } catch {
            // Fallback to utf16le if iconv-lite is not available
            content = buffer.toString('utf16le')
          }
        } else {
          // No BOM, try UTF-8 first
          content = buffer.toString('utf-8')
        }

        // Parse strings file format: "CFBundleDisplayName" = "微信";
        // or CFBundleName
        const displayNameMatch = content.match(/"?CFBundleDisplayName"?\s*=\s*"([^"]+)"/)
        if (displayNameMatch?.[1]) {
          return displayNameMatch[1]
        }

        const bundleNameMatch = content.match(/"?CFBundleName"?\s*=\s*"([^"]+)"/)
        if (bundleNameMatch?.[1]) {
          return bundleNameMatch[1]
        }
      } catch {
        // File doesn't exist or can't be read, continue to next
      }
    }
  } catch {
    // Resources directory doesn't exist
  }

  return null
}

// The core logic for fetching app info, designed to throw errors on failure.
async function getAppInfoUnstable(appPath: string): Promise<{
  name: string
  displayName: string | undefined
  fileName: string
  path: string
  icon: string
  bundleId: string
  uniqueId: string
  lastModified: Date
}> {
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

  // Try to get display name from Spotlight metadata (most reliable for localized names)
  let spotlightName: string | null = null
  try {
    const { stdout } = await execAsync(`mdls -name kMDItemDisplayName -raw "${appPath}"`)
    const rawName = stdout.trim()
    if (rawName && rawName !== '(null)') {
      spotlightName = rawName.endsWith('.app') ? rawName.slice(0, -4) : rawName
    }
  } catch {
    // Spotlight query failed, will fallback to other methods
  }

  // Try to get localized display name from .lproj files (e.g., "微信" for WeChat)
  const localizedName = await getLocalizedDisplayName(appPath)

  // Priority: Spotlight name > localized name > plist display name > bundle name
  // Spotlight is most reliable as it's maintained by macOS and handles localization automatically
  const displayName = spotlightName || localizedName || plistDisplayName || bundleName

  // `name` is always the file name
  const name = fileName

  const bundleId = getValueFromPlist(plistContent, 'CFBundleIdentifier') || ''

  // Use the most definitive name for the icon cache to avoid collisions
  const icon = await getAppIcon({ name: displayName || name, path: appPath })

  return {
    name,
    displayName: displayName && displayName.trim() ? displayName.trim() : undefined,
    fileName,
    path: appPath,
    icon: icon ? `data:image/png;base64,${icon}` : '',
    bundleId,
    uniqueId: bundleId || appPath,
    lastModified: stats.mtime
  }
}

// Create a retrier instance to handle transient errors like ENOENT
const getAppInfoRetrier = createRetrier({
  maxRetries: 2, // Total of 3 attempts
  timeoutMs: 5000, // 5-second timeout for each attempt
  shouldRetry: (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT' // Only retry if Info.plist is not found
})

// Wrap the unstable function with the retry logic
const reliableGetAppInfo: typeof getAppInfoUnstable = getAppInfoRetrier(getAppInfoUnstable)

export async function getAppInfo(appPath: string): Promise<{
  name: string
  displayName: string | undefined
  fileName: string
  path: string
  icon: string
  bundleId: string
  uniqueId: string
  lastModified: Date
} | null> {
  // Pre-condition check, no need to retry this
  if (!appPath || !appPath.endsWith('.app')) {
    return null
  }

  try {
    // Call the reliable, wrapped function
    return await reliableGetAppInfo(appPath)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : typeof error === 'string' ? error : String(error)
    // This block will execute if all retry attempts fail
    console.warn(
      `[Darwin] Failed to get app info for ${appPath} after retries, likely incomplete or invalid bundle. Error: ${
        errorMessage
      }`
    )
    reportAppScanError({
      platform: process.platform,
      path: appPath,
      message: errorMessage,
      timestamp: Date.now()
    })
    return null
  }
}

export async function getAppsViaMdfind(): Promise<
  {
    name: string
    displayName: string | undefined
    fileName: string
    path: string
    icon: string
    bundleId: string
    uniqueId: string
    lastModified: Date
  }[]
> {
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

  const onlyInArgs = existingRoots.map((root) => `-onlyin "${root}"`).join(' ')
  const command = existingRoots.length > 0 ? `mdfind ${onlyInArgs} '${query}'` : `mdfind '${query}'`

  const { stdout } = await execAsync(command, { maxBuffer: 1024 * 1024 * 10 })
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

  return appInfos.filter(
    (
      app
    ): app is {
      name: string
      displayName: string | undefined
      fileName: string
      path: string
      icon: string
      bundleId: string
      uniqueId: string
      lastModified: Date
    } => !!app
  )
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
