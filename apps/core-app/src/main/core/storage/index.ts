import { ChannelType } from '@talex-touch/utils/channel'
import { genTouchChannel } from '../channel-core'
import fse from 'fs-extra'
import path from 'path'
import { TalexTouch } from '../../types'
import { BrowserWindow } from 'electron'

let configPath: string

function broadcastUpdate(name: string) {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    channel?.sendTo(win, ChannelType.MAIN, 'storage:update', { name })
  }
}

let channel: ReturnType<typeof genTouchChannel> | null = null

const module = {
  name: Symbol('StorageChannel'),
  listeners: [] as Array<() => void>,
  filePath: 'config',
  configs: new Map<string, object>(),

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

  init(app: TalexTouch.TouchApp) {
    configPath = path.join(app.rootPath, 'config')
    console.log('[Config] Init config path ' + configPath)

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
  },

  destroy() {
    this.listeners.forEach((f) => f())
    this.listeners = []
    this.configs.clear()
    channel = null
  }
}

export const getConfig = (name: string) => module.getConfig(name)
export const saveConfig = module.saveConfig.bind(module)

export default module as TalexTouch.IModule
