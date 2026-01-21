import type { ITouchClientChannel } from '@talex-touch/utils/channel'
import type { ITuffTransport, TuffEvent } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'

const legacyCloseEvent = defineRawEvent<void, void>('close')
const legacyHideEvent = defineRawEvent<void, void>('hide')
const legacyMinimizeEvent = defineRawEvent<void, void>('minimize')
const legacyDevToolsEvent = defineRawEvent<void, void>('dev-tools')
const legacyCwdEvent = defineRawEvent<void, string>('common:cwd')
const legacyPackageEvent = defineRawEvent<void, any>('get-package')
const legacyOsEvent = defineRawEvent<void, any>('get-os')
const legacyFolderOpenEvent = defineRawEvent<FolderOpenOptions, void>('folder:open')
const legacyExecuteCmdEvent = defineRawEvent<ExecuteCommandOptions, void>('execute:cmd')
const legacyAppOpenEvent = defineRawEvent<AppOpenOptions, void>('app:open')
const legacyOpenExternalEvent = defineRawEvent<ExternalUrlOptions, void>('open-external')
const legacyTempFileCreateEvent = defineRawEvent<TempFileCreateOptions, TempFileCreateResult>(
  'temp-file:create',
)
const legacyTempFileDeleteEvent = defineRawEvent<TempFileDeleteOptions, TempFileDeleteResult>(
  'temp-file:delete',
)
const legacyPluginFolderEvent = defineRawEvent<string, void>('plugin:explorer')
const legacyPluginDevToolsEvent = defineRawEvent<string, void>('plugin:open-devtools')
const legacyPluginReloadEvent = defineRawEvent<{ name: string }, void>('reload-plugin')
const legacyModuleFolderEvent = defineRawEvent<{ name?: string }, void>('module:folder')

export interface TouchSDKOptions {
  transport?: ITuffTransport
  channel?: ITouchClientChannel
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
  private channel: ITouchClientChannel | null

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
    return this.sendEvent(legacyCloseEvent)
  }

  async hideApp(): Promise<void> {
    return this.sendEvent(legacyHideEvent)
  }

  async minimizeApp(): Promise<void> {
    return this.sendEvent(legacyMinimizeEvent)
  }

  async openDevTools(): Promise<void> {
    return this.sendEvent(legacyDevToolsEvent)
  }

  async getCurrentWorkingDirectory(): Promise<string> {
    return this.sendEvent(legacyCwdEvent)
  }

  async getPackageInfo(): Promise<any> {
    return this.sendEvent(legacyPackageEvent)
  }

  async getOSInfo(): Promise<any> {
    return this.sendEvent(legacyOsEvent)
  }

  /**
   * File & Folder Operations
   */
  async openFolder(options: FolderOpenOptions): Promise<void> {
    return this.sendEvent(legacyFolderOpenEvent, options)
  }

  async executeCommand(options: ExecuteCommandOptions): Promise<void> {
    return this.sendEvent(legacyExecuteCmdEvent, options)
  }

  async openApp(options: AppOpenOptions): Promise<void> {
    return this.sendEvent(legacyAppOpenEvent, options)
  }

  async openExternalUrl(options: ExternalUrlOptions): Promise<void> {
    return this.sendEvent(legacyOpenExternalEvent, options)
  }

  /**
   * Temp file operations
   */
  async createTempFile(options: TempFileCreateOptions): Promise<TempFileCreateResult> {
    return this.sendEvent(legacyTempFileCreateEvent, options)
  }

  async deleteTempFile(options: TempFileDeleteOptions): Promise<TempFileDeleteResult> {
    return this.sendEvent(legacyTempFileDeleteEvent, options)
  }

  /**
   * Plugin Operations
   */
  async openPluginFolder(pluginName: string): Promise<void> {
    return this.sendEvent(legacyPluginFolderEvent, pluginName)
  }

  /**
   * Opens the DevTools for a plugin's Surface WebContents
   * @param pluginName - The name of the plugin to open DevTools for
   * @returns Promise that resolves when DevTools is opened
   */
  async openPluginDevTools(pluginName: string): Promise<void> {
    return this.sendEvent(legacyPluginDevToolsEvent, pluginName)
  }

  /**
   * Reloads a plugin by its name
   * @param pluginName - The name of the plugin to reload
   * @returns Promise that resolves when the reload operation completes
   */
  async reloadPlugin(pluginName: string): Promise<void> {
    return this.sendEvent(legacyPluginReloadEvent, { name: pluginName })
  }

  /**
   * Module Operations
   */
  async openModuleFolder(moduleName?: string): Promise<void> {
    return this.sendEvent(legacyModuleFolderEvent, { name: moduleName })
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
  get rawChannel(): ITouchClientChannel {
    if (!this.channel) {
      throw new Error('[TouchSDK] Channel not initialized.')
    }
    return this.channel
  }
}
