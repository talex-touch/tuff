import * as path from 'node:path'
import { Buffer } from 'node:buffer'
import { app, nativeImage } from 'electron'
import * as fse from 'fs-extra'

export class TrayIconProvider {
  private static readonly BUILTIN_MAC_TRAY_TEMPLATE_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAAPklEQVR4nGNgGAVQwMiACv4zUMk8JgYaAaYhZzAjker+k6pv6AUF06jBMDBq8BA2mJGA/H9y9dPMxQxDDgAAWskDIGPdRDsAAAAASUVORK5CYII='

  private static resolveResourcePath(fileName: string): string {
    const candidates: string[] = []

    if (app.isPackaged) {
      const appPath = app.getAppPath()
      candidates.push(
        path.resolve(appPath, 'resources', fileName),
        path.resolve(appPath, '..', 'resources', fileName),
        path.resolve(appPath, '..', '..', 'Resources', fileName)
      )

      if (process.resourcesPath) {
        candidates.unshift(
          path.resolve(process.resourcesPath, 'app', 'build', fileName),
          path.resolve(process.resourcesPath, fileName),
          path.resolve(process.resourcesPath, 'resources', fileName)
        )
      }
    } else {
      candidates.push(
        path.resolve(__dirname, '../../../../apps/core-app/resources', fileName),
        path.resolve(__dirname, '../../../resources', fileName),
        path.resolve(process.cwd(), 'apps/core-app/resources', fileName),
        path.resolve(process.cwd(), 'resources', fileName)
      )
    }

    for (const candidate of candidates) {
      if (fse.existsSync(candidate)) {
        return candidate
      }
    }

    return ''
  }

  private static createBuiltInMacTrayIcon(): Electron.NativeImage {
    const image = nativeImage.createFromBuffer(
      Buffer.from(this.BUILTIN_MAC_TRAY_TEMPLATE_PNG_BASE64, 'base64')
    )
    if (image.isEmpty()) return nativeImage.createEmpty()
    const resized = image.resize({ width: 22, height: 22, quality: 'best' })
    if (resized.isEmpty()) return nativeImage.createEmpty()
    resized.setTemplateImage(true)
    return resized
  }

  static getIcon(): Electron.NativeImage {
    const iconNames = this.getPreferredTrayIconNames()

    if (process.platform === 'darwin') {
      const builtIn = this.createBuiltInMacTrayIcon()
      if (!builtIn.isEmpty()) {
        return builtIn
      }
    }

    for (const iconName of iconNames) {
      const iconPath = this.resolveResourcePath(iconName)
      if (!iconPath) continue

      const image = nativeImage.createFromPath(iconPath)
      if (image.isEmpty()) continue

      if (process.platform === 'darwin') {
        image.setTemplateImage(true)
        const resized = image.resize({ width: 22, height: 22, quality: 'best' })
        if (!resized.isEmpty()) {
          resized.setTemplateImage(true)
          return resized
        }
      }

      return image
    }

    return nativeImage.createEmpty()
  }

  static getIconPath(): string {
    const iconNames = this.getPreferredTrayIconNames()
    for (const iconName of iconNames) {
      const iconPath = this.resolveResourcePath(iconName)
      if (iconPath) {
        return iconPath
      }
    }
    return ''
  }

  static getAppIconPath(): string {
    if (app.isPackaged) {
      const iconName = process.platform === 'darwin' ? 'icon.icns' : 'icon.png'
      const iconPath = this.resolveResourcePath(iconName)
      if (iconPath) return iconPath
    }

    return this.resolveResourcePath('icon.png')
  }

  private static getPreferredTrayIconNames(): string[] {
    if (process.platform === 'darwin') {
      return ['TrayIconTemplate.png', 'tray_icon_22x22.png', 'tray_icon.png']
    }
    return ['tray_icon.png']
  }
}
