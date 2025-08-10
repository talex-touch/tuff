import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { shell } from 'electron'

// Define the structure for our app info, consistent with other platforms
interface AppInfo {
  name: string
  path: string
  icon: string
  bundleId: string
  uniqueId: string
  lastModified: Date
}

const ICON_CACHE_DIR = path.join(os.tmpdir(), 'talex-touch-app-icons-win')

async function getAppIcon(targetPath: string, appName: string): Promise<string> {
  await fs.mkdir(ICON_CACHE_DIR, { recursive: true })
  const iconPath = path.join(ICON_CACHE_DIR, `${appName}.png`)

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
        await fs.writeFile(iconPath, buffer)
        return `data:image/png;base64,${buffer.toString('base64')}`
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
          let appDetail: { target?: string } = {}
          if (fileName.endsWith('.lnk')) {
            try {
              appDetail = shell.readShortcutLink(fileDir)
            } catch (e) {
              continue // Ignore broken shortcuts
            }
          } else {
            appDetail.target = fileDir
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
            icon: icon,
            bundleId: '', // Windows doesn't have bundleId
            uniqueId: targetPath, // Use full path as uniqueId
            lastModified: targetStats.mtime
          })
        } else if (stats.isDirectory()) {
          results = results.concat(await fileDisplay(fileDir))
        }
      } catch (e) {
        // Ignore errors for individual files/directories
      }
    }
  } catch (err) {
    console.warn(`[Win] Could not read directory: ${filePath}`, err)
  }
  return results
}

export default async (): Promise<AppInfo[]> => {
  const startMenuPath1 = path.resolve('C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs')
  const startMenuPath2 = path.join(os.homedir(), 'AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs')

  const allAppsPromises = [
    fileDisplay(startMenuPath1),
    fileDisplay(startMenuPath2)
  ]

  const results = await Promise.allSettled(allAppsPromises)
  let allApps: AppInfo[] = []

  results.forEach(result => {
    if (result.status === 'fulfilled') {
      allApps = allApps.concat(result.value)
    }
  })

  // Remove duplicates based on uniqueId (the path)
  const uniqueApps = Array.from(new Map(allApps.map(app => [app.uniqueId, app])).values())
  
  return uniqueApps
}