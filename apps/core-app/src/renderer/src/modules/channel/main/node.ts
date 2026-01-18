import { packageJson } from 'talex-touch:information'
import { useAppSdk } from '@talex-touch/utils/renderer'

const appSdk = useAppSdk()

export class BaseNodeApi {
  close() {
    return appSdk.close()
  }

  hide() {
    return appSdk.hide()
  }

  minimize() {
    return appSdk.minimize()
  }

  openDevTools() {
    return appSdk.openDevTools()
  }

  openExternal(url: string) {
    return appSdk.openExternal(url)
  }

  getPackageJSON() {
    return packageJson
  }

  getOS() {
    return appSdk.getOS()
  }

  getCWD() {
    return appSdk.getCwd()
  }

  getPath(name: string) {
    return appSdk.getPath(name)
  }
}

export const baseNodeApi = new BaseNodeApi()
