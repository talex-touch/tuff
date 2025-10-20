import { ChannelType } from '@talex-touch/utils/channel'
import fse from 'fs-extra'
import path from 'path'
import { BrowserWindow } from 'electron'
import { BaseModule } from '../abstract-base-module'
import { ModuleInitContext, MaybePromise, ModuleKey } from '@talex-touch/utils'
import { TalexEvents } from '../../core/eventbus/touch-event'

let pluginConfigPath: string

function broadcastUpdate(name: string) {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    $app.channel?.sendTo(win, ChannelType.MAIN, 'storage:update', { name })
  }
}

export class StorageModule extends BaseModule {
  static key: symbol = Symbol.for('Storage')
  name: ModuleKey = StorageModule.key

  configs = new Map<string, object>()
  pluginConfigs = new Map<string, object>()

  PLUGIN_CONFIG_MAX_SIZE = 10 * 1024 * 1024 // 10MB

  constructor() {
    super(StorageModule.key, {
      create: true,
      dirName: 'config'
    })
  }

  onInit({ file }: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    pluginConfigPath = path.join(file.dirPath!, 'plugins')
    fse.ensureDirSync(pluginConfigPath)
    console.log(
      `[Config] Init config path ${file.dirPath} and plugin config path ${pluginConfigPath}`
    )

    this.setupListeners()
  }
  onDestroy(): MaybePromise<void> {
    this.saveAllConfig()
    this.configs.clear()
    this.pluginConfigs.clear()
  }

  getConfig(name: string): object {
    if (!this.filePath) throw new Error(`Config ${name} not found! Path not set: ` + this.filePath)

    if (this.configs.has(name)) {
      return this.configs.get(name)!
    }

    const p = path.resolve(this.filePath!, name)
    const file = fse.existsSync(p) ? JSON.parse(fse.readFileSync(p, 'utf-8')) : {}

    this.configs.set(name, file)
    return file
  }

  reloadConfig(name: string): object {
    if (!this.filePath) throw new Error(`Config ${name} not found`)

    const filePath = path.resolve(this.filePath, name)
    const file = JSON.parse(fse.readFileSync(filePath, 'utf-8'))
    this.configs.set(name, file)

    return file
  }

  saveConfig(name: string, content?: string, clear?: boolean): boolean {
    if (!this.filePath) throw new Error(`Config ${name} not found`)

    const configData = content ?? JSON.stringify(this.configs.get(name) ?? {})
    const p = path.join(this.filePath, name)

    fse.ensureFileSync(p)
    fse.writeFileSync(p, configData)

    if (clear) {
      this.configs.delete(name)
    } else {
      this.configs.set(name, JSON.parse(configData))
    }

    return true
  }

  saveAllConfig(): void {
    if (!this.filePath) throw new Error(`Config path not found!`)

    this.configs.forEach((_value, key) => {
      this.saveConfig(key)
    })
  }

  setupListeners() {
    const channel = $app.channel

    channel.regChannel(ChannelType.MAIN, 'storage:get', ({ data }) => {
      if (!data || typeof data !== 'string') return {}
      return this.getConfig(data)
    })

    channel.regChannel(ChannelType.MAIN, 'storage:save', ({ data }) => {
      if (!data || typeof data !== 'object') return false
      const { key, content, clear } = data
      if (typeof key !== 'string') return false
      broadcastUpdate(key)
      return this.saveConfig(key, content, clear)
    })

    channel.regChannel(ChannelType.MAIN, 'storage:reload', ({ data }) => {
      if (!data || typeof data !== 'string') return {}
      const result = this.reloadConfig(data)
      broadcastUpdate(data)
      return result
    })

    channel.regChannel(ChannelType.MAIN, 'storage:saveall', () => {
      this.saveAllConfig()
    })
  }
}

const storageModule = new StorageModule()

export { storageModule }

export const getConfig = (name: string) => storageModule.getConfig(name)
export const saveConfig = storageModule.saveConfig.bind(module)
