import type { ITuffTransport, TuffEvent } from '@talex-touch/utils/transport'
import { AppEvents, PluginEvents } from '@talex-touch/utils/transport/events'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'

export interface TouchClientChannelLike {
  regChannel: (eventName: string, callback: (data: any) => void) => () => void
  send: (eventName: string, arg?: any) => Promise<any>
}

export interface TouchSDKOptions {
  transport?: ITuffTransport
  channel?: TouchClientChannelLike
}

export interface FolderOpenOptions {
  path: string
}

export interface ExecuteCommandOptions {
  command: string
}

export interface AppOpenOptions {
  appName?: string
  path?: string
}

export interface ExternalUrlOptions {
  url: string
}

export interface TempFileCreateOptions {
  namespace: string
  ext?: string
  text?: string
  base64?: string
  prefix?: string
  retentionMs?: number
}

export interface TempFileCreateResult {
  url: string
  sizeBytes: number
  createdAt: number
}

export interface TempFileDeleteOptions {
  url?: string
  path?: string
}

export interface TempFileDeleteResult {
  success: boolean
}

export class TouchSDK {
  private transport: ITuffTransport | null
  private channel: TouchClientChannelLike | null

  constructor(options: TouchSDKOptions) {
    this.transport = options.transport ?? null
    this.channel = options.channel ?? null
  }

  private async sendEvent<TReq, TRes>(event: TuffEvent<TReq, TRes>, payload?: TReq): Promise<TRes> {
    if (this.transport) {
      const shouldPassPayload = payload !== undefined
      if (shouldPassPayload) {
        return this.transport.send(event, payload)
      }
      return this.transport.send(event as TuffEvent<void, TRes>)
    }

    if (this.channel) {
      return this.channel.send(event.toEventName(), payload as any) as Promise<TRes>
    }

    throw new Error('[TouchSDK] Transport or channel not initialized.')
  }

  /**
   * System Operations
   */
  async closeApp(): Promise<void> {
    return this.sendEvent(AppEvents.window.close)
  }

  async hideApp(): Promise<void> {
    return this.sendEvent(AppEvents.window.hide)
  }

  async minimizeApp(): Promise<void> {
    return this.sendEvent(AppEvents.window.minimize)
  }

  async openDevTools(): Promise<void> {
    return this.sendEvent(AppEvents.debug.openDevTools)
  }

  async getCurrentWorkingDirectory(): Promise<string> {
    return this.sendEvent(AppEvents.system.getCwd)
  }

  async getPackageInfo(): Promise<any> {
    return this.sendEvent(AppEvents.system.getPackage)
  }

  async getOSInfo(): Promise<any> {
    return this.sendEvent(AppEvents.system.getOS)
  }

  /**
   * File & Folder Operations
   */
  async openFolder(options: FolderOpenOptions): Promise<void> {
    return this.sendEvent(AppEvents.system.showInFolder, options)
  }

  async executeCommand(options: ExecuteCommandOptions): Promise<void> {
    await this.sendEvent(AppEvents.system.executeCommand, options)
  }

  async openApp(options: AppOpenOptions): Promise<void> {
    return this.sendEvent(AppEvents.system.openApp, options)
  }

  async openExternalUrl(options: ExternalUrlOptions): Promise<void> {
    return this.sendEvent(AppEvents.system.openExternal, options)
  }

  /**
   * Temp file operations
   */
  async createTempFile(_options: TempFileCreateOptions): Promise<TempFileCreateResult> {
    throw new Error('[TouchSDK] createTempFile has been removed in hard-cut mode.')
  }

  async deleteTempFile(_options: TempFileDeleteOptions): Promise<TempFileDeleteResult> {
    throw new Error('[TouchSDK] deleteTempFile has been removed in hard-cut mode.')
  }

  /**
   * Plugin Operations
   */
  async openPluginFolder(pluginName: string): Promise<void> {
    return this.sendEvent(PluginEvents.api.openFolder, { name: pluginName })
  }

  /**
   * Opens the DevTools for a plugin's Surface WebContents
   * @param pluginName - The name of the plugin to open DevTools for
   * @returns Promise that resolves when DevTools is opened
   */
  async openPluginDevTools(pluginName: string): Promise<void> {
    throw new Error(`[TouchSDK] openPluginDevTools has been removed in hard-cut mode: ${pluginName}`)
  }

  /**
   * Reloads a plugin by its name
   * @param pluginName - The name of the plugin to reload
   * @returns Promise that resolves when the reload operation completes
   */
  async reloadPlugin(pluginName: string): Promise<void> {
    await this.sendEvent(PluginEvents.api.reload, { name: pluginName })
  }

  /**
   * Module Operations
   */
  async openModuleFolder(moduleName?: string): Promise<void> {
    throw new Error(
      `[TouchSDK] openModuleFolder has been removed in hard-cut mode: ${moduleName || 'default'}`,
    )
  }

  /**
   * Event Registration
   */
  onChannelEvent(eventName: string, callback: (data: any) => void): () => void {
    if (this.transport) {
      return this.transport.on(defineRawEvent<any, any>(eventName), callback)
    }
    if (this.channel) {
      return this.channel.regChannel(eventName, callback)
    }
    throw new Error('[TouchSDK] Transport or channel not initialized.')
  }

  /**
   * Raw channel access for advanced usage
   */
  get rawChannel(): TouchClientChannelLike {
    if (!this.channel) {
      throw new Error('[TouchSDK] Channel not initialized.')
    }
    return this.channel
  }
}
