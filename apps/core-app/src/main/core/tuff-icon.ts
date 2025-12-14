import type { ITuffIcon, TuffIconType } from '@talex-touch/utils'
import type { IPluginDev } from '@talex-touch/utils/plugin'
import path from 'node:path'
import fse from 'fs-extra'

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

    // Security check: prevent path traversal
    if (this.value.includes('..')) {
      this.status = 'error'
      this.value = ''
      return
    }

    // Dev mode: use dev server URL for icons
    if (this.devConfig?.enable && this.devConfig?.address) {
      try {
        const devIconUrl = new URL(this.value, this.devConfig.address).toString()
        this.type = 'url'
        this.value = devIconUrl
        this.status = 'normal'
        return
      } catch (error) {
        console.warn(`[TuffIconImpl] Failed to construct dev icon URL: ${this.value}`, error)
        // Fall through to local file check
      }
    }

    const iconPath = path.resolve(this.rootPath, this.value)

    if (!(await fse.pathExists(iconPath))) {
      this.status = 'error'
      this.value = ''
    }
    else {
      this.value = iconPath
      this.status = 'normal'
    }
  }
}
