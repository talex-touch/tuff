import { nativeImage, app } from 'electron'
import * as path from 'path'
import * as fse from 'fs-extra'

/**
 * Tray icon provider
 *
 * Manages tray icon resource loading, supports both development and packaged environments
 * Uses local file paths, compatible with macOS, Windows and Linux platforms
 */
export class TrayIconProvider {
  /**
   * Get tray icon using local file path
   * @returns NativeImage object for tray icon, returns empty image if loading fails
   */
  static getIcon(): Electron.NativeImage {
    let iconPath: string = ''

    if (app.isPackaged) {
      const appPath = app.getAppPath()
      const potentialPaths = [
        path.resolve(appPath, 'resources', 'tray_icon.png'),
        path.resolve(appPath, '..', 'resources', 'tray_icon.png'),
        path.resolve(__dirname, '..', '..', '..', 'resources', 'tray_icon.png'),
        ...(process.resourcesPath ? [path.resolve(process.resourcesPath, 'resources', 'tray_icon.png')] : [])
      ]

      for (const potentialPath of potentialPaths) {
        if (fse.existsSync(potentialPath)) {
          iconPath = potentialPath
          break
        }
      }

      if (!iconPath) {
        iconPath = path.resolve(appPath, 'resources', 'tray_icon.png')
      }
    } else {
      let currentDir = __dirname
      iconPath = ''

      for (let i = 0; i < 10; i++) {
        const potentialPath = path.resolve(currentDir, 'apps', 'core-app', 'resources', 'tray_icon.png')
        if (fse.existsSync(potentialPath)) {
          iconPath = potentialPath
          break
        }

        const altPath = path.resolve(currentDir, 'resources', 'tray_icon.png')
        if (fse.existsSync(altPath)) {
          iconPath = altPath
          break
        }

        const parentDir = path.dirname(currentDir)
        if (parentDir === currentDir) {
          break
        }
        currentDir = parentDir
      }

      if (!iconPath) {
        iconPath = path.resolve(__dirname, '../../../../apps/core-app/resources/tray_icon.png')
        console.warn('[TrayIconProvider] Using fallback path:', iconPath)
      }
    }

    if (!iconPath || !fse.existsSync(iconPath)) {
      console.error('[TrayIconProvider] Icon file not found at:', iconPath)
      console.log('[TrayIconProvider] __dirname:', __dirname)
      console.log('[TrayIconProvider] process.cwd():', process.cwd())
      return nativeImage.createEmpty()
    }

    try {
      const image = nativeImage.createFromPath(iconPath)

      if (image.isEmpty()) {
        console.error('[TrayIconProvider] Loaded icon is empty:', iconPath)
        console.error('[TrayIconProvider] This will prevent tray icon from displaying')
        return nativeImage.createEmpty()
      }

      const size = image.getSize()
      console.log('[TrayIconProvider] Successfully loaded icon from:', iconPath)
      console.log('[TrayIconProvider] Icon size:', size)

      if (process.platform === 'darwin') {
        if (size.width !== 22 && size.width !== 16 && size.height !== 22 && size.height !== 16) {
          console.warn('[TrayIconProvider] Icon size may not be optimal for macOS:', size)
          console.warn('[TrayIconProvider] Recommended sizes: 22x22 or 16x16 pixels')
        }
      }

      return image
    } catch (error) {
      console.error('[TrayIconProvider] Failed to load tray icon from path:', iconPath, error)
      return nativeImage.createEmpty()
    }
  }

  /**
   * Get tray icon file path
   * @returns Full absolute path to icon file
   */
  static getIconPath(): string {
    let iconPath: string = ''

    if (app.isPackaged) {
      const appPath = app.getAppPath()
      const potentialPaths = [
        path.resolve(appPath, 'resources', 'tray_icon.png'),
        path.resolve(appPath, '..', 'resources', 'tray_icon.png'),
        path.resolve(__dirname, '..', '..', '..', 'resources', 'tray_icon.png'),
        ...(process.resourcesPath ? [path.resolve(process.resourcesPath, 'resources', 'tray_icon.png')] : [])
      ]

      for (const potentialPath of potentialPaths) {
        if (fse.existsSync(potentialPath)) {
          iconPath = potentialPath
          break
        }
      }

      if (!iconPath) {
        iconPath = path.resolve(appPath, 'resources', 'tray_icon.png')
      }
    } else {
      let currentDir = __dirname
      iconPath = ''

      for (let i = 0; i < 10; i++) {
        const potentialPath = path.resolve(currentDir, 'apps', 'core-app', 'resources', 'tray_icon.png')
        if (fse.existsSync(potentialPath)) {
          iconPath = potentialPath
          break
        }

        const altPath = path.resolve(currentDir, 'resources', 'tray_icon.png')
        if (fse.existsSync(altPath)) {
          iconPath = altPath
          break
        }

        const parentDir = path.dirname(currentDir)
        if (parentDir === currentDir) {
          break
        }
        currentDir = parentDir
      }

      if (!iconPath) {
        iconPath = path.resolve(__dirname, '../../../../apps/core-app/resources/tray_icon.png')
        console.warn('[TrayIconProvider] Using fallback path:', iconPath)
      }
    }

    return iconPath
  }

  /**
   * Get application icon path
   * Reserved for other purposes (Dock icon, window icon, etc.)
   * @returns Full path to application icon, currently returns empty string
   */
  static getAppIconPath(): string {
    return ''
  }
}
