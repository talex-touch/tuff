import { IPluginDev, IPluginIcon } from '@talex-touch/utils/plugin'
import type { TuffIconType } from '@talex-touch/utils'
import { TuffIconImpl } from '../../core/tuff-icon'

export class PluginIcon extends TuffIconImpl implements IPluginIcon {
  dev: IPluginDev

  constructor(rootPath: string, type: TuffIconType, value: string, dev: IPluginDev) {
    super(rootPath, type, value)
    this.dev = dev
  }
}
