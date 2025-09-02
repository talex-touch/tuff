import { ChannelType } from '@talex-touch/utils/channel'
import { genTouchChannel } from '../channel-core'
import fse from 'fs-extra'
import path from 'path'
import { TalexTouch } from '../../types'
import { BrowserWindow } from 'electron'
import {
  PluginStorageUpdatedEvent,
  TalexEvents,
  touchEventBus
} from '../eventbus/touch-event'

let configPath: string
let pluginConfigPath: string

function broadcastUpdate(name: string) {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    channel?.sendTo(win, ChannelType.MAIN, 'storage:update', { name })
  }
}

function broadcastPluginUpdate(pluginName: string, key?: string) {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    channel?.sendTo(win, ChannelType.MAIN, 'plugin:storage:update', { name: pluginName, key })
  }
}

let channel: ReturnType<typeof genTouchChannel> | null = null

const module = {
  name: Symbol('StorageChannel'),
  listeners: [] as Array<() => void>,
  app: null as TalexTouch.TouchApp | null,
  filePath: 'config',
  configs: new Map<string, object>(),
  pluginConfigs: new Map<string, object>(),

  PLUGIN_CONFIG_MAX_SIZE: 10 * 1024 * 1024, // 10MB

  getConfig(name: string): object {
    if (!configPath) throw new Error(`Config ${name} not found! Path not set: ` + configPath)

    if (this.configs.has(name)) {
      return this.configs.get(name)!
    }

    const p = path.resolve(configPath, name)
    const file = fse.existsSync(p) ? JSON.parse(fse.readFileSync(p, 'utf-8')) : {}

    this.configs.set(name, file)
    return file
  },

  reloadConfig(name: string): object {
    if (!configPath) throw new Error(`Config ${name} not found`)

    const filePath = path.resolve(configPath, name)
    const file = JSON.parse(fse.readFileSync(filePath, 'utf-8'))
    this.configs.set(name, file)

    return file
  },

  saveConfig(name: string, content?: string, clear?: boolean): boolean {
    if (!configPath) throw new Error(`Config ${name} not found`)

    const configData = content ?? JSON.stringify(this.configs.get(name) ?? {})
    const p = path.join(configPath, name)

    fse.ensureFileSync(p)
    fse.writeFileSync(p, configData)

    if (clear) {
      this.configs.delete(name)
    } else {
      this.configs.set(name, JSON.parse(configData))
    }

    return true
  },

  saveAllConfig(): void {
    if (!configPath) throw new Error(`Config path not found!`)

    this.configs.forEach((_value, key) => {
      this.saveConfig(key)
    })
  },

  getPluginConfigName(pluginName: string): string {
    // Sanitize to prevent path traversal and other issues
    const safeName = pluginName.replace(/[^a-zA-Z0-9-]/g, '_')
    return `plugin_${safeName}.json`
  },

  getPluginConfig(pluginName: string): object {
    if (!pluginConfigPath) throw new Error(`Plugin config path not set for plugin: ${pluginName}`)

    if (this.pluginConfigs.has(pluginName)) {
      return this.pluginConfigs.get(pluginName)!
    }

    const fileName = this.getPluginConfigName(pluginName)
    const p = path.resolve(pluginConfigPath, fileName)

    const file = fse.existsSync(p) ? JSON.parse(fse.readFileSync(p, 'utf-8')) : {}

    this.pluginConfigs.set(pluginName, file)
    return file
  },

  savePluginConfig(pluginName: string, content: object): { success: boolean, error?: string } {
    if (!pluginConfigPath) throw new Error(`Plugin config path not set for plugin: ${pluginName}`)

    const configData = JSON.stringify(content)

    if (Buffer.byteLength(configData, 'utf-8') > this.PLUGIN_CONFIG_MAX_SIZE) {
      return { success: false, error: `Config size exceeds the 10MB limit for plugin ${pluginName}` }
    }

    const fileName = this.getPluginConfigName(pluginName)
    const p = path.join(pluginConfigPath, fileName)

    fse.ensureFileSync(p)
    fse.writeFileSync(p, configData)

    this.pluginConfigs.set(pluginName, content)

    // Also emit a global event
    touchEventBus.emit(
      TalexEvents.PLUGIN_STORAGE_UPDATED,
      new PluginStorageUpdatedEvent(pluginName)
    )

    return { success: true }
  },

  init(app: TalexTouch.TouchApp) {
    this.app = app
    configPath = path.join(app.rootPath, 'config')
    pluginConfigPath = path.join(configPath, 'plugins')
    fse.ensureDirSync(pluginConfigPath)
    console.log('[Config] Init config path ' + configPath)
    console.log('[Config] Init plugin config path ' + pluginConfigPath)

    channel = genTouchChannel(app)

    this.listeners.push(
      channel.regChannel(ChannelType.MAIN, 'storage:get', ({ data }) => {
        if (!data || typeof data !== 'string') return {}
        return this.getConfig(data)
      })
    )

    this.listeners.push(
      channel.regChannel(ChannelType.MAIN, 'storage:save', ({ data }) => {
        if (!data || typeof data !== 'object') return false
        const { key, content, clear } = data
        if (typeof key !== 'string') return false
        broadcastUpdate(key)
        return this.saveConfig(key, content, clear)
      })
    )

    this.listeners.push(
      channel.regChannel(ChannelType.MAIN, 'storage:reload', ({ data }) => {
        if (!data || typeof data !== 'string') return {}
        const result = this.reloadConfig(data)
        broadcastUpdate(data)
        return result
      })
    )

    this.listeners.push(
      channel.regChannel(ChannelType.MAIN, 'storage:saveall', () => {
        this.saveAllConfig()
      })
    )

    // For Plugins
    this.listeners.push(
      channel.regChannel(ChannelType.PLUGIN, 'plugin:storage:get-item', ({ data }) => {
        const { pluginName, key } = data
        if (typeof pluginName !== 'string' || typeof key !== 'string') return null
        const config = this.getPluginConfig(pluginName) as any
        return config[key] ?? null
      })
    )

    this.listeners.push(
      channel.regChannel(ChannelType.PLUGIN, 'plugin:storage:set-item', ({ data }) => {
        const { pluginName, key, value } = data
        if (typeof pluginName !== 'string' || typeof key !== 'string') return { success: false, error: 'Invalid params' }
        const config = this.getPluginConfig(pluginName) as any
        config[key] = value
        const result = this.savePluginConfig(pluginName, config)
        if (result.success) {
          broadcastPluginUpdate(pluginName, key)
        }
        return result
      })
    )

    this.listeners.push(
      channel.regChannel(ChannelType.PLUGIN, 'plugin:storage:remove-item', ({ data }) => {
        const { pluginName, key } = data
        if (typeof pluginName !== 'string' || typeof key !== 'string') return { success: false, error: 'Invalid params' }
        const config = this.getPluginConfig(pluginName) as any
        delete config[key]
        const result = this.savePluginConfig(pluginName, config)
        if (result.success) {
          broadcastPluginUpdate(pluginName, key)
        }
        return result
      })
    )

    this.listeners.push(
      channel.regChannel(ChannelType.PLUGIN, 'plugin:storage:clear', ({ data }) => {
        const { pluginName } = data
        if (typeof pluginName !== 'string') return { success: false, error: 'Invalid params' }
        const result = this.savePluginConfig(pluginName, {})
        if (result.success) {
          broadcastPluginUpdate(pluginName, '__clear__')
        }
        return result
      })
    )

    this.listeners.push(
      channel.regChannel(ChannelType.PLUGIN, 'plugin:storage:get-all', ({ data }) => {
        const { pluginName } = data
        if (typeof pluginName !== 'string') return {}
        return this.getPluginConfig(pluginName)
      })
    )
  },

  destroy() {
    this.listeners.forEach((f) => f())
    this.listeners = []
    this.configs.clear()
    this.pluginConfigs.clear()
    channel = null
    this.app = null
  }
}

export const getConfig = (name: string) => module.getConfig(name)
export const saveConfig = module.saveConfig.bind(module)

export const storageManager = module
export default module as TalexTouch.IModule