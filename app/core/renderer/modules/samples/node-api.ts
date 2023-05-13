// @ts-ignore
import { forDialogMention } from '@modules/mention/dialog-mention'
import { touchChannel } from '../channel/channel-core'

export async function asyncMainProcessMessage(eventName: string, data: any) {
  return touchChannel.sendSync(eventName, data)
}

export function postMainProcessMessage(eventName: string, data: any = {}) {
  return touchChannel.send(eventName, data)
}

export function registerTypeProcess(type: string, callback: (data: any) => any) {
  touchChannel.regChannel(type, callback)
}

class PluginManager {
  constructor() {

    registerTypeProcess('plugin-crashed', async ({ reply, data }) => {

      console.log( data )

      await forDialogMention( data.data.name, data.data.description, data.plugin.pluginInfo.icon, [
        {
          content: "忽略加载",
          type: 'info',
          onClick: () => true
        },
        {
          content: "重启插件",
          type: 'warning',
          onClick: () => this.reloadPlugin(data.plugin.pluginInfo.name) && true
        }
      ] )

      reply("accepted")

    })

  }

  _pluginAsync(action: string, pluginName: string, data = {}) {
    return asyncMainProcessMessage('plugin-action', {
      action,
      pluginName,
      ...data
    })
  }

  async reloadPlugin(name) {
    return this._pluginAsync('reload', name)
  }

  async enablePlugin(name) {
    return this._pluginAsync('enable', name)
  }

  async disablePlugin(name) {
    return this._pluginAsync('disable', name)
  }

  async fullScreenPlugin(name) {
    return this._pluginAsync('fullscreen', name)
  }

  setPluginWebviewInit(name) {
    return this._pluginAsync('webview-init', name)
  }

  async getPluginStatus(name) {
    return this._pluginAsync('status', name)
  }
  getPluginList() {
    return postMainProcessMessage('plugin-list')
  }

  changeActivePlugin(name: string = "") {
    return postMainProcessMessage('change-active', name)
  }

  exportPlugin(name: string, manifest: string, files: string) {
    return asyncMainProcessMessage('pack-export', { plugin: name, manifest, files })
  }
}

export const pluginManager = new PluginManager()

export class BaseNodeApi {

  _action(action: string, data = {}) {
    return asyncMainProcessMessage('main-window', {
      action,
      ...data
    })
  }

  _app(action: string, data = {}) {
    return asyncMainProcessMessage('app-action', {
      action,
      ...data
    })
  }

  _appSync(action: string, data = {}) {
    return postMainProcessMessage('app-action', {
      action,
      ...data
    })
  }

  _storage(action: string, data = {}) {
    return postMainProcessMessage('app-storage', {
      action,
      ...data
    })
  }

  _storageAsync(action: string, data = {}) {
    return asyncMainProcessMessage('app-storage', {
      action,
      ...data
    })
  }

  close() {
    return this._action('close')
  }

  minimize() {
    return this._action('minimize')
  }

  openDevTools() {
    return this._action('dev-tools')
  }

  openExternal(url: string) {
    return this._action('open-external', { url })
  }

  getPackageJSON() {
    return this._appSync('get-package')
  }

  getStartTime() {
    return postMainProcessMessage('get-start-time')
  }
  async getPath(name: string) {
    return (await this._app('get-path', { name }))['data']
  }

  getProcessCwd() {
    return postMainProcessMessage('process-cwd')
  }

  getConfig(name) {
    return this._storage(name)
  }

  saveConfig(name, content, clear) {
    return this._storageAsync(name, { save: true, content, clear })
  }

  reloadConfig(name) {
    return this._storage(name, { reload: true })
  }
}

export function genBaseNodeApi() {

  return new BaseNodeApi()
}
