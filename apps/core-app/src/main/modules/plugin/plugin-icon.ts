import { IPluginDev, IPluginIcon } from '@talex-touch/utils/plugin'
import fse from 'fs-extra'
import path from 'path'

export class PluginIcon implements IPluginIcon {
  type: string
  value: any

  _value: string
  rootPath: string
  dev: IPluginDev

  constructor(rootPath: string, type: string, value: string, dev: IPluginDev) {
    this.type = type
    this._value = value
    this.rootPath = rootPath
    this.dev = dev

    this.value = this._value
  }

  async init(): Promise<void> {
    if (this.type === 'file') {
      // Forbidden `..` in path.
      if (this._value.includes('..')) {
        this.type = 'error'
        this.value = 'Forbidden `..` in path.'
        return
      }
      const iconPath = path.resolve(this.rootPath, this._value)
      if (!(await fse.pathExists(iconPath))) {
        this.type = 'error'
        this.value = 'Cannot find target icon.'
      } else {
        const buffer = await fse.readFile(iconPath)
        this.value = `data:image/png;base64,${buffer.toString('base64')}`
      }
    }
  }
}
