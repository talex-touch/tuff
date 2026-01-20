import * as path from 'node:path'
import process from 'node:process'
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
        } else {
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
              } else {
                trayLog.warn('Failed to resize icon, using original size')
              }
            } catch (resizeError) {
              trayLog.warn('Error resizing icon', { error: resizeError })
              trayLog.warn('Using original icon size')
            }
          }
        } else {
          trayLog.success('Icon size is optimal (22x22) for macOS')
        }
      }

      return image
    } catch (error) {
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
        trayLog.warn('Using fallback tray icon path', { meta: { iconPath } })
      }
    }

    return iconPath
  }

  /**
   * Get application icon path
   * 获取应用图标路径
   *
   * Used for Dock icon on macOS, window icon on other platforms
   * 用于 macOS 的 Dock 图标或其他平台的窗口图标
   *
   * @returns Full path to application icon file
   */
  static getAppIconPath(): string {
    if (app.isPackaged) {
      // Packaged mode: use platform-specific icon
      // 打包模式：使用平台特定图标
      const iconName = process.platform === 'darwin' ? 'icon.icns' : 'icon.png'

      if (process.resourcesPath) {
        const iconPath = path.join(process.resourcesPath, 'app', 'build', iconName)
        if (fse.existsSync(iconPath)) {
          return iconPath
        }
      }

      // Fallback for packaged mode
      // 打包模式备用方案
      const appPath = app.getAppPath()
      return path.join(appPath, '..', '..', 'Resources', iconName)
    } else {
      // Development mode: always use icon.png (available in resources folder)
      // 开发模式：始终使用 icon.png（resources 文件夹中可用）
      const iconName = 'icon.png'

      // Try multiple paths to find the icon
      const possiblePaths = [
        path.join(__dirname, '..', '..', 'resources', iconName),
        path.join(__dirname, '..', '..', '..', 'resources', iconName),
        path.join(__dirname, '..', '..', '..', '..', 'resources', iconName)
      ]

      for (const devIconPath of possiblePaths) {
        if (fse.existsSync(devIconPath)) {
          trayLog.success('Found app icon in development mode', { meta: { devIconPath } })
          return devIconPath
        }
      }

      // Also try looking from project root upwards
      let currentDir = __dirname
      for (let i = 0; i < 10; i++) {
        const potentialPath = path.resolve(currentDir, 'apps', 'core-app', 'resources', iconName)
        if (fse.existsSync(potentialPath)) {
          trayLog.success('Found app icon in development mode', {
            meta: { devIconPath: potentialPath }
          })
          return potentialPath
        }

        const altPath = path.resolve(currentDir, 'resources', iconName)
        if (fse.existsSync(altPath)) {
          trayLog.success('Found app icon in development mode', { meta: { devIconPath: altPath } })
          return altPath
        }

        const parentDir = path.dirname(currentDir)
        if (parentDir === currentDir) break
        currentDir = parentDir
      }

      trayLog.warn(
        'App icon not found in development mode, this is expected if icon.png does not exist',
        {
          meta: {
            triedPaths: possiblePaths.join(', '),
            __dirname
          }
        }
      )

      return ''
    }
  }
}
