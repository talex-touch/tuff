import type { ITuffIcon, TuffIconType } from '@talex-touch/utils'
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

  constructor(rootPath: string, type: TuffIconType, value: string) {
    this.rootPath = rootPath
    this.type = type
    this.value = value
    this.status = 'normal'
  }

  /**
   * Initialize icon
   *
   * @description
   * For file type, checks if file exists and resolves to absolute path
   */
  async init(): Promise<void> {
    if (this.type === 'file') {
      if (this.value.includes('..')) {
        this.status = 'error'
        this.value = ''
        return
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
}
