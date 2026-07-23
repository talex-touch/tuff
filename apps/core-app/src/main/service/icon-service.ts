import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import type { FileIconOptions, NativeImage } from 'electron'
import { execFileSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { getElectronFileIcon } from '../utils/electron-file-icon'
import { createLogger } from '../utils/logger'
import { getAppIconCachePath } from '../modules/box-tool/addon/apps/app-icon-cache'
import { IconWorkerClient } from '../modules/box-tool/addon/files/workers/icon-worker-client'

const DARWIN_APP_ICON_CACHE_VERSION = 'native-v3'
const DARWIN_APP_ICON_TARGET_SIZE = 256
const WINDOWS_APP_ICON_CACHE_VERSION = 'native-v3'
const WINDOWS_APP_ICON_TARGET_SIZE = 48
const iconServiceLog = createLogger('IconService')

function getValueFromPlist(content: string, key: string): string | null {
  const regex = new RegExp(`<key>${key}</key>\\s*<string>(.*?)</string>`)
  const match = content.match(regex)
  return match ? match[1] : null
}

function normalizeIconFileName(rawValue: string | null): string | null {
  const normalized = rawValue?.trim()
  if (!normalized || normalized === '(null)') return null
  return normalized.endsWith('.icns') ? normalized : `${normalized}.icns`
}

export class IconService {
  private readonly fileIconWorker = new IconWorkerClient()
  private readonly appIconExtractions = new Map<string, Promise<string | null>>()

  getFileIconWorkerStatus() {
    return this.fileIconWorker.getStatus()
  }

  extractFileIcon(filePath: string, size?: number): Promise<Buffer | null> {
    return this.fileIconWorker.extract(filePath, size)
  }

  getSystemFileIcon(filePath: string, options?: FileIconOptions): Promise<NativeImage | null> {
    return getElectronFileIcon(filePath, options)
  }

  async getCachedAppIcon(appPath: string, bundleId: string): Promise<string | null> {
    if (process.platform !== 'darwin' && process.platform !== 'win32') return null

    const cachedIconPath = this.getAppIconCachePath(appPath, bundleId)
    try {
      if (process.platform === 'win32') {
        const buffer = await fs.readFile(cachedIconPath)
        return `data:image/png;base64,${buffer.toString('base64')}`
      }

      await fs.access(cachedIconPath)
      return cachedIconPath
    } catch {
      return null
    }
  }

  ensureAppIcon(appPath: string, bundleId: string): Promise<string | null> {
    if (process.platform !== 'darwin' && process.platform !== 'win32') {
      return Promise.resolve(null)
    }

    const cachePath = this.getAppIconCachePath(appPath, bundleId)
    const pending = this.appIconExtractions.get(cachePath)
    if (pending) return pending

    const renderTask =
      process.platform === 'darwin'
        ? this.renderDarwinAppIcon(appPath, cachePath)
        : this.renderWindowsAppIcon(appPath, cachePath)
    const task = renderTask
      .catch((error) => {
        iconServiceLog.warn('Failed to hydrate app icon', {
          error,
          meta: { pathLength: appPath.length }
        })
        return null
      })
      .finally(() => {
        this.appIconExtractions.delete(cachePath)
      })

    this.appIconExtractions.set(cachePath, task)
    return task
  }

  private getAppIconCachePath(appPath: string, bundleId: string): string {
    const version =
      process.platform === 'win32' ? WINDOWS_APP_ICON_CACHE_VERSION : DARWIN_APP_ICON_CACHE_VERSION
    return getAppIconCachePath(`${version}:${bundleId || appPath}`, process.platform)
  }

  private async renderWindowsAppIcon(
    appPath: string,
    cachedIconPath: string
  ): Promise<string | null> {
    try {
      const cachedIcon = await fs.readFile(cachedIconPath)
      return `data:image/png;base64,${cachedIcon.toString('base64')}`
    } catch {
      // Cache miss; extract below.
    }

    const icon =
      (await this.extractFileIcon(appPath, WINDOWS_APP_ICON_TARGET_SIZE)) ??
      (await this.extractFileIcon(appPath, 32))
    if (!icon || icon.length === 0) return null

    let temporaryIconPath = ''
    try {
      await fs.mkdir(path.dirname(cachedIconPath), { recursive: true })
      temporaryIconPath = `${cachedIconPath}.${process.pid}.${Date.now()}.tmp`
      await fs.writeFile(temporaryIconPath, icon)
      await fs.rename(temporaryIconPath, cachedIconPath)
      return `data:image/png;base64,${icon.toString('base64')}`
    } catch (error) {
      if (temporaryIconPath) {
        await fs.rm(temporaryIconPath, { force: true }).catch(() => undefined)
      }
      throw error
    }
  }

  private async renderDarwinAppIcon(
    appPath: string,
    cachedIconPath: string
  ): Promise<string | null> {
    try {
      await fs.access(cachedIconPath)
      return cachedIconPath
    } catch {
      // Cache miss; render below.
    }

    const sourceIconPath = await this.findDarwinAppIconSourcePath(appPath)
    if (sourceIconPath && (await this.renderIconWithSips(sourceIconPath, cachedIconPath))) {
      return cachedIconPath
    }

    if (await this.renderNativeIcon(appPath, cachedIconPath)) {
      return cachedIconPath
    }

    return null
  }

  private async findDarwinAppIconSourcePath(appPath: string): Promise<string | null> {
    const resourcesPath = path.join(appPath, 'Contents', 'Resources')
    const plistPath = path.join(appPath, 'Contents', 'Info.plist')
    const plistContent = await fs.readFile(plistPath, 'utf8').catch(() => '')
    const iconNames = [
      normalizeIconFileName(getValueFromPlist(plistContent, 'CFBundleIconFile')),
      normalizeIconFileName(getValueFromPlist(plistContent, 'CFBundleIconName'))
    ].filter((value): value is string => Boolean(value))

    for (const iconName of iconNames) {
      const iconPath = path.join(resourcesPath, iconName)
      try {
        await fs.access(iconPath)
        return iconPath
      } catch {
        // Continue to the directory fallback.
      }
    }

    try {
      const entries = await fs.readdir(resourcesPath)
      const fallbackIcon = entries.find((entry) => entry.toLowerCase().endsWith('.icns'))
      return fallbackIcon ? path.join(resourcesPath, fallbackIcon) : null
    } catch {
      return null
    }
  }

  private async renderIconWithSips(
    sourceIconPath: string,
    cachedIconPath: string
  ): Promise<boolean> {
    try {
      await fs.mkdir(path.dirname(cachedIconPath), { recursive: true })
      await execFileSafe('sips', [
        '-Z',
        String(DARWIN_APP_ICON_TARGET_SIZE),
        '-s',
        'format',
        'png',
        sourceIconPath,
        '--out',
        cachedIconPath
      ])
      await fs.access(cachedIconPath)
      return true
    } catch {
      return false
    }
  }

  private async renderNativeIcon(appPath: string, cachedIconPath: string): Promise<boolean> {
    let temporaryIconPath = ''
    try {
      const nativeIcon = await this.getSystemFileIcon(appPath, { size: 'large' })
      if (!nativeIcon || nativeIcon.isEmpty()) return false

      let png = nativeIcon.toPNG({ scaleFactor: 2 })
      if (png.length === 0) png = nativeIcon.toPNG()
      if (png.length === 0) return false

      await fs.mkdir(path.dirname(cachedIconPath), { recursive: true })
      temporaryIconPath = `${cachedIconPath}.${process.pid}.${Date.now()}.tmp`
      await fs.writeFile(temporaryIconPath, png)
      await fs.rename(temporaryIconPath, cachedIconPath)
      return true
    } catch (error) {
      if (temporaryIconPath) {
        await fs.rm(temporaryIconPath, { force: true }).catch(() => undefined)
      }
      iconServiceLog.debug('Native app icon extraction failed', {
        meta: {
          pathLength: appPath.length,
          error: error instanceof Error ? error.message : String(error)
        }
      })
      return false
    }
  }
}

export const iconService = new IconService()
