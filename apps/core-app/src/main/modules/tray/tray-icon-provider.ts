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

    // macOS requires Template.png suffix for template images
    // Electron automatically handles @2x version if filename matches pattern
    const preferredNames = process.platform === 'darwin'
      ? ['TrayIconTemplate.png', 'tray_icon_22x22.png', 'tray_icon_16x16.png', 'tray_icon.png']
      : ['tray_icon.png']

    if (app.isPackaged) {
      const appPath = app.getAppPath()

      for (const iconName of preferredNames) {
        const potentialPaths = [
          path.resolve(appPath, 'resources', iconName),
          path.resolve(appPath, '..', 'resources', iconName),
          path.resolve(__dirname, '..', '..', '..', 'resources', iconName),
          ...(process.resourcesPath ? [path.resolve(process.resourcesPath, 'resources', iconName)] : [])
        ]

        for (const potentialPath of potentialPaths) {
          if (fse.existsSync(potentialPath)) {
            iconPath = potentialPath
            break
          }
        }

        if (iconPath) break
      }

      if (!iconPath) {
        iconPath = path.resolve(appPath, 'resources', 'tray_icon.png')
      }
    } else {
      iconPath = ''

      for (const iconName of preferredNames) {
        let currentDir = __dirname

        for (let i = 0; i < 10; i++) {
          const potentialPath = path.resolve(currentDir, 'apps', 'core-app', 'resources', iconName)
          if (fse.existsSync(potentialPath)) {
            iconPath = potentialPath
            break
          }

          const altPath = path.resolve(currentDir, 'resources', iconName)
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

        if (iconPath) break
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
        // Check if using Template.png (required for macOS tray icons)
        const isTemplateFile = iconPath.endsWith('Template.png')
        if (isTemplateFile) {
          console.log('[TrayIconProvider] Using Template.png file (macOS template image)')
        } else {
          console.warn('[TrayIconProvider] Icon filename does not end with Template.png')
          console.warn('[TrayIconProvider] For macOS tray icons, filename MUST end with Template.png')
          console.warn('[TrayIconProvider] Example: TrayIconTemplate.png (and TrayIconTemplate@2x.png for Retina)')
        }

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

    // macOS requires Template.png suffix for template images
    // Electron automatically handles @2x version if filename matches pattern
    const preferredNames = process.platform === 'darwin'
      ? ['TrayIconTemplate.png', 'tray_icon_22x22.png', 'tray_icon_16x16.png', 'tray_icon.png']
      : ['tray_icon.png']

    if (app.isPackaged) {
      const appPath = app.getAppPath()

      for (const iconName of preferredNames) {
        const potentialPaths = [
          path.resolve(appPath, 'resources', iconName),
          path.resolve(appPath, '..', 'resources', iconName),
          path.resolve(__dirname, '..', '..', '..', 'resources', iconName),
          ...(process.resourcesPath ? [path.resolve(process.resourcesPath, 'resources', iconName)] : [])
        ]

        for (const potentialPath of potentialPaths) {
          if (fse.existsSync(potentialPath)) {
            iconPath = potentialPath
            break
          }
        }

        if (iconPath) break
      }

      if (!iconPath) {
        iconPath = path.resolve(appPath, 'resources', 'tray_icon.png')
      }
    } else {
      iconPath = ''

      for (const iconName of preferredNames) {
        let currentDir = __dirname

        for (let i = 0; i < 10; i++) {
          const potentialPath = path.resolve(currentDir, 'apps', 'core-app', 'resources', iconName)
          if (fse.existsSync(potentialPath)) {
            iconPath = potentialPath
            break
          }

          const altPath = path.resolve(currentDir, 'resources', iconName)
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

        if (iconPath) break
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
