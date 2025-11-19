import { touchChannel } from '~/modules/channel/channel-core'

export class BaseNodeApi {
  close() {
    return touchChannel.send('close')
  }

  hide() {
    return touchChannel.send('hide')
  }

  minimize() {
    return touchChannel.send('minimize')
  }

  openDevTools() {
    return touchChannel.send('dev-tools')
  }

  openExternal(url: string) {
    return touchChannel.send('open-external', { url })
  }

  getPackageJSON() {
    return touchChannel.sendSync('get-package')
  }

  getOS() {
    return touchChannel.sendSync('get-os')
  }

  getCWD() {
    return touchChannel.sendSync('common:cwd')
  }
}

export const baseNodeApi = new BaseNodeApi()
