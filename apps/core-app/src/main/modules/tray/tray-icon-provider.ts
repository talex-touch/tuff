import * as path from 'node:path'
import { app, nativeImage } from 'electron'
import * as fse from 'fs-extra'

import { createLogger } from '../../utils/logger'

const trayLog = createLogger('TrayIconProvider')

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
    const preferredNames
      = process.platform === 'darwin'
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
            : []),
        ]

        for (const potentialPath of potentialPaths) {
          if (fse.existsSync(potentialPath)) {
            iconPath = potentialPath
            break
          }
        }

        if (iconPath)
          break
      }

      if (!iconPath) {
        iconPath = path.resolve(appPath, 'resources', 'tray_icon.png')
      }
    }
    else {
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

        if (iconPath)
          break
      }

      if (!iconPath) {
        iconPath = path.resolve(__dirname, '../../../../apps/core-app/resources/tray_icon.png')
        trayLog.warn('Using fallback tray icon path', { meta: { iconPath } })
      }
    }

    if (!iconPath || !fse.existsSync(iconPath)) {
      trayLog.error('Icon file not found', { meta: { iconPath } })
      trayLog.debug('__dirname resolved', { meta: { dirname: __dirname } })
      trayLog.debug('process cwd resolved', { meta: { cwd: process.cwd() } })
      return nativeImage.createEmpty()
    }

    try {
      const image = nativeImage.createFromPath(iconPath)

      if (image.isEmpty()) {
        trayLog.error('Loaded icon is empty', { meta: { iconPath } })
        trayLog.error('Empty icon prevents tray display')
        return nativeImage.createEmpty()
      }

      const size = image.getSize()

      if (process.platform === 'darwin') {
        // Check if using Template.png (required for macOS tray icons)
        const isTemplateFile = iconPath.endsWith('Template.png')
        if (isTemplateFile) {
          const retinaPath = iconPath.replace('Template.png', 'Template@2x.png')
          if (!fse.existsSync(retinaPath)) {
            trayLog.warn('Retina tray icon missing', { meta: { retinaPath } })
            trayLog.warn('Tray icon may appear blurry on Retina displays')
            trayLog.warn('Recommended: create TrayIconTemplate@2x.png (44x44 pixels)')
          }
        }
        else {
          trayLog.warn('Icon filename does not end with Template.png')
          trayLog.warn('macOS tray icons MUST use Template.png suffix')
          trayLog.warn('Example: TrayIconTemplate.png + TrayIconTemplate@2x.png')
        }

        // Auto-resize to 22x22 if size is not optimal for macOS
        if (size.width !== 22 || size.height !== 22) {
          if (size.width !== 16 && size.height !== 16) {
            trayLog.warn('Icon size not optimal for macOS', {
              meta: { width: size.width, height: size.height }
            })
            trayLog.warn('Recommended tray icon sizes: 22x22 or 16x16 pixels')
            trayLog.info('Attempting to resize to 22x22 for optimal display')

            try {
              const resized = image.resize({ width: 22, height: 22, quality: 'best' })
              if (!resized.isEmpty()) {
                trayLog.success('Successfully resized tray icon to 22x22')
                return resized
              }
              else {
                trayLog.warn('Failed to resize icon, using original size')
              }
            }
            catch (resizeError) {
              trayLog.warn('Error resizing icon', { error: resizeError })
              trayLog.warn('Using original icon size')
            }
          }
        }
        else {
          trayLog.success('Icon size is optimal (22x22) for macOS')
        }
      }

      return image
    }
    catch (error) {
      trayLog.error('Failed to load tray icon', { meta: { iconPath }, error })
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
    const preferredNames
      = process.platform === 'darwin'
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
            : []),
        ]

        for (const potentialPath of potentialPaths) {
          if (fse.existsSync(potentialPath)) {
            iconPath = potentialPath
            break
          }
        }

        if (iconPath)
          break
      }

      if (!iconPath) {
        iconPath = path.resolve(appPath, 'resources', 'tray_icon.png')
      }
    }
    else {
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

        if (iconPath)
          break
      }

      if (!iconPath) {
        iconPath = path.resolve(__dirname, '../../../../apps/core-app/resources/tray_icon.png')
        trayLog.warn('Using fallback tray icon path', { meta: { iconPath } })
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
      const iconNames
        = process.platform === 'darwin' ? ['icon.icns', 'icon.png'] : ['icon.png', 'icon.ico']

      for (const iconName of iconNames) {
        const potentialPaths = [
          path.resolve(appPath, 'resources', iconName),
          path.resolve(appPath, '..', 'resources', iconName),
          path.resolve(__dirname, '..', '..', '..', 'resources', iconName),
          ...(process.resourcesPath
            ? [
                path.resolve(process.resourcesPath, 'resources', iconName),
                path.resolve(process.resourcesPath, 'app', 'resources', iconName),
              ]
            : []),
          // macOS-specific paths (Contents/Resources)
          ...(process.platform === 'darwin'
            ? [
                path.resolve(appPath, '..', '..', '..', 'Resources', iconName),
                path.resolve(appPath, '..', '..', '..', 'Resources', 'app', 'resources', iconName),
                path.resolve(__dirname, '..', '..', '..', '..', '..', 'build', iconName),
              ]
            : []),
        ]

        for (const potentialPath of potentialPaths) {
          if (fse.existsSync(potentialPath)) {
            return potentialPath
          }
        }
      }
    }
    else {
      // In development, look for icon files in build or resources directory
      const iconNames
        = process.platform === 'darwin' ? ['icon.icns', 'icon.png'] : ['icon.png', 'icon.ico']

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
