import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import type { ScannedAppInfo } from './app-types'

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

async function findIconPath(iconName: string): Promise<string> {
  if (path.isAbsolute(iconName) && (await fs.stat(iconName).catch(() => null))) {
    return iconName
  }

  const themes = ['Yaru', 'hicolor', 'Adwaita', 'ubuntu-mono-dark', 'ubuntu-mono-light', 'Humanity']
  // Prefer the vector (scalable) icon, then the largest raster, down to 48px —
  // the previous order picked 48px first and looked upscaled in the result slot.
  const sizes = ['scalable', '512x512', '256x256', '128x128', '64x64', '48x48']
  const types = ['apps', 'categories', 'devices', 'mimetypes', 'places', 'status']
  const exts = ['.png', '.svg']

  for (const theme of themes) {
    for (const size of sizes) {
      for (const type of types) {
        for (const ext of exts) {
          const iconPath = path.join('/usr/share/icons', theme, size, type, `${iconName}${ext}`)
          if (await fs.stat(iconPath).catch(() => null)) {
            return iconPath
          }
        }
      }
    }
  }

  const pixmapPath = path.join('/usr/share/pixmaps', `${iconName}.png`)
  if (await fs.stat(pixmapPath).catch(() => null)) {
    return pixmapPath
  }

  return ''
}

async function parseDesktopFile(desktopFilePath: string): Promise<AppInfo | null> {
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

    if (type !== 'Application' || !name || !exec || noDisplay) {
      return null
    }

    const execPath = exec
      .replace(/ %[A-Z]/gi, '')
      .replace(/"/g, '')
      .trim()
      .split(' ')[0]
    const iconPath = iconName ? await findIconPath(iconName) : ''
    const stats = await fs.stat(desktopFilePath)

    return {
      name,
      path: execPath,
      icon: iconPath ? `file://${iconPath}` : '',
      bundleId: '',
      uniqueId: desktopFilePath, // Use .desktop file path as uniqueId
      stableId: execPath,
      launchKind: 'path',
      launchTarget: execPath,
      displayPath: desktopFilePath,
      lastModified: stats.mtime
    }
  } catch {
    return null
  }
}

async function findDesktopFiles(dir: string): Promise<string[]> {
  let desktopFiles: string[] = []
  try {
    const files = await fs.readdir(dir)
    for (const file of files) {
      const fullPath = path.join(dir, file)
      try {
        const stats = await fs.stat(fullPath)
        if (stats.isDirectory()) {
          desktopFiles = desktopFiles.concat(await findDesktopFiles(fullPath))
        } else if (file.endsWith('.desktop')) {
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
  const allDesktopFilesPromises = resolveApplicationRoots().map((p) => findDesktopFiles(p))
  const nestedDesktopFiles = await Promise.all(allDesktopFilesPromises)
  const allDesktopFiles = nestedDesktopFiles.flat()

  const appInfoPromises = allDesktopFiles.map((file) => parseDesktopFile(file))
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
