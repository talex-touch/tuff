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
    const preferredNames =
      process.platform === 'darwin'
        ? ['TrayIconTemplate.png', 'tray_icon_22x22.png', 'tray_icon_16x16.png', 'tray_icon.png']
        : ['tray_icon.png']

    if (app.isPackaged) {
      const appPath = app.getAppPath()

      for (const iconName of preferredNames) {
        const potentialPaths = [
          path.resolve(appPath, 'resources', iconName),
          path.resolve(appPath, '..', 'resources', iconName),
          path.resolve(__dirname, '..', '..', '..', 'resources', iconName),
          ...(process.resourcesPath
            ? [path.resolve(process.resourcesPath, 'resources', iconName)]
            : [])
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

      if (process.platform === 'darwin') {
        // Check if using Template.png (required for macOS tray icons)
        const isTemplateFile = iconPath.endsWith('Template.png')
        if (isTemplateFile) {
          const retinaPath = iconPath.replace('Template.png', 'Template@2x.png')
          if (!fse.existsSync(retinaPath)) {
            console.warn('[TrayIconProvider] Retina version not found:', retinaPath)
            console.warn('[TrayIconProvider] Tray icon may appear blurry on Retina displays')
            console.warn(
              '[TrayIconProvider] Recommended: Create TrayIconTemplate@2x.png (44x44 pixels)'
            )
          }
        } else {
          console.warn('[TrayIconProvider] Icon filename does not end with Template.png')
          console.warn(
            '[TrayIconProvider] For macOS tray icons, filename MUST end with Template.png'
          )
          console.warn(
            '[TrayIconProvider] Example: TrayIconTemplate.png (and TrayIconTemplate@2x.png for Retina)'
          )
        }

        // Auto-resize to 22x22 if size is not optimal for macOS
        if (size.width !== 22 || size.height !== 22) {
          if (size.width !== 16 && size.height !== 16) {
            console.warn('[TrayIconProvider] Icon size not optimal for macOS:', size)
            console.warn('[TrayIconProvider] Recommended sizes: 22x22 or 16x16 pixels')
            console.log('[TrayIconProvider] Attempting to resize to 22x22 for optimal display')

            try {
              const resized = image.resize({ width: 22, height: 22, quality: 'best' })
              if (!resized.isEmpty()) {
                console.log('[TrayIconProvider] Successfully resized icon to 22x22')
                return resized
              } else {
                console.warn('[TrayIconProvider] Failed to resize icon, using original')
              }
            } catch (resizeError) {
              console.warn('[TrayIconProvider] Error resizing icon:', resizeError)
              console.warn('[TrayIconProvider] Using original icon size')
            }
          }
        } else {
          console.log('[TrayIconProvider] Icon size is optimal (22x22) for macOS')
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
    const preferredNames =
      process.platform === 'darwin'
        ? ['TrayIconTemplate.png', 'tray_icon_22x22.png', 'tray_icon_16x16.png', 'tray_icon.png']
        : ['tray_icon.png']

    if (app.isPackaged) {
      const appPath = app.getAppPath()

      for (const iconName of preferredNames) {
        const potentialPaths = [
          path.resolve(appPath, 'resources', iconName),
          path.resolve(appPath, '..', 'resources', iconName),
          path.resolve(__dirname, '..', '..', '..', 'resources', iconName),
          ...(process.resourcesPath
            ? [path.resolve(process.resourcesPath, 'resources', iconName)]
            : [])
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
   * Used for Dock icon on macOS, window icon on other platforms
   * @returns Full path to application icon file
   */
  static getAppIconPath(): string {
    if (app.isPackaged) {
      // In packaged app, look for icon.icns (macOS) or icon.png
      const appPath = app.getAppPath()
      const iconNames =
        process.platform === 'darwin' ? ['icon.icns', 'icon.png'] : ['icon.png', 'icon.ico']

      for (const iconName of iconNames) {
        const potentialPaths = [
          path.resolve(appPath, 'resources', iconName),
          path.resolve(appPath, '..', 'resources', iconName),
          path.resolve(__dirname, '..', '..', '..', 'resources', iconName),
          ...(process.resourcesPath
            ? [
                path.resolve(process.resourcesPath, 'resources', iconName),
                path.resolve(process.resourcesPath, 'app', 'resources', iconName)
              ]
            : []),
          // macOS-specific paths (Contents/Resources)
          ...(process.platform === 'darwin'
            ? [
                path.resolve(appPath, '..', '..', '..', 'Resources', iconName),
                path.resolve(appPath, '..', '..', '..', 'Resources', 'app', 'resources', iconName),
                path.resolve(__dirname, '..', '..', '..', '..', '..', 'build', iconName)
              ]
            : [])
        ]

        for (const potentialPath of potentialPaths) {
          if (fse.existsSync(potentialPath)) {
            return potentialPath
          }
        }
      }
    } else {
      // In development, look for icon files in build or resources directory
      const iconNames =
        process.platform === 'darwin' ? ['icon.icns', 'icon.png'] : ['icon.png', 'icon.ico']

      for (const iconName of iconNames) {
        let currentDir = __dirname

        for (let i = 0; i < 10; i++) {
          // Check build directory
          const buildPath = path.resolve(currentDir, 'apps', 'core-app', 'build', iconName)
          if (fse.existsSync(buildPath)) {
            return buildPath
          }

          // Check resources directory
          const resourcesPath = path.resolve(currentDir, 'apps', 'core-app', 'resources', iconName)
          if (fse.existsSync(resourcesPath)) {
            return resourcesPath
          }

          const parentDir = path.dirname(currentDir)
          if (parentDir === currentDir) {
            break
          }
          currentDir = parentDir
        }
      }
    }

    return ''
  }
}
