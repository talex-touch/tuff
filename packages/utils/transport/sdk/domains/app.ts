import type { ITuffTransport } from '../../types'
import { AppEvents } from '../../events'

export interface AppSdk {
  close: () => Promise<void>
  hide: () => Promise<void>
  minimize: () => Promise<void>
  focus: () => Promise<void>
  openDevTools: (options?: Parameters<ITuffTransport['send']>[1]) => Promise<void>

  getCwd: () => Promise<string>
  getOS: () => Promise<unknown>
  getPackage: () => Promise<unknown>

  openExternal: (url: string) => Promise<void>
  showInFolder: (path: string) => Promise<void>
  openApp: (options: { appName?: string; path?: string }) => Promise<void>
  executeCommand: (options: { command: string }) => Promise<unknown>
  readFile: (path: string) => Promise<string>
}

export function createAppSdk(transport: ITuffTransport): AppSdk {
  return {
    close: () => transport.send(AppEvents.window.close),
    hide: () => transport.send(AppEvents.window.hide),
    minimize: () => transport.send(AppEvents.window.minimize),
    focus: () => transport.send(AppEvents.window.focus),
    openDevTools: (options) => transport.send(AppEvents.debug.openDevTools, options as any),

    getCwd: () => transport.send(AppEvents.system.getCwd),
    getOS: () => transport.send(AppEvents.system.getOS),
    getPackage: () => transport.send(AppEvents.system.getPackage),

    openExternal: (url) => transport.send(AppEvents.system.openExternal, { url }),
    showInFolder: (path) => transport.send(AppEvents.system.showInFolder, { path }),
    openApp: (options) => transport.send(AppEvents.system.openApp, options),
    executeCommand: (options) => transport.send(AppEvents.system.executeCommand, options as any),
    readFile: (path) => transport.send(AppEvents.system.readFile, { source: path }),
  }
}
