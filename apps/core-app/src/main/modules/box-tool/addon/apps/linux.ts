import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import type { ScannedAppInfo } from './app-types'
import { resolveScannedAppCreatedAt } from './app-types'

type AppInfo = ScannedAppInfo

/**
 * Resolves the directories that hold `.desktop` entries on this machine.
 *
 * The list used to be three hardcoded paths, which missed flatpak entirely -- flatpak exports to
 * its own prefixes and does not copy into `/usr/share/applications`, so on a Silverblue box, or
 * for the growing share of Ubuntu/Mint users who install that way, those applications were
 * invisible to search with nothing to indicate they had been skipped.
 *
 * `XDG_DATA_DIRS` and `XDG_DATA_HOME` are the mechanism the desktop already uses to answer this
 * question, and reading them covers flatpak, nix and custom prefixes without enumerating any of
 * them. The spec defaults are applied when unset, which is what produced the old `/usr/share`
 * entry anyway.
 *
 * Snap and flatpak roots are then added explicitly rather than relied on through XDG. Both are
 * normally injected into `XDG_DATA_DIRS` by a profile script, and a profile script only runs for
 * login shells -- an Electron app launched from a `.desktop` entry or a session manager can
 * legitimately see a minimal environment. Adding them costs nothing: findDesktopFiles swallows
 * errors for directories that do not exist.
 */
export function resolveApplicationRoots(
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir()
): string[] {
  const dataHome = env.XDG_DATA_HOME?.trim() || path.join(home, '.local', 'share')
  const dataDirs = (env.XDG_DATA_DIRS?.trim() || '/usr/local/share:/usr/share')
    .split(':')
    .map((entry) => entry.trim())
    .filter(Boolean)

  const roots = [dataHome, ...dataDirs].map((dir) => path.join(dir, 'applications'))

  roots.push('/var/lib/snapd/desktop/applications')
  roots.push('/var/lib/flatpak/exports/share/applications')
  roots.push(path.join(dataHome, 'flatpak', 'exports', 'share', 'applications'))

  return [...new Set(roots)]
}

/**
 * Icon theme roots, in the order a desktop would consult them.
 *
 * The lookup below used to hardcode `/usr/share/icons`, so a flatpak or user-installed app could
 * be found by resolveApplicationRoots and then render with no icon -- its theme lives under its
 * own prefix. Per-user roots come first because a user-installed theme should win over the system
 * copy of the same name.
 */
export function resolveIconRoots(
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir()
): string[] {
  const dataHome = env.XDG_DATA_HOME?.trim() || path.join(home, '.local', 'share')
  const dataDirs = (env.XDG_DATA_DIRS?.trim() || '/usr/local/share:/usr/share')
    .split(':')
    .map((entry) => entry.trim())
    .filter(Boolean)

  const roots = [
    path.join(dataHome, 'icons'),
    path.join(dataHome, 'flatpak', 'exports', 'share', 'icons'),
    '/var/lib/flatpak/exports/share/icons',
    ...dataDirs.map((dir) => path.join(dir, 'icons'))
  ]

  return [...new Set(roots)]
}

const MAX_DESKTOP_SCAN_DEPTH = 8
const DESKTOP_FIELD_CODE_PATTERN = /^%[fFuUdDnNickvm]$/

function isPathInsideDir(candidatePath: string, rootDir: string): boolean {
  const relative = path.relative(rootDir, candidatePath)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export function tokenizeDesktopExec(rawExec: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let inToken = false

  for (let i = 0; i < rawExec.length; i += 1) {
    const ch = rawExec[i]
    if (quote) {
      if (quote === '"' && ch === '\\' && i + 1 < rawExec.length) {
        current += rawExec[i + 1]
        i += 1
        continue
      }
      if (ch === quote) {
        quote = null
        continue
      }
      current += ch
      continue
    }

    if (ch === '"' || ch === "'") {
      quote = ch
      inToken = true
      continue
    }
    if (ch === '\\' && i + 1 < rawExec.length) {
      current += rawExec[i + 1]
      i += 1
      inToken = true
      continue
    }
    if (/\s/.test(ch)) {
      if (inToken) {
        tokens.push(current)
        current = ''
        inToken = false
      }
      continue
    }
    current += ch
    inToken = true
  }

  if (inToken) {
    tokens.push(current)
  }

  const cleaned: string[] = []
  for (const token of tokens) {
    if (DESKTOP_FIELD_CODE_PATTERN.test(token)) {
      continue
    }
    const stripped = token.replace(/%([%fFuUdDnNickvm])/g, (_match, code: string) =>
      code === '%' ? '%' : ''
    )
    if (stripped) {
      cleaned.push(stripped)
    }
  }
  return cleaned
}

function serializeLaunchArgs(args: readonly string[]): string | undefined {
  if (args.length === 0) return undefined
  return args.map((arg) => (/\s/.test(arg) ? `"${arg.replace(/"/g, '')}"` : arg)).join(' ')
}

function resolveDesktopStableId(desktopFilePath: string, rootDir?: string): string {
  if (rootDir && isPathInsideDir(desktopFilePath, rootDir)) {
    return path.relative(rootDir, desktopFilePath).split(path.sep).join('-')
  }
  return path.basename(desktopFilePath)
}

export async function findIconPath(
  iconName: string,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir()
): Promise<string> {
  if (!iconName || /[\r\n\0]/.test(iconName)) return ''

  if (path.isAbsolute(iconName)) {
    const stat = await fs.stat(iconName).catch(() => null)
    return stat?.isFile() ? iconName : ''
  }

  if (iconName.includes('/') || iconName.includes('\\') || iconName.includes('..')) {
    return ''
  }

  const themes = ['Yaru', 'hicolor', 'Adwaita', 'ubuntu-mono-dark', 'ubuntu-mono-light', 'Humanity']
  // Prefer the vector (scalable) icon, then the largest raster, down to 48px —
  // the previous order picked 48px first and looked upscaled in the result slot.
  const sizes = ['scalable', '512x512', '256x256', '128x128', '64x64', '48x48']
  const types = ['apps', 'categories', 'devices', 'mimetypes', 'places', 'status']
  const exts = ['.png', '.svg']

  // Roots are filtered to the ones that exist before the search, not inside it. The theme x size
  // x type x extension sweep is 432 probes per application in the worst case, and multiplying
  // that by every candidate root -- most of which are absent on any given machine -- is what
  // would have made adding flatpak support expensive. Four stats up front bound it instead.
  const roots: string[] = []
  for (const root of resolveIconRoots(env, home)) {
    const stat = await fs.stat(root).catch(() => null)
    if (stat?.isDirectory()) roots.push(path.resolve(root))
  }

  for (const theme of themes) {
    for (const size of sizes) {
      for (const type of types) {
        for (const ext of exts) {
          // Roots innermost: a system app still resolves at the first theme that carries it, and a
          // flatpak app resolves at the same point under its own prefix, rather than after the
          // whole system sweep has missed.
          for (const root of roots) {
            const iconPath = path.resolve(root, theme, size, type, `${iconName}${ext}`)
            if (!isPathInsideDir(iconPath, root)) continue
            const stat = await fs.stat(iconPath).catch(() => null)
            if (stat?.isFile()) {
              return iconPath
            }
          }
        }
      }
    }
  }

  for (const root of roots) {
    const pixmapsDir = path.resolve(path.dirname(root), 'pixmaps')
    const pixmapPath = path.resolve(pixmapsDir, `${iconName}.png`)
    if (!isPathInsideDir(pixmapPath, pixmapsDir)) continue
    const stat = await fs.stat(pixmapPath).catch(() => null)
    if (stat?.isFile()) {
      return pixmapPath
    }
  }

  return ''
}

export async function parseDesktopFile(
  desktopFilePath: string,
  rootDir?: string
): Promise<AppInfo | null> {
  try {
    const content = await fs.readFile(desktopFilePath, 'utf8')
    if (!content.includes('[Desktop Entry]')) {
      return null
    }

    const entryContent = content.substring(content.indexOf('[Desktop Entry]')).split('\n[')[0]
    const properties: Record<string, string> = {}
    entryContent.match(/^[\w\-[\]]+ ?=.*$/gm)?.forEach((line) => {
      const [key, ...valueParts] = line.split('=')
      if (key && valueParts.length > 0) {
        properties[key.trim()] = valueParts.join('=').trim()
      }
    })

    const lang = process.env.LANG?.split('.')[0] || 'en'
    const name = properties[`Name[${lang}]`] || properties.Name
    const exec = properties.Exec
    const iconName = properties.Icon
    const noDisplay = properties.NoDisplay === 'true'
    const type = properties.Type
    const workingDirectory = properties.Path?.trim() || undefined

    if (type !== 'Application' || !name || !exec || noDisplay) {
      return null
    }

    const execTokens = tokenizeDesktopExec(exec)
    const execPath = execTokens[0]
    if (!execPath) {
      return null
    }
    const launchArgs = serializeLaunchArgs(execTokens.slice(1))
    const iconPath = iconName ? await findIconPath(iconName) : ''
    const stats = await fs.stat(desktopFilePath)
    const stableId = resolveDesktopStableId(desktopFilePath, rootDir)

    return {
      name,
      path: execPath,
      icon: iconPath ? `file://${iconPath}` : '',
      bundleId: '',
      uniqueId: desktopFilePath, // Use .desktop file path as uniqueId
      stableId,
      identityKind: 'linux-desktop',
      launchKind: launchArgs ? 'shortcut' : 'path',
      launchTarget: execPath,
      ...(launchArgs ? { launchArgs } : {}),
      ...(workingDirectory ? { workingDirectory } : {}),
      displayPath: desktopFilePath,
      lastModified: stats.mtime,
      createdAt: resolveScannedAppCreatedAt(stats)
    }
  } catch {
    return null
  }
}

export async function findDesktopFiles(
  dir: string,
  visitedDirs: Set<string> = new Set(),
  depth = 0
): Promise<string[]> {
  if (depth > MAX_DESKTOP_SCAN_DEPTH) {
    return []
  }

  let desktopFiles: string[] = []
  try {
    const dirStat = await fs.stat(dir)
    if (!dirStat.isDirectory()) return []
    const dirKey = `${dirStat.dev}:${dirStat.ino}`
    if (visitedDirs.has(dirKey)) {
      return []
    }
    visitedDirs.add(dirKey)

    const files = await fs.readdir(dir)
    for (const file of files) {
      const fullPath = path.join(dir, file)
      try {
        const lstats = await fs.lstat(fullPath)
        if (lstats.isDirectory()) {
          if (depth < MAX_DESKTOP_SCAN_DEPTH) {
            desktopFiles = desktopFiles.concat(
              await findDesktopFiles(fullPath, visitedDirs, depth + 1)
            )
          }
        } else if (lstats.isSymbolicLink()) {
          const targetStat = await fs.stat(fullPath)
          if (targetStat.isDirectory()) {
            const targetKey = `${targetStat.dev}:${targetStat.ino}`
            if (depth < MAX_DESKTOP_SCAN_DEPTH && !visitedDirs.has(targetKey)) {
              desktopFiles = desktopFiles.concat(
                await findDesktopFiles(fullPath, visitedDirs, depth + 1)
              )
            }
          } else if (targetStat.isFile() && file.endsWith('.desktop')) {
            desktopFiles.push(fullPath)
          }
        } else if (lstats.isFile() && file.endsWith('.desktop')) {
          desktopFiles.push(fullPath)
        }
      } catch {
        // ignore individual file errors
      }
    }
  } catch {
    // ignore directory errors
  }
  return desktopFiles
}

export async function getApps(): Promise<AppInfo[]> {
  const roots = resolveApplicationRoots()
  const nestedDesktopEntries = await Promise.all(
    roots.map(async (root) => {
      const files = await findDesktopFiles(root)
      return files.map((file) => ({ file, root }))
    })
  )
  const allDesktopEntries = nestedDesktopEntries.flat()

  const appInfoPromises = allDesktopEntries.map(({ file, root }) => parseDesktopFile(file, root))
  const results = await Promise.all(appInfoPromises)

  return results.filter((app): app is AppInfo => app !== null)
}

export async function getAppInfo(filePath: string): Promise<AppInfo | null> {
  if (!filePath.endsWith('.desktop')) {
    // On Linux, we are primarily interested in .desktop files.
    // The watcher might pick up other changes which we can ignore.
    return null
  }
  return parseDesktopFile(filePath)
}
