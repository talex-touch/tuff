import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execFileSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { shell } from 'electron'
import type { ScannedAppInfo } from './app-types'
import { reportAppScanError } from './app-error-reporter'

type AppInfo = ScannedAppInfo
type StartAppRecord = {
  name?: string
  Name?: string
  appId?: string
  AppID?: string
  AppId?: string
}
type ShortcutDetails = ReturnType<typeof shell.readShortcutLink>

const ICON_CACHE_DIR = path.join(os.tmpdir(), 'talex-touch-app-icons-win')
const START_MENU_PATHS = [
  path.resolve('C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs'),
  path.join(os.homedir(), 'AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs')
]
const WINDOWS_STORE_DISPLAY_PATH = 'Windows Store'

function normalizeIdentityPart(value: string): string {
  return value.trim().toLowerCase()
}

function buildPathStableId(targetPath: string): string {
  return normalizeIdentityPart(path.resolve(targetPath))
}

function buildShortcutStableId(targetPath: string, args?: string): string {
  const normalizedTarget = normalizeIdentityPart(path.resolve(targetPath))
  const normalizedArgs = normalizeIdentityPart(args || '')
  return `shortcut:${normalizedTarget}|${normalizedArgs}`
}

function buildUwpStableId(appId: string): string {
  return `uwp:${normalizeIdentityPart(appId)}`
}

function buildUwpShellPath(appId: string): string {
  return `shell:AppsFolder\\${appId}`
}

function buildIconCacheKey(value: string): string {
  return Buffer.from(value).toString('base64url')
}

function extractUwpAppId(raw: string | undefined): string | null {
  if (!raw) return null
  const match = raw.match(/shell:AppsFolder\\([^"\s]+)/i)
  return match?.[1] || null
}

function shouldSkipAppTarget(targetPath: string, args?: string): boolean {
  const normalizedTarget = targetPath.toLowerCase()
  const normalizedArgs = (args || '').toLowerCase()
  return normalizedTarget.includes('uninstall') || normalizedArgs.includes('uninstall')
}

async function listWindowsStoreApps(): Promise<AppInfo[]> {
  try {
    const script = [
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      '$apps = Get-StartApps | Sort-Object Name',
      '$apps | Select-Object Name, AppId | ConvertTo-Json -Compress'
    ].join('; ')

    const { stdout } = await execFileSafe(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true }
    )
    const raw = stdout.trim()
    if (!raw) return []

    const parsed = JSON.parse(raw) as StartAppRecord | StartAppRecord[]
    const entries = Array.isArray(parsed) ? parsed : [parsed]

    return entries
      .map((entry) => {
        const appId = entry.appId || entry.AppId || entry.AppID
        const name = (entry.name || entry.Name)?.trim()
        if (!appId || !name) return null

        const stableId = buildUwpStableId(appId)
        return {
          name,
          path: buildUwpShellPath(appId),
          icon: '',
          bundleId: '',
          uniqueId: stableId,
          stableId,
          launchKind: 'uwp' as const,
          launchTarget: appId,
          displayPath: WINDOWS_STORE_DISPLAY_PATH,
          lastModified: new Date(0)
        }
      })
      .filter(Boolean) as AppInfo[]
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? (error as any).code : ''
    if (code !== 'ENOENT') {
      console.warn('[Win] Failed to enumerate Windows Store apps:', error)
    }
    return []
  }
}

async function getAppIcon(targetPath: string, cacheKey: string): Promise<string> {
  await fs.mkdir(ICON_CACHE_DIR, { recursive: true })
  const iconPath = path.join(ICON_CACHE_DIR, `${buildIconCacheKey(cacheKey)}.png`)

  try {
    await fs.access(iconPath)
    const buffer = await fs.readFile(iconPath)
    return `data:image/png;base64,${buffer.toString('base64')}`
  } catch {
    try {
      const fileIcon = (await import('extract-file-icon')).default
      if (typeof fileIcon === 'function') {
        const buffer = fileIcon(targetPath, 32)
        if (buffer && buffer.length > 0) {
          const normalized = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
          await fs.writeFile(iconPath, normalized)
          return `data:image/png;base64,${normalized.toString('base64')}`
        }
      }
    } catch (e) {
      console.warn(`[Win] Failed to extract icon for ${targetPath}:`, e)
    }
  }
  return '' // Return empty string if icon extraction fails
}

async function buildDesktopAppInfo(
  sourcePath: string,
  fileName: string,
  stats: Awaited<ReturnType<typeof fs.stat>>,
  shortcutDetails?: ShortcutDetails
): Promise<AppInfo | null> {
  const isShortcut = fileName.endsWith('.lnk')
  const targetPath = shortcutDetails?.target || sourcePath
  const launchArgs = shortcutDetails?.args?.trim() || undefined
  const workingDirectory = shortcutDetails?.cwd?.trim() || undefined

  if (!targetPath || shouldSkipAppTarget(targetPath, launchArgs)) {
    return null
  }

  const uwpAppId = extractUwpAppId(launchArgs)
  if (uwpAppId) {
    const stableId = buildUwpStableId(uwpAppId)
    return {
      name: path.basename(fileName, path.extname(fileName)),
      path: buildUwpShellPath(uwpAppId),
      icon: '',
      bundleId: '',
      uniqueId: stableId,
      stableId,
      launchKind: 'uwp',
      launchTarget: uwpAppId,
      displayPath: WINDOWS_STORE_DISPLAY_PATH,
      lastModified: stats.mtime
    }
  }

  const launchKind = isShortcut ? 'shortcut' : 'path'
  const stableId =
    launchKind === 'shortcut'
      ? buildShortcutStableId(targetPath, launchArgs)
      : buildPathStableId(targetPath)
  const iconSource = shortcutDetails?.icon?.trim() || targetPath
  const icon = await getAppIcon(iconSource, stableId)
  const targetStats = await fs.stat(targetPath).catch(() => stats)

  return {
    name: path.basename(fileName, path.extname(fileName)),
    path: isShortcut ? sourcePath : targetPath,
    icon,
    bundleId: '',
    uniqueId: stableId,
    stableId,
    launchKind,
    launchTarget: targetPath,
    launchArgs,
    workingDirectory,
    displayPath: targetPath,
    lastModified: targetStats.mtime
  }
}

async function fileDisplay(filePath: string): Promise<AppInfo[]> {
  let results: AppInfo[] = []
  try {
    const files = await fs.readdir(filePath)
    for (const fileName of files) {
      const fileDir = path.join(filePath, fileName)
      try {
        const stats = await fs.stat(fileDir)
        if (stats.isFile() && (fileName.endsWith('.lnk') || fileName.endsWith('.exe'))) {
          let appDetail: ShortcutDetails | undefined
          if (fileName.endsWith('.lnk')) {
            try {
              appDetail = shell.readShortcutLink(fileDir)
            } catch {
              continue // Ignore broken shortcuts
            }
          }
          const appInfo = await buildDesktopAppInfo(fileDir, fileName, stats, appDetail)
          if (appInfo) {
            results.push(appInfo)
          }
        } else if (stats.isDirectory()) {
          results = results.concat(await fileDisplay(fileDir))
        }
      } catch {
        // Ignore errors for individual files/directories
      }
    }
  } catch (err) {
    console.warn(`[Win] Could not read directory: ${filePath}`, err)
  }
  return results
}

export async function getApps(): Promise<AppInfo[]> {
  const allAppsPromises = [
    ...START_MENU_PATHS.map((item) => fileDisplay(item)),
    listWindowsStoreApps()
  ]

  const results = await Promise.allSettled(allAppsPromises)
  let allApps: AppInfo[] = []

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      allApps = allApps.concat(result.value)
    }
  })

  const uniqueApps = Array.from(
    new Map(allApps.map((app) => [app.stableId || app.uniqueId, app])).values()
  )

  return uniqueApps
}

export async function getAppInfo(filePath: string): Promise<AppInfo | null> {
  try {
    const shellPathAppId = extractUwpAppId(filePath)
    if (/^shell:AppsFolder\\/i.test(filePath) && shellPathAppId) {
      const stableId = buildUwpStableId(shellPathAppId)
      return {
        name: shellPathAppId,
        path: buildUwpShellPath(shellPathAppId),
        icon: '',
        bundleId: '',
        uniqueId: stableId,
        stableId,
        launchKind: 'uwp',
        launchTarget: shellPathAppId,
        displayPath: WINDOWS_STORE_DISPLAY_PATH,
        lastModified: new Date(0)
      }
    }

    const stats = await fs.stat(filePath)
    if (!stats.isFile()) return null

    const fileName = path.basename(filePath)
    if (!fileName.endsWith('.lnk') && !fileName.endsWith('.exe')) {
      return null
    }

    const appDetail = fileName.endsWith('.lnk') ? shell.readShortcutLink(filePath) : undefined
    return await buildDesktopAppInfo(filePath, fileName, stats, appDetail)
  } catch (error) {
    console.warn(`[Win] Failed to get app info for ${filePath}:`, error)
    const message = error instanceof Error ? error.message : String(error)
    reportAppScanError({
      platform: process.platform,
      path: filePath,
      message,
      timestamp: Date.now()
    })
    return null
  }
}
