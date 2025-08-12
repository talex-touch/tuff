import { ITouchClientChannel } from '@talex-touch/utils/channel'

export interface TouchSDKOptions {
  channel: ITouchClientChannel
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

export class TouchSDK {
  private channel: ITouchClientChannel

  constructor(options: TouchSDKOptions) {
    this.channel = options.channel
  }

  /**
   * System Operations
   */
  async closeApp(): Promise<void> {
    return this.channel.send('close')
  }

  async hideApp(): Promise<void> {
    return this.channel.send('hide')
  }

  async minimizeApp(): Promise<void> {
    return this.channel.send('minimize')
  }

  async openDevTools(): Promise<void> {
    return this.channel.send('dev-tools')
  }

  async getCurrentWorkingDirectory(): Promise<string> {
    return this.channel.send('common:cwd')
  }

  async getPackageInfo(): Promise<any> {
    return this.channel.send('get-package')
  }

  async getOSInfo(): Promise<any> {
    return this.channel.send('get-os')
  }

  /**
   * File & Folder Operations
   */
  async openFolder(options: FolderOpenOptions): Promise<void> {
    return this.channel.send('folder:open', options)
  }

  async executeCommand(options: ExecuteCommandOptions): Promise<void> {
    return this.channel.send('execute:cmd', options)
  }

  async openApp(options: AppOpenOptions): Promise<void> {
    return this.channel.send('app:open', options)
  }

  async openExternalUrl(options: ExternalUrlOptions): Promise<void> {
    return this.channel.send('open-external', options)
  }

  /**
   * Plugin Operations
   */
  async openPluginFolder(pluginName: string): Promise<void> {
    return this.channel.send('plugin:explorer', pluginName)
  }

  /**
   * Module Operations
   */
  async openModuleFolder(moduleName?: string): Promise<void> {
    return this.channel.send('module:folder', { name: moduleName })
  }

  /**
   * Event Registration
   */
  onChannelEvent(eventName: string, callback: (data: any) => void): () => void {
    return this.channel.regChannel(eventName, callback)
  }

  /**
   * Raw channel access for advanced usage
   */
  get rawChannel(): ITouchClientChannel {
    return this.channel
  }
}
