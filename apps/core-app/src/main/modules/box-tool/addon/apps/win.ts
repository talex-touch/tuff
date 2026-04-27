import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execFileSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { shell } from 'electron'
import { reportAppScanError } from './app-error-reporter'
import type { ScannedAppInfo } from './app-types'

// Define the structure for our app info, consistent with other platforms
type AppInfo = ScannedAppInfo

interface StartAppEntry {
  Name?: string
  AppID?: string
  IconPath?: string
  InstallLocation?: string
  ManifestDisplayName?: string
  Description?: string
}

type WindowsShortcutDetails = Partial<Electron.ShortcutDetails> & {
  target?: string
  cwd?: string
  workingDirectory?: string
}

const ICON_CACHE_DIR = path.join(os.tmpdir(), 'talex-touch-app-icons-win')
const APPS_FOLDER_PREFIX = 'shell:AppsFolder\\'
const BASE64_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'])
const URL_LAUNCH_PATTERN = /^[a-z][a-z\d+.-]*:\/\//i

function normalizeShortcutValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function getShortcutCwd(details: WindowsShortcutDetails): string | undefined {
  return normalizeShortcutValue(details.cwd) || normalizeShortcutValue(details.workingDirectory)
}

function makeAppsFolderPath(appUserModelId: string): string {
  return `${APPS_FOLDER_PREFIX}${appUserModelId}`
}

function isUrlLaunchId(value: string): boolean {
  return URL_LAUNCH_PATTERN.test(value)
}

function sanitizeCacheName(value: string): string {
  return (
    Array.from(value)
      .map((char) => {
        const code = char.charCodeAt(0)
        return code < 32 || '<>:"/\\|?*'.includes(char) ? '_' : char
      })
      .join('')
      .slice(0, 120) || 'app'
  )
}

function extractJsonPayload(stdout: string): string | null {
  const trimmed = stdout.trim().replace(/^\uFEFF/, '')
  if (!trimmed) return null

  const directStart = trimmed.search(/[\[{]/)
  if (directStart === -1) return null
  return trimmed.slice(directStart)
}

function toManifestDisplayName(value: unknown): string | undefined {
  const normalized = normalizeShortcutValue(value)
  if (!normalized || normalized.startsWith('ms-resource:')) return undefined
  return normalized
}

async function firstExistingFile(candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    try {
      const stats = await fs.stat(candidate)
      if (stats.isFile()) return candidate
    } catch {
      // Try the next candidate.
    }
  }
  return undefined
}

async function resolvePackageIconPath(
  installLocation: string | undefined,
  manifestIconPath: string | undefined
): Promise<string | undefined> {
  if (!installLocation || !manifestIconPath) return undefined
  if (/^ms-resource:/i.test(manifestIconPath)) return undefined

  const resolvedIconPath = path.isAbsolute(manifestIconPath)
    ? manifestIconPath
    : path.resolve(installLocation, manifestIconPath)
  const extension = path.extname(resolvedIconPath) || '.png'
  const directory = path.dirname(resolvedIconPath)
  const basename = path.basename(resolvedIconPath, path.extname(resolvedIconPath))

  const candidates = [
    resolvedIconPath,
    path.join(directory, `${basename}.targetsize-48${extension}`),
    path.join(directory, `${basename}.targetsize-48_altform-unplated${extension}`),
    path.join(directory, `${basename}.targetsize-44${extension}`),
    path.join(directory, `${basename}.targetsize-44_altform-unplated${extension}`),
    path.join(directory, `${basename}.scale-200${extension}`),
    path.join(directory, `${basename}.scale-150${extension}`),
    path.join(directory, `${basename}.scale-100${extension}`),
    path.join(directory, `${basename}.scale-400${extension}`),
    path.join(directory, `${basename}.targetsize-256${extension}`),
    path.join(directory, `${basename}.targetsize-256_altform-unplated${extension}`)
  ]

  const exactMatch = await firstExistingFile(candidates)
  if (exactMatch) return exactMatch

  try {
    const files = await fs.readdir(directory)
    const normalizedBase = basename.toLowerCase()
    const fallback = files
      .filter((file) => {
        const ext = path.extname(file).toLowerCase()
        return (
          BASE64_IMAGE_EXTENSIONS.has(ext) &&
          path.basename(file, path.extname(file)).toLowerCase().startsWith(normalizedBase)
        )
      })
      .sort((a, b) => scoreIconFile(b) - scoreIconFile(a))[0]
    return fallback ? path.join(directory, fallback) : undefined
  } catch {
    return undefined
  }
}

function scoreIconFile(fileName: string): number {
  const normalized = fileName.toLowerCase()
  if (normalized.includes('targetsize-48')) return 50
  if (normalized.includes('targetsize-44')) return 45
  if (normalized.includes('scale-200')) return 40
  if (normalized.includes('targetsize-256')) return 30
  if (normalized.includes('scale-100')) return 20
  return 10
}

async function readIconFileAsDataUrl(iconPath: string | undefined): Promise<string> {
  if (!iconPath) return ''
  const extension = path.extname(iconPath).toLowerCase()
  if (!BASE64_IMAGE_EXTENSIONS.has(extension)) return ''

  try {
    const buffer = await fs.readFile(iconPath)
    const mime =
      extension === '.jpg' || extension === '.jpeg'
        ? 'image/jpeg'
        : extension === '.bmp'
          ? 'image/bmp'
          : extension === '.gif'
            ? 'image/gif'
            : extension === '.webp'
              ? 'image/webp'
              : 'image/png'
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch {
    return ''
  }
}

async function getAppIcon(targetPath: string, appName: string): Promise<string> {
  await fs.mkdir(ICON_CACHE_DIR, { recursive: true })
  const iconPath = path.join(ICON_CACHE_DIR, `${sanitizeCacheName(appName)}.png`)

  try {
    // Check if icon already exists
    await fs.access(iconPath)
    const buffer = await fs.readFile(iconPath)
    return `data:image/png;base64,${buffer.toString('base64')}`
  } catch {
    // Icon does not exist, extract it
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

async function fileDisplay(filePath: string): Promise<AppInfo[]> {
  let results: AppInfo[] = []
  try {
    const files = await fs.readdir(filePath)
    for (const fileName of files) {
      const fileDir = path.join(filePath, fileName)
      try {
        const stats = await fs.stat(fileDir)
        if (stats.isFile() && (fileName.endsWith('.lnk') || fileName.endsWith('.exe'))) {
          let appDetail: WindowsShortcutDetails = {}
          const isShortcut = fileName.endsWith('.lnk')
          if (isShortcut) {
            try {
              appDetail = shell.readShortcutLink(fileDir)
            } catch {
              continue // Ignore broken shortcuts
            }
          } else {
            appDetail = { target: fileDir }
          }

          const targetPath = appDetail.target
          if (!targetPath || targetPath.toLowerCase().includes('uninstall')) {
            continue
          }

          const appName = path.basename(fileName, path.extname(fileName))
          const icon = await getAppIcon(targetPath, appName)

          // To get the mtime of the actual executable, not the shortcut
          const targetStats = await fs.stat(targetPath).catch(() => stats)

          results.push({
            name: appName,
            path: targetPath,
            icon,
            bundleId: '', // Windows doesn't have bundleId
            uniqueId: targetPath, // Use full path as uniqueId
            lastModified: targetStats.mtime,
            launchKind: isShortcut ? 'shortcut' : 'path',
            launchPath: targetPath,
            shortcutPath: isShortcut ? fileDir : undefined,
            shortcutArgs: isShortcut ? normalizeShortcutValue(appDetail.args) : undefined,
            shortcutCwd: isShortcut ? getShortcutCwd(appDetail) : undefined,
            description: isShortcut
              ? normalizeShortcutValue(appDetail.description) || undefined
              : undefined
          })
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

async function getStoreApps(): Promise<AppInfo[]> {
  const script = [
    '$ErrorActionPreference = "SilentlyContinue"',
    '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false',
    '$OutputEncoding = [Console]::OutputEncoding',
    '$packages = @{}',
    'Get-AppxPackage | ForEach-Object { if ($_.PackageFamilyName -and $_.InstallLocation) { $packages[$_.PackageFamilyName] = $_.InstallLocation } }',
    'Get-StartApps | Where-Object { $_.AppID -and $_.Name } | ForEach-Object {',
    '  $appId = [string]$_.AppID',
    '  $name = [string]$_.Name',
    '  $installLocation = ""',
    '  $iconPath = ""',
    '  $manifestDisplayName = ""',
    '  $description = ""',
    '  if ($appId -match "^(?<family>[^!]+)!(?<app>.+)$") {',
    '    $family = $Matches.family',
    '    $applicationId = $Matches.app',
    '    if ($packages.ContainsKey($family)) {',
    '      $installLocation = [string]$packages[$family]',
    '      $manifestPath = Join-Path $installLocation "AppxManifest.xml"',
    '      if (Test-Path -LiteralPath $manifestPath) {',
    '        try {',
    '          [xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8',
    '          foreach ($application in @($manifest.Package.Applications.Application)) {',
    '            if ([string]$application.Id -eq $applicationId) {',
    '              $visual = $application.VisualElements',
    '              if ($visual) {',
    '                $iconPath = [string]$visual.Square44x44Logo',
    '                if (-not $iconPath) { $iconPath = [string]$visual.Logo }',
    '                $manifestDisplayName = [string]$visual.DisplayName',
    '                $description = [string]$visual.Description',
    '              }',
    '              break',
    '            }',
    '          }',
    '        } catch {}',
    '      }',
    '    }',
    '  }',
    '  [ordered]@{ Name = $name; AppID = $appId; IconPath = $iconPath; InstallLocation = $installLocation; ManifestDisplayName = $manifestDisplayName; Description = $description }',
    '} | ConvertTo-Json -Compress -Depth 3'
  ].join('\n')

  try {
    const { stdout } = await execFileSafe(
      'powershell',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 8000, maxBuffer: 1024 * 1024 * 4 }
    )
    const payload = extractJsonPayload(stdout)
    if (!payload) return []

    const parsed = JSON.parse(payload) as StartAppEntry | StartAppEntry[]
    const entries = Array.isArray(parsed) ? parsed : [parsed]
    const now = new Date()
    const apps: AppInfo[] = []

    for (const entry of entries) {
      const name =
        normalizeShortcutValue(entry.Name) || toManifestDisplayName(entry.ManifestDisplayName)
      const appUserModelId = normalizeShortcutValue(entry.AppID)
      if (!name || !appUserModelId) continue

      const isUrlApp = isUrlLaunchId(appUserModelId)
      const iconPath = isUrlApp
        ? undefined
        : await resolvePackageIconPath(
            normalizeShortcutValue(entry.InstallLocation),
            normalizeShortcutValue(entry.IconPath)
          )
      const icon = await readIconFileAsDataUrl(iconPath)
      const launchPath = isUrlApp ? appUserModelId : makeAppsFolderPath(appUserModelId)
      apps.push({
        name,
        displayName: name,
        path: launchPath,
        icon,
        bundleId: appUserModelId,
        uniqueId: appUserModelId,
        appUserModelId,
        launchKind: isUrlApp ? 'url' : 'appx',
        launchPath,
        description: toManifestDisplayName(entry.Description) || appUserModelId,
        lastModified: now
      })
    }

    return apps
  } catch (error) {
    console.warn('[Win] Could not enumerate Store apps:', error)
    return []
  }
}

export async function getApps(): Promise<AppInfo[]> {
  const startMenuPath1 = path.resolve('C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs')
  const startMenuPath2 = path.join(
    os.homedir(),
    'AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs'
  )

  const allAppsPromises = [fileDisplay(startMenuPath1), fileDisplay(startMenuPath2), getStoreApps()]

  const results = await Promise.allSettled(allAppsPromises)
  let allApps: AppInfo[] = []

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      allApps = allApps.concat(result.value)
    }
  })

  // Remove duplicates based on uniqueId (the path)
  const uniqueApps = Array.from(new Map(allApps.map((app) => [app.uniqueId, app])).values())

  return uniqueApps
}

export async function getAppInfo(filePath: string): Promise<AppInfo | null> {
  try {
    if (filePath.startsWith(APPS_FOLDER_PREFIX)) {
      const appUserModelId = filePath.slice(APPS_FOLDER_PREFIX.length)
      if (!appUserModelId) return null
      return {
        name: appUserModelId,
        path: filePath,
        icon: '',
        bundleId: appUserModelId,
        uniqueId: appUserModelId,
        appUserModelId,
        launchKind: 'appx',
        launchPath: filePath,
        lastModified: new Date()
      }
    }

    if (isUrlLaunchId(filePath)) {
      return {
        name: filePath,
        path: filePath,
        icon: '',
        bundleId: filePath,
        uniqueId: filePath,
        appUserModelId: filePath,
        launchKind: 'url',
        launchPath: filePath,
        lastModified: new Date()
      }
    }

    const stats = await fs.stat(filePath)
    if (!stats.isFile()) return null

    if (filePath.endsWith('.lnk')) {
      const appDetail = shell.readShortcutLink(filePath)
      const targetPath = appDetail.target
      if (!targetPath) return null
      const appName = path.basename(filePath, path.extname(filePath))
      const icon = await getAppIcon(targetPath, appName)
      const targetStats = await fs.stat(targetPath).catch(() => stats)

      return {
        name: appName,
        path: targetPath,
        icon,
        bundleId: '',
        uniqueId: targetPath,
        launchKind: 'shortcut',
        launchPath: targetPath,
        shortcutPath: filePath,
        shortcutArgs: normalizeShortcutValue(appDetail.args),
        shortcutCwd: getShortcutCwd(appDetail),
        description: normalizeShortcutValue(appDetail.description),
        lastModified: targetStats.mtime
      }
    }

    const appName = path.basename(filePath, path.extname(filePath))
    const icon = await getAppIcon(filePath, appName)

    return {
      name: appName,
      path: filePath,
      icon,
      bundleId: '', // Windows doesn't have bundleId
      uniqueId: filePath, // Use full path as uniqueId
      lastModified: stats.mtime,
      launchKind: 'path',
      launchPath: filePath
    }
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
