import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execFileSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { shell } from 'electron'
import type { AppDisplayNameQuality, ScannedAppInfo } from './app-types'
import { reportAppScanError } from './app-error-reporter'
import { getSteamApps } from './steam-provider'
import { createLogger } from '../../../../utils/logger'

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

type DesktopAppDisplayNameMetadata = {
  preferredDisplayName?: string
  displayNameSource?: string
  displayNameQuality?: AppDisplayNameQuality
}

const ICON_CACHE_DIR = path.join(os.tmpdir(), 'talex-touch-app-icons-win')
const APPX_MANIFEST_NAME = 'AppxManifest.xml'
export const START_MENU_PATHS = [
  path.resolve('C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs'),
  path.join(os.homedir(), 'AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs')
]
const WINDOWS_STORE_DISPLAY_PATH = 'Windows Store'
const WINDOWS_DESKTOP_APP_EXTENSIONS = new Set(['.lnk', '.exe', '.appref-ms'])
const REGISTRY_DISPLAY_ICON_EXE_PATTERN = /"([^"]+\.exe)"|([^",]+\.exe)/i
const REGISTRY_EXE_PRIORITY = ['app', 'launcher', 'client', 'desktop']
const KNOWN_FOLDER_GUID_PATH_PATTERN = /^\{([0-9a-f-]{36})\}[\\/](.+)$/i
const KNOWN_FOLDER_PATH_RESOLVERS: Record<string, () => string> = {
  '6d809377-6af0-444b-8957-a3773f02200e': () =>
    process.env.ProgramW6432 || process.env.ProgramFiles || 'C:\\Program Files',
  '905e63b6-c1bf-494e-b29c-65b732d3d21a': () => process.env.ProgramFiles || 'C:\\Program Files',
  '7c5a40ef-a0fb-4bfc-874a-c0f2e0b9fa8e': () =>
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  'f1b32785-6fba-4fcf-9d55-7b8e7f157091': () =>
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData\\Local'),
  '3eb685db-65f9-4cf6-a03a-e3ef65729f3d': () =>
    process.env.APPDATA || path.join(os.homedir(), 'AppData\\Roaming'),
  '62ab5d82-fdc1-4dc3-a9dd-070d1d495d97': () => process.env.ProgramData || 'C:\\ProgramData'
}
const UWP_LOGO_ATTRIBUTE_CANDIDATES = [
  'Square44x44Logo',
  'SmallLogo',
  'StoreLogo',
  'Square150x150Logo',
  'Logo'
]
const windowsAppLog = createLogger('AppScanner').child('Windows')

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

function normalizeAlternateNames(
  values: Array<string | null | undefined>,
  displayName?: string
): string[] | undefined {
  const displayNameKey = displayName?.trim().toLowerCase()
  const seen = new Set<string>()
  const names: string[] = []

  for (const value of values) {
    const normalized = value?.trim()
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (key === displayNameKey || seen.has(key)) continue
    seen.add(key)
    names.push(normalized)
  }

  return names.length > 0 ? names : undefined
}

function resolveWindowsDisplayName(
  candidates: Array<{
    value: string | null | undefined
    source: string
    quality: AppDisplayNameQuality
  }>,
  fallbackName: string
): {
  displayName: string
  displayNameSource: string
  displayNameQuality: AppDisplayNameQuality
} {
  const matched = candidates.find((candidate) => candidate.value?.trim())
  if (matched?.value) {
    return {
      displayName: matched.value.trim(),
      displayNameSource: matched.source,
      displayNameQuality: matched.quality
    }
  }

  return {
    displayName: fallbackName,
    displayNameSource: 'fallback',
    displayNameQuality: 'fallback'
  }
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[a-z]:[\\/]/i.test(value) || value.startsWith('\\\\')
}

function normalizeWindowsQuotedPath(value?: string): string {
  return (value || '').trim().replace(/^["']|["']$/g, '')
}

function resolveKnownFolderGuidPath(value: string): string | null {
  const match = value.match(KNOWN_FOLDER_GUID_PATH_PATTERN)
  if (!match) return null

  const resolver = KNOWN_FOLDER_PATH_RESOLVERS[match[1].toLowerCase()]
  if (!resolver) return null

  return path.join(resolver(), match[2])
}

function resolveStartAppDesktopPath(appId: string): string | null {
  const normalized = normalizeWindowsQuotedPath(appId)
  if (!normalized) return null
  if (isWindowsAbsolutePath(normalized)) return normalized
  return resolveKnownFolderGuidPath(normalized)
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

function shouldSkipRegistryAppName(displayName: string): boolean {
  const normalized = displayName.toLowerCase()
  return (
    normalized.includes('uninstall') ||
    normalized.includes('updater') ||
    normalized.includes('update helper') ||
    normalized.includes('maintenance service')
  )
}

function parseRegistryExePath(value?: string): string | null {
  if (!value) return null
  const match = value.match(REGISTRY_DISPLAY_ICON_EXE_PATTERN)
  const candidate = match?.[1] || match?.[2]
  if (!candidate) return null
  return candidate.trim().replace(/^["']|["']$/g, '')
}

async function findExecutableInInstallLocation(installLocation?: string): Promise<string | null> {
  if (!installLocation) return null
  try {
    const entries = await fs.readdir(installLocation)
    const exeFiles = entries
      .filter((entry) => entry.toLowerCase().endsWith('.exe'))
      .filter((entry) => !shouldSkipAppTarget(entry))
    if (exeFiles.length === 0) return null

    exeFiles.sort((left, right) => {
      const leftName = path.basename(left, '.exe').toLowerCase()
      const rightName = path.basename(right, '.exe').toLowerCase()
      const leftPriority = REGISTRY_EXE_PRIORITY.findIndex((token) => leftName.includes(token))
      const rightPriority = REGISTRY_EXE_PRIORITY.findIndex((token) => rightName.includes(token))
      const normalizedLeftPriority = leftPriority === -1 ? Number.MAX_SAFE_INTEGER : leftPriority
      const normalizedRightPriority = rightPriority === -1 ? Number.MAX_SAFE_INTEGER : rightPriority
      return normalizedLeftPriority - normalizedRightPriority || left.length - right.length
    })

    return path.join(installLocation, exeFiles[0])
  } catch {
    return null
  }
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
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : ''
    if (code !== 'ENOENT') {
      windowsAppLog.warn('Failed to enumerate Windows Store apps', { error })
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
  const displayNameMeta = resolveWindowsDisplayName(
    [
      { value: options.fallbackName, source: 'Get-StartApps', quality: 'system' },
      { value: manifestMetadata?.displayName, source: 'AppxManifest', quality: 'manifest' }
    ],
    appId
  )

  return {
    name: options.fallbackName,
    displayName: displayNameMeta.displayName,
    displayNameSource: displayNameMeta.displayNameSource,
    displayNameQuality: displayNameMeta.displayNameQuality,
    identityKind: 'windows-uwp',
    description: manifestMetadata?.description,
    path: buildUwpShellPath(appId),
    icon: logoPath ? await readImageAsDataUrl(logoPath) : '',
    bundleId: packageFamilyName,
    uniqueId: stableId,
    stableId,
    launchKind: 'uwp',
    launchTarget: appId,
    displayPath: WINDOWS_STORE_DISPLAY_PATH,
    alternateNames: normalizeAlternateNames(
      [manifestMetadata?.displayName, packageFamilyName, appId, buildUwpShellPath(appId)],
      displayNameMeta.displayName
    ),
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

      const desktopPath = resolveStartAppDesktopPath(appId)
      if (desktopPath) {
        const stats = await fs.stat(desktopPath).catch(() => null)
        if (!stats?.isFile()) {
          return null
        }
        return await buildDesktopAppInfo(
          desktopPath,
          path.basename(desktopPath),
          stats,
          undefined,
          {
            preferredDisplayName: name,
            displayNameSource: 'Get-StartApps',
            displayNameQuality: 'system'
          }
        )
      }

      if (!appId.includes('!')) return null

      return await buildUwpAppInfo(appId, {
        fallbackName: name,
        lastModified: new Date(0),
        record: entry
      })
    })
  )

  return apps.filter(Boolean) as AppInfo[]
}

type RegistryAppRecord = {
  displayName?: string
  displayIcon?: string
  installLocation?: string
  publisher?: string
  systemComponent?: number
  releaseType?: string
  parentKeyName?: string
}

async function getRegistryAppRecords(): Promise<RegistryAppRecord[]> {
  try {
    const script = [
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      '$paths = @(',
      "  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
      "  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
      "  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'",
      ')',
      '$apps = foreach ($path in $paths) {',
      '  Get-ItemProperty -Path $path -ErrorAction SilentlyContinue | ForEach-Object {',
      '    if (-not $_.DisplayName) { return }',
      '    [PSCustomObject]@{',
      '      DisplayName = [string]$_.DisplayName',
      '      DisplayIcon = [string]$_.DisplayIcon',
      '      InstallLocation = [string]$_.InstallLocation',
      '      Publisher = [string]$_.Publisher',
      '      SystemComponent = [int]($_.SystemComponent -as [int])',
      '      ReleaseType = [string]$_.ReleaseType',
      '      ParentKeyName = [string]$_.ParentKeyName',
      '    }',
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

    const parsed = JSON.parse(raw) as RegistryAppRecord | RegistryAppRecord[]
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : ''
    if (code !== 'ENOENT') {
      windowsAppLog.warn('Failed to enumerate registry apps', { error })
    }
    return []
  }
}

async function buildRegistryAppInfo(record: RegistryAppRecord): Promise<AppInfo | null> {
  const displayName = record.displayName?.trim()
  if (!displayName || shouldSkipRegistryAppName(displayName)) return null
  if (record.systemComponent === 1 || record.releaseType || record.parentKeyName) return null

  const iconExePath = parseRegistryExePath(record.displayIcon)
  const installExePath = await findExecutableInInstallLocation(
    normalizeWindowsQuotedPath(record.installLocation)
  )
  const targetPath = iconExePath || installExePath
  if (!targetPath || shouldSkipAppTarget(targetPath)) return null

  const stats = await fs.stat(targetPath).catch(() => null)
  if (!stats?.isFile()) return null

  const stableId = `registry:${buildPathStableId(targetPath)}`
  const icon = await getAppIcon(targetPath, stableId)
  const fileName = path.basename(targetPath, path.extname(targetPath))

  return {
    name: displayName,
    displayName,
    displayNameSource: 'registry',
    displayNameQuality: 'registry',
    identityKind: 'windows-path',
    description: record.publisher?.trim() || undefined,
    path: targetPath,
    icon,
    bundleId: '',
    uniqueId: stableId,
    stableId,
    launchKind: 'path',
    launchTarget: targetPath,
    displayPath: targetPath,
    alternateNames: normalizeAlternateNames([fileName, targetPath], displayName),
    lastModified: stats.mtime
  }
}

async function listRegistryApps(): Promise<AppInfo[]> {
  const records = await getRegistryAppRecords()
  const apps = await Promise.all(records.map((record) => buildRegistryAppInfo(record)))
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
    } catch (error) {
      windowsAppLog.warn('Failed to extract app icon', {
        error,
        meta: { pathLength: targetPath.length }
      })
    }
  }
  return '' // Return empty string if icon extraction fails
}

async function buildDesktopAppInfo(
  sourcePath: string,
  fileName: string,
  stats: Awaited<ReturnType<typeof fs.stat>>,
  shortcutDetails?: ShortcutDetails,
  displayNameMetadata?: DesktopAppDisplayNameMetadata
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
  const sourceBaseName = path.basename(fileName, path.extname(fileName))
  const targetBaseName = path.basename(targetPath, path.extname(targetPath))
  const displayNameMeta = resolveWindowsDisplayName(
    [
      {
        value: displayNameMetadata?.preferredDisplayName,
        source: displayNameMetadata?.displayNameSource ?? 'system',
        quality: displayNameMetadata?.displayNameQuality ?? 'system'
      },
      { value: sourceBaseName, source: isShortcut ? 'shortcut' : 'filename', quality: 'filename' },
      { value: targetBaseName, source: 'target-filename', quality: 'filename' }
    ],
    sourceBaseName || targetBaseName || targetPath
  )

  return {
    name: sourceBaseName,
    displayName: displayNameMeta.displayName,
    displayNameSource: displayNameMeta.displayNameSource,
    displayNameQuality: displayNameMeta.displayNameQuality,
    identityKind: launchKind === 'shortcut' ? 'windows-shortcut' : 'windows-path',
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
    alternateNames: normalizeAlternateNames(
      [
        displayNameMetadata?.preferredDisplayName,
        sourceBaseName,
        targetBaseName,
        sourcePath,
        targetPath
      ],
      displayNameMeta.displayName
    ),
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
        if (
          stats.isFile() &&
          WINDOWS_DESKTOP_APP_EXTENSIONS.has(path.extname(fileName).toLowerCase())
        ) {
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
  } catch (error) {
    windowsAppLog.warn('Could not read app directory', {
      error,
      meta: { pathLength: filePath.length }
    })
  }
  return results
}

export async function getApps(): Promise<AppInfo[]> {
  const allAppsPromises = [
    ...START_MENU_PATHS.map((item) => fileDisplay(item)),
    listWindowsStoreApps(),
    listRegistryApps(),
    getSteamApps()
  ]

  const results = await Promise.allSettled(allAppsPromises)
  let allApps: AppInfo[] = []

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      allApps = allApps.concat(result.value)
    }
  })

  const uniqueByStableId = new Map<string, AppInfo>()
  const claimedLaunchTargets = new Set<string>()

  for (const app of allApps) {
    const launchTarget = app.launchTarget ? buildPathStableId(app.launchTarget) : ''
    const isDirectPathDuplicate =
      app.launchKind === 'path' &&
      launchTarget &&
      claimedLaunchTargets.has(launchTarget) &&
      app.stableId === launchTarget
    if (
      (app.stableId?.startsWith('registry:') || isDirectPathDuplicate) &&
      launchTarget &&
      claimedLaunchTargets.has(launchTarget)
    ) {
      continue
    }
    const key = app.stableId || app.uniqueId
    if (!key || uniqueByStableId.has(key)) continue
    uniqueByStableId.set(key, app)
    if (!app.stableId?.startsWith('registry:') && launchTarget) {
      claimedLaunchTargets.add(launchTarget)
    }
  }

  const uniqueApps = Array.from(uniqueByStableId.values())

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

    const appPath = resolveStartAppDesktopPath(filePath) || filePath
    const stats = await fs.stat(appPath)
    if (!stats.isFile()) return null

    const fileName = path.basename(appPath)
    if (!WINDOWS_DESKTOP_APP_EXTENSIONS.has(path.extname(fileName).toLowerCase())) {
      return null
    }

    const appDetail = fileName.endsWith('.lnk') ? shell.readShortcutLink(appPath) : undefined
    return await buildDesktopAppInfo(appPath, fileName, stats, appDetail)
  } catch (error) {
    windowsAppLog.warn('Failed to get app info', {
      error,
      meta: { pathLength: filePath.length }
    })
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
