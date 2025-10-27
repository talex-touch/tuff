import { nativeImage } from 'electron'

/**
 * TrayIconProvider - 托盘图标资源提供者
 *
 * 负责管理托盘图标资源的加载，使用 data URL 方式创建图标
 */
export class TrayIconProvider {
  /**
   * 获取托盘图标 (使用 data URL)
   * @returns 托盘图标的 NativeImage 对象
   */
  static getIcon(): Electron.NativeImage {
    // 16x16 红色圆圈图标 (base64 data URL)
    const iconDataURL =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAACTSURBVHgBpZKBCYAgEEV/TeAIjuIIbdQIuUGt0CS1gW1iZ2jIVaTnhw+Cvs8/OYDJA4Y8kR3ZR2/kmazxJbpUEfQ/Dm/UG7wVwHkjlQdMFfDdJMFaACebnjJGyDWgcnZu1/lrCrl6NCoEHJBrDwEr5NrT6ko/UV8xdLAC2N49mlc5CylpYh8wCwqrvbBGLoKGvz8Bfq0QPWEUo/EAAAAASUVORK5CYII='

    return nativeImage.createFromDataURL(iconDataURL)
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
