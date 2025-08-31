import { exec } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { createRetrier } from '@talex-touch/utils'

const ICON_CACHE_DIR = path.join(os.tmpdir(), 'talex-touch-app-icons')

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
  } catch {
    // If Info.plist doesn't exist, this is not a valid/complete app bundle.
    throw new Error(`Info.plist not found at ${plistPath}`)
  }

  const stats = await fs.stat(appPath)
  const plistContent = await fs.readFile(plistPath, 'utf-8')

  // Get names from Info.plist
  const displayName = getValueFromPlist(plistContent, 'CFBundleDisplayName')
  const bundleName = getValueFromPlist(plistContent, 'CFBundleName') // Keep for icon cache
  const fileName = path.basename(appPath, '.app')

  // `name` is always the file name
  const name = fileName

  const bundleId = getValueFromPlist(plistContent, 'CFBundleIdentifier') || ''

  // Use the most definitive name for the icon cache to avoid collisions
  const icon = await getAppIcon({ name: displayName || bundleName || name, path: appPath })

  if (appPath.toLowerCase().includes('wechat')) {
    console.log(`[Darwin Scan] Path: ${appPath}, Name: ${name}, DisplayName: ${displayName}`)
  }

  return {
    name,
    displayName: displayName || undefined,
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
  shouldRetry: (error: any) => error.code === 'ENOENT' // Only retry if Info.plist is not found
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
    // This block will execute if all retry attempts fail
    console.warn(
      `[Darwin] Failed to get app info for ${appPath} after retries, likely incomplete or invalid bundle. Error: ${
        error instanceof Error ? error.message : error
      }`
    )
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
  return new Promise((resolve, reject) => {
    exec(
      'mdfind \'kMDItemContentType == "com.apple.application-bundle"\'',
      { maxBuffer: 1024 * 1024 * 10 },
      async (error, stdout) => {
        if (error) {
          return reject(new Error(`mdfind command failed: ${error.message}`))
        }

        const appPaths = stdout.split('\n').filter(p => p.trim().endsWith('.app'))
        const appPromises = appPaths.map(appPath => getAppInfo(appPath))

        const settledApps = await Promise.allSettled(appPromises)

        const successfulApps = settledApps
          .filter(
            (
              result
            ): result is PromiseFulfilledResult<{
              name: string
              displayName: string | undefined
              fileName: string
              path: string
              icon: string
              bundleId: string
              uniqueId: string
              lastModified: Date
            }> => result.status === 'fulfilled' && !!result.value
          )
          .map(result => result.value)

        resolve(successfulApps)
      }
    )
  })
}
