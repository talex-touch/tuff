import type { TalexTouch } from '@talex-touch/utils'
import type { TouchApp } from './touch-app'
import path from 'node:path'
import fse from 'fs-extra'
import { checkDirWithCreate } from '../utils/common-util'
import { createLogger } from '../utils/logger'

const touchConfigLog = createLogger('TouchConfig')

export class TouchConfig implements TalexTouch.IConfiguration {
  configPath: string
  data: TalexTouch.TouchAppConfig

  constructor(touchApp: TouchApp) {
    this.configPath = path.join(touchApp.rootPath, 'config')
    // const configFilePath = path.resolve(this.configPath, "config.ini");
    checkDirWithCreate(this.configPath, true)

    this.data = {
      frame: {
        height: 1280,
        width: 780
      }
    }
  }

  triggerSave(): void {
    const configFilePath = path.resolve(this.configPath, 'config.ini')
    fse.writeFileSync(configFilePath, JSON.stringify(this.data))

    touchConfigLog.info('Default config updated')
  }
}
