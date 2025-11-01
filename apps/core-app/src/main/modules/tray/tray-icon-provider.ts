import { nativeImage, app } from 'electron'
import * as path from 'path'
import * as fse from 'fs-extra'

/**
 * TrayIconProvider - 托盘图标资源提供者
 *
 * 负责管理托盘图标资源的加载，使用本地文件路径
 */
export class TrayIconProvider {
  /**
   * 获取托盘图标 (使用本地文件路径)
   * @returns 托盘图标的 NativeImage 对象
   */
  static getIcon(): Electron.NativeImage {
    let iconPath: string = ''

    if (app.isPackaged) {
      // 打包后的路径：尝试多个可能的位置
      const appPath = app.getAppPath()
      const potentialPaths = [
        path.resolve(appPath, 'resources', 'tray_icon.png'),
        path.resolve(appPath, '..', 'resources', 'tray_icon.png'),
        path.resolve(__dirname, '..', '..', '..', 'resources', 'tray_icon.png'),
        ...(process.resourcesPath ? [path.resolve(process.resourcesPath, 'resources', 'tray_icon.png')] : [])
      ]

      // 找到第一个存在的路径
      for (const potentialPath of potentialPaths) {
        if (fse.existsSync(potentialPath)) {
          iconPath = potentialPath
          break
        }
      }

      // 如果所有路径都不存在，使用默认路径
      if (!iconPath) {
        iconPath = path.resolve(appPath, 'resources', 'tray_icon.png')
      }
    } else {
      // 开发环境路径：从 __dirname 向上查找直到找到 apps/core-app 目录
      // __dirname 可能是 out/main/modules/tray 或类似路径
      let currentDir = __dirname
      iconPath = ''

      // 向上查找最多 10 级，寻找包含 apps/core-app/resources 的路径
      for (let i = 0; i < 10; i++) {
        const potentialPath = path.resolve(currentDir, 'apps', 'core-app', 'resources', 'tray_icon.png')
        if (fse.existsSync(potentialPath)) {
          iconPath = potentialPath
          break
        }

        // 也尝试当前目录下的 resources
        const altPath = path.resolve(currentDir, 'resources', 'tray_icon.png')
        if (fse.existsSync(altPath)) {
          iconPath = altPath
          break
        }

        const parentDir = path.dirname(currentDir)
        if (parentDir === currentDir) {
          // 已经到达根目录，停止查找
          break
        }
        currentDir = parentDir
      }

      // 如果仍然没找到，使用默认相对路径
      if (!iconPath) {
        // 从 out/main/modules/tray 到 apps/core-app/resources 需要向上 4 级
        iconPath = path.resolve(__dirname, '../../../../apps/core-app/resources/tray_icon.png')
        console.warn('[TrayIconProvider] Using fallback path:', iconPath)
      }
    }

    // 验证文件是否存在
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

      // 检查图标尺寸
      const size = image.getSize()
      console.log('[TrayIconProvider] Successfully loaded icon from:', iconPath)
      console.log('[TrayIconProvider] Icon size:', size)

      // macOS 推荐使用 22x22 或 16x16 的图标
      if (process.platform === 'darwin') {
        if (size.width !== 22 && size.width !== 16 && size.height !== 22 && size.height !== 16) {
          console.warn('[TrayIconProvider] Icon size may not be optimal for macOS:', size)
          console.warn('[TrayIconProvider] Recommended sizes: 22x22 or 16x16')
        }
      }

      return image
    } catch (error) {
      console.error('[TrayIconProvider] Failed to load tray icon from path:', iconPath, error)
      // 如果加载失败，返回一个空的图标
      return nativeImage.createEmpty()
    }
  }

  /**
   * 获取托盘图标文件路径
   * @returns 图标文件的完整路径
   */
  static getIconPath(): string {
    let iconPath: string = ''

    if (app.isPackaged) {
      // 打包后的路径：尝试多个可能的位置
      const appPath = app.getAppPath()
      const potentialPaths = [
        path.resolve(appPath, 'resources', 'tray_icon.png'),
        path.resolve(appPath, '..', 'resources', 'tray_icon.png'),
        path.resolve(__dirname, '..', '..', '..', 'resources', 'tray_icon.png'),
        ...(process.resourcesPath ? [path.resolve(process.resourcesPath, 'resources', 'tray_icon.png')] : [])
      ]

      // 找到第一个存在的路径
      for (const potentialPath of potentialPaths) {
        if (fse.existsSync(potentialPath)) {
          iconPath = potentialPath
          break
        }
      }

      // 如果所有路径都不存在，使用默认路径
      if (!iconPath) {
        iconPath = path.resolve(appPath, 'resources', 'tray_icon.png')
      }
    } else {
      // 开发环境路径：从 __dirname 向上查找直到找到 apps/core-app 目录
      // __dirname 可能是 out/main/modules/tray 或类似路径
      let currentDir = __dirname
      iconPath = ''

      // 向上查找最多 10 级，寻找包含 apps/core-app/resources 的路径
      for (let i = 0; i < 10; i++) {
        const potentialPath = path.resolve(currentDir, 'apps', 'core-app', 'resources', 'tray_icon.png')
        if (fse.existsSync(potentialPath)) {
          iconPath = potentialPath
          break
        }

        // 也尝试当前目录下的 resources
        const altPath = path.resolve(currentDir, 'resources', 'tray_icon.png')
        if (fse.existsSync(altPath)) {
          iconPath = altPath
          break
        }

        const parentDir = path.dirname(currentDir)
        if (parentDir === currentDir) {
          // 已经到达根目录，停止查找
          break
        }
        currentDir = parentDir
      }

      // 如果仍然没找到，使用默认相对路径
      if (!iconPath) {
        // 从 out/main/modules/tray 到 apps/core-app/resources 需要向上 4 级
        iconPath = path.resolve(__dirname, '../../../../apps/core-app/resources/tray_icon.png')
        console.warn('[TrayIconProvider] Using fallback path:', iconPath)
      }
    }

    return iconPath
  }

  /**
   * 获取应用图标路径 (保留用于其他用途)
   * @returns 应用图标的完整路径
   */
  static getAppIconPath(): string {
    // 暂时返回空字符串，后续可以添加应用图标逻辑
    return ''
  }
}
