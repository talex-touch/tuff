import type { ITuffIcon, TuffIconType } from '@talex-touch/utils'
import type { IPluginDev } from '@talex-touch/utils/plugin'
import path from 'node:path'
import fse from 'fs-extra'
import { createLogger } from '../utils/logger'

const tuffIconLog = createLogger('TuffIcon')

/**
 * TuffIcon implementation class
 *
 * @description
 * Common icon implementation class supporting emoji, url, and file types
 */
export class TuffIconImpl implements ITuffIcon {
  type: TuffIconType
  value: string
  status?: 'normal' | 'loading' | 'error'

  private rootPath: string
  private devConfig?: IPluginDev

  constructor(rootPath: string, type: TuffIconType, value: string, devConfig?: IPluginDev) {
    this.rootPath = rootPath
    this.type = type
    this.value = value
    this.status = 'normal'
    this.devConfig = devConfig
  }

  private hasPathTraversal(iconPath: string): boolean {
    return iconPath.split(/[\\/]+/).includes('..')
  }

  private getLocalFileCandidates(iconPath: string): string[] {
    const normalizedIconPath = iconPath.trim()
    if (!normalizedIconPath) {
      return []
    }

    if (path.isAbsolute(normalizedIconPath) || path.win32.isAbsolute(normalizedIconPath)) {
      return [normalizedIconPath]
    }

    const candidates = [
      path.resolve(this.rootPath, normalizedIconPath),
      path.resolve(this.rootPath, 'src', normalizedIconPath)
    ]
    const fileName = path.basename(normalizedIconPath)
    if (fileName) {
      candidates.push(path.resolve(this.rootPath, 'public', fileName))
    }

    return [...new Set(candidates)]
  }

  private async resolveLocalFilePath(iconPath: string): Promise<string | null> {
    for (const candidate of this.getLocalFileCandidates(iconPath)) {
      if (await fse.pathExists(candidate)) {
        return candidate
      }
    }
    return null
  }

  /**
   * Initialize icon
   *
   * @description
   * For file type, checks if file exists and resolves to absolute path
   * For dev mode plugins, converts to dev server URL
   * For other types (emoji, url, class), no processing is needed
   */
  async init(): Promise<void> {
    // Only process file type icons
    if (this.type !== 'file') {
      return
    }

    const iconPath = this.value.trim()

    // Security check: prevent path traversal
    if (!iconPath || this.hasPathTraversal(iconPath)) {
      this.status = 'error'
      this.value = ''
      return
    }

    const localIconPath = await this.resolveLocalFilePath(iconPath)
    if (localIconPath) {
      this.value = localIconPath
      this.status = 'normal'
      return
    }

    // Dev mode: use dev server URL for icons when the file is not available locally
    if (this.devConfig?.enable && this.devConfig?.source && this.devConfig?.address) {
      try {
        const devIconUrl = new URL(iconPath, this.devConfig.address).toString()
        this.type = 'url'
        this.value = devIconUrl
        this.status = 'normal'
        return
      } catch (error) {
        tuffIconLog.warn('Failed to construct dev icon URL, falling back to local file', {
          meta: { iconPathLength: this.value.length },
          error
        })
      }
    }

    this.status = 'error'
    this.value = ''
  }
}
