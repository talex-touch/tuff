import type { ITuffIcon, TuffIconType } from '@talex-touch/utils'
import fse from 'fs-extra'
import path from 'path'

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
  error?: string

  private rootPath: string
  private originalValue: string

  constructor(rootPath: string, type: TuffIconType, value: string) {
    this.rootPath = rootPath
    this.type = type
    this.originalValue = value
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
      if (this.originalValue.includes('..')) {
        this.status = 'error'
        this.error = 'Forbidden `..` in path.'
        return
      }

      const iconPath = path.resolve(this.rootPath, this.originalValue)

      if (!(await fse.pathExists(iconPath))) {
        this.status = 'error'
        this.error = 'Cannot find target icon.'
      } else {
        this.value = iconPath
        this.status = 'normal'
      }
    }
  }
}
