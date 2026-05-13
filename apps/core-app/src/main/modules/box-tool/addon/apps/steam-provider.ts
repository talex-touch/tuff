import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execFileSafe } from '@talex-touch/utils/common/utils/safe-shell'
import type { ScannedAppInfo } from './app-types'

export interface SteamAppInfo {
  appid: string
  name: string
  installdir?: string
  libraryPath: string
}

const STEAM_PROTOCOL_PATTERN = /^steam:\/\/rungameid\/(\d+)$/i

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function stripVdfQuotes(value: string): string {
  return value.trim().replace(/^"|"$/g, '')
}

function normalizeVdfPath(value: string): string {
  return value.replace(/\\\\/g, '\\').replace(/\\\//g, '/')
}

function parseVdfKeyValue(line: string): { key: string; value: string } | null {
  const match = line.trim().match(/^"([^"]+)"\s+"([\s\S]*)"$/)
  if (!match) return null
  return { key: match[1], value: normalizeVdfPath(stripVdfQuotes(match[2])) }
}

export function parseSteamLibraryFolders(content: string, steamRoot: string): string[] {
  const libraries = new Set<string>([steamRoot])
  const lines = content.split(/\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    const parsed = parseVdfKeyValue(lines[index])
    if (!parsed) continue

    if (parsed.key === 'path') {
      libraries.add(parsed.value)
      continue
    }

    if (/^\d+$/.test(parsed.key) && path.isAbsolute(parsed.value)) {
      libraries.add(parsed.value)
    }
  }

  return Array.from(libraries)
}

export function parseSteamAppManifest(content: string, libraryPath: string): SteamAppInfo | null {
  const fields = new Map<string, string>()
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseVdfKeyValue(line)
    if (parsed) fields.set(parsed.key.toLowerCase(), parsed.value)
  }

  const appid = fields.get('appid')
  const name = fields.get('name')
  if (!appid || !/^\d+$/.test(appid) || !name) return null

  return {
    appid,
    name,
    installdir: normalizeOptionalString(fields.get('installdir')),
    libraryPath
  }
}

async function pathExists(directory: string): Promise<boolean> {
  try {
    const stats = await fs.stat(directory)
    return stats.isDirectory()
  } catch {
    return false
  }
}

async function getSteamPathFromRegistry(): Promise<string | null> {
  try {
    const { stdout } = await execFileSafe(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
      { windowsHide: true }
    )
    const match = stdout.match(/SteamPath\s+REG_\w+\s+(.+)/i)
    return normalizeOptionalString(match?.[1]) ?? null
  } catch {
    return null
  }
}

async function resolveSteamRootCandidates(): Promise<string[]> {
  const candidates = [
    await getSteamPathFromRegistry(),
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Steam') : '',
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Steam') : '',
    'C:\\Program Files (x86)\\Steam',
    path.join(os.homedir(), 'AppData\\Local\\Steam')
  ].filter((value): value is string => Boolean(value?.trim()))

  return Array.from(new Set(candidates))
}

async function loadSteamLibraries(steamRoot: string): Promise<string[]> {
  const libraryFoldersPath = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf')
  try {
    const content = await fs.readFile(libraryFoldersPath, 'utf8')
    return parseSteamLibraryFolders(content, steamRoot)
  } catch {
    return [steamRoot]
  }
}

async function loadSteamAppsFromLibrary(libraryPath: string): Promise<SteamAppInfo[]> {
  const steamAppsPath = path.join(libraryPath, 'steamapps')
  try {
    const entries = await fs.readdir(steamAppsPath)
    const manifestFiles = entries.filter((entry) => /^appmanifest_\d+\.acf$/i.test(entry))
    const apps = await Promise.all(
      manifestFiles.map(async (fileName) => {
        try {
          const content = await fs.readFile(path.join(steamAppsPath, fileName), 'utf8')
          return parseSteamAppManifest(content, libraryPath)
        } catch {
          return null
        }
      })
    )
    return apps.filter(Boolean) as SteamAppInfo[]
  } catch {
    return []
  }
}

export function steamAppToScannedAppInfo(app: SteamAppInfo): ScannedAppInfo {
  const launchTarget = `steam://rungameid/${app.appid}`
  if (!STEAM_PROTOCOL_PATTERN.test(launchTarget)) {
    throw new Error(`Invalid Steam launch target: ${launchTarget}`)
  }

  const installDir = app.installdir
    ? path.join(app.libraryPath, 'steamapps', 'common', app.installdir)
    : ''

  return {
    name: app.name,
    displayName: app.name,
    displayNameSource: 'Steam appmanifest',
    displayNameQuality: 'manifest',
    identityKind: 'windows-protocol',
    path: launchTarget,
    icon: '',
    bundleId: `steam:${app.appid}`,
    uniqueId: `steam:${app.appid}`,
    stableId: `steam:${app.appid}`,
    launchKind: 'protocol',
    launchTarget,
    displayPath: 'Steam',
    alternateNames: [app.name, app.appid, app.installdir, installDir].filter(
      (value): value is string => Boolean(value?.trim())
    ),
    description: 'Steam',
    lastModified: new Date(0)
  }
}

export async function getSteamApps(): Promise<ScannedAppInfo[]> {
  const roots = await resolveSteamRootCandidates()
  const appsById = new Map<string, SteamAppInfo>()

  for (const root of roots) {
    if (!(await pathExists(root))) continue

    const libraries = await loadSteamLibraries(root)
    for (const libraryPath of libraries) {
      const apps = await loadSteamAppsFromLibrary(libraryPath)
      for (const app of apps) {
        if (!appsById.has(app.appid)) {
          appsById.set(app.appid, app)
        }
      }
    }
  }

  return Array.from(appsById.values()).map(steamAppToScannedAppInfo)
}
