import path from 'path'
import fs from 'fs/promises'
import os from 'os'

interface AppInfo {
  name: string
  path: string
  icon: string
  bundleId: string
  uniqueId: string
  lastModified: Date
}

const APP_PATHS = [
  '/usr/share/applications',
  '/var/lib/snapd/desktop/applications',
  `${os.homedir()}/.local/share/applications`
]

async function findIconPath(iconName: string): Promise<string> {
  if (path.isAbsolute(iconName) && (await fs.stat(iconName).catch(() => null))) {
    return iconName
  }

  const themes = ['Yaru', 'hicolor', 'Adwaita', 'ubuntu-mono-dark', 'ubuntu-mono-light', 'Humanity']
  const sizes = ['48x48', 'scalable', '256x256', '512x512', '64x64']
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
      .replace(/ %[A-Za-z]/g, '')
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
      lastModified: stats.mtime
    }
  } catch (e) {
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
  const allDesktopFilesPromises = APP_PATHS.map((p) => findDesktopFiles(p))
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
