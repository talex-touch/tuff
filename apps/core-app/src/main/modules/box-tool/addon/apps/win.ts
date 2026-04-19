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
  packageFamilyName?: string
  PackageFamilyName?: string
  installLocation?: string
  InstallLocation?: string
}
type ShortcutDetails = ReturnType<typeof shell.readShortcutLink>
type UwpManifestMetadata = {
  displayName?: string
  description?: string
  logoRelativePath?: string
}

const ICON_CACHE_DIR = path.join(os.tmpdir(), 'talex-touch-app-icons-win')
const APPX_MANIFEST_NAME = 'AppxManifest.xml'
const START_MENU_PATHS = [
  path.resolve('C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs'),
  path.join(os.homedir(), 'AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs')
]
const WINDOWS_STORE_DISPLAY_PATH = 'Windows Store'
const UWP_LOGO_ATTRIBUTE_CANDIDATES = [
  'Square44x44Logo',
  'SmallLogo',
  'StoreLogo',
  'Square150x150Logo',
  'Logo'
]

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function parseStartAppField(entry: StartAppRecord, keys: Array<keyof StartAppRecord>): string {
  for (const key of keys) {
    const rawValue = entry[key]
    if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
      return rawValue.trim()
    }
  }
  return ''
}

function normalizeManifestText(value?: string): string | undefined {
  if (!value) return undefined
  const normalized = decodeXmlEntities(value).trim()
  if (!normalized || /^ms-resource:/i.test(normalized)) {
    return undefined
  }
  return normalized
}

function readXmlAttribute(attributes: string, attributeName: string): string | undefined {
  const pattern = new RegExp(`${escapeRegExp(attributeName)}="([^"]+)"`, 'i')
  const match = attributes.match(pattern)
  return match?.[1]
}

function getImageMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.ico':
      return 'image/x-icon'
    case '.bmp':
      return 'image/bmp'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'image/png'
  }
}

async function getWindowsStoreRecords(): Promise<StartAppRecord[]> {
  try {
    const script = [
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      '$apps = Get-StartApps | Sort-Object Name | ForEach-Object {',
      '  $appId = $_.AppId',
      '  $name = $_.Name',
      '  if (-not $appId -or -not $name) { return }',
      "  $packageFamilyName = ''",
      "  $installLocation = ''",
      "  if ($appId -match '!') {",
      "    $packageFamilyName = $appId.Split('!')[0]",
      '    $package = Get-AppxPackage -PackageFamilyName $packageFamilyName -ErrorAction SilentlyContinue | Select-Object -First 1',
      '    if ($package) {',
      '      $installLocation = [string]$package.InstallLocation',
      '      if (-not $packageFamilyName) { $packageFamilyName = [string]$package.PackageFamilyName }',
      '    }',
      '  }',
      '  [PSCustomObject]@{',
      '    Name = $name',
      '    AppId = $appId',
      '    PackageFamilyName = $packageFamilyName',
      '    InstallLocation = $installLocation',
      '  }',
      '}',
      '$apps | ConvertTo-Json -Compress'
    ].join('; ')

    const { stdout } = await execFileSafe(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true }
    )
    const raw = stdout.trim()
    if (!raw) return []

    const parsed = JSON.parse(raw) as StartAppRecord | StartAppRecord[]
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? (error as any).code : ''
    if (code !== 'ENOENT') {
      console.warn('[Win] Failed to enumerate Windows Store apps:', error)
    }
    return []
  }
}

async function readManifestContent(manifestPath: string): Promise<string | null> {
  try {
    return await fs.readFile(manifestPath, 'utf8')
  } catch {
    return null
  }
}

async function readUwpManifestMetadata(
  installLocation: string,
  appId: string
): Promise<UwpManifestMetadata | null> {
  if (!installLocation) return null

  const manifestPath = path.join(installLocation, APPX_MANIFEST_NAME)
  const manifestContent = await readManifestContent(manifestPath)
  if (!manifestContent) return null

  const appPattern = new RegExp(
    `<Application\\b[^>]*\\bId="${escapeRegExp(appId)}"[^>]*>([\\s\\S]*?)<\\/Application>`,
    'i'
  )
  const applicationMatch = manifestContent.match(appPattern)
  if (!applicationMatch?.[1]) {
    return null
  }

  const visualElementsMatch = applicationMatch[1].match(/<(?:\w+:)?VisualElements\b([^>]*)\/?>/i)
  if (!visualElementsMatch?.[1]) {
    return null
  }

  const attributes = visualElementsMatch[1]
  const logoRelativePath = UWP_LOGO_ATTRIBUTE_CANDIDATES.map((attributeName) =>
    readXmlAttribute(attributes, attributeName)
  ).find(Boolean)

  return {
    displayName: normalizeManifestText(readXmlAttribute(attributes, 'DisplayName')),
    description: normalizeManifestText(readXmlAttribute(attributes, 'Description')),
    logoRelativePath: logoRelativePath ? decodeXmlEntities(logoRelativePath) : undefined
  }
}

async function resolveUwpLogoFilePath(
  installLocation: string,
  logoRelativePath?: string
): Promise<string | null> {
  if (!installLocation || !logoRelativePath) return null

  const normalizedRelativePath = path.normalize(logoRelativePath.replace(/[\\/]+/g, path.sep))
  const primaryPath = path.resolve(installLocation, normalizedRelativePath)

  try {
    await fs.access(primaryPath)
    return primaryPath
  } catch {
    const logoDirectory = path.dirname(primaryPath)
    const extension = path.extname(primaryPath)
    const basename = path.basename(primaryPath, extension)

    try {
      const files = await fs.readdir(logoDirectory)
      const variants = files
        .filter((fileName) =>
          new RegExp(
            `^${escapeRegExp(basename)}\\.(?:scale|targetsize)-[^.]+${escapeRegExp(extension)}$`,
            'i'
          ).test(fileName)
        )
        .sort((left, right) => {
          const leftPriority = left.includes('.targetsize-') ? 0 : 1
          const rightPriority = right.includes('.targetsize-') ? 0 : 1
          return leftPriority - rightPriority || left.localeCompare(right)
        })

      if (variants.length > 0) {
        return path.join(logoDirectory, variants[0])
      }
    } catch {
      return null
    }
  }

  return null
}

async function readImageAsDataUrl(filePath: string): Promise<string> {
  try {
    const buffer = await fs.readFile(filePath)
    return `data:${getImageMimeType(filePath)};base64,${buffer.toString('base64')}`
  } catch {
    return ''
  }
}

async function buildUwpAppInfo(
  appId: string,
  options: {
    fallbackName: string
    lastModified: Date
    record?: StartAppRecord
  }
): Promise<AppInfo> {
  const stableId = buildUwpStableId(appId)
  const packageFamilyName =
    parseStartAppField(options.record || {}, ['packageFamilyName', 'PackageFamilyName']) ||
    appId.split('!')[0] ||
    ''
  const installLocation = parseStartAppField(options.record || {}, [
    'installLocation',
    'InstallLocation'
  ])
  const manifestMetadata = installLocation
    ? await readUwpManifestMetadata(installLocation, appId.split('!')[1] || appId)
    : null
  const logoPath = installLocation
    ? await resolveUwpLogoFilePath(installLocation, manifestMetadata?.logoRelativePath)
    : null

  return {
    name: options.fallbackName,
    displayName: manifestMetadata?.displayName || options.fallbackName,
    description: manifestMetadata?.description,
    path: buildUwpShellPath(appId),
    icon: logoPath ? await readImageAsDataUrl(logoPath) : '',
    bundleId: packageFamilyName,
    uniqueId: stableId,
    stableId,
    launchKind: 'uwp',
    launchTarget: appId,
    displayPath: WINDOWS_STORE_DISPLAY_PATH,
    lastModified: options.lastModified
  }
}

async function listWindowsStoreApps(): Promise<AppInfo[]> {
  const entries = await getWindowsStoreRecords()
  const apps = await Promise.all(
    entries.map(async (entry) => {
      const appId = parseStartAppField(entry, ['appId', 'AppId', 'AppID'])
      const name = parseStartAppField(entry, ['name', 'Name'])
      if (!appId || !name) return null

      return await buildUwpAppInfo(appId, {
        fallbackName: name,
        lastModified: new Date(0),
        record: entry
      })
    })
  )

  return apps.filter(Boolean) as AppInfo[]
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
    return await buildUwpAppInfo(uwpAppId, {
      fallbackName: path.basename(fileName, path.extname(fileName)),
      lastModified: stats.mtime
    })
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
      const windowsStoreApps = await listWindowsStoreApps()
      const matchedApp = windowsStoreApps.find((app) => app.launchTarget === shellPathAppId)
      if (matchedApp) {
        return matchedApp
      }

      return await buildUwpAppInfo(shellPathAppId, {
        fallbackName: shellPathAppId,
        lastModified: new Date(0)
      })
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
