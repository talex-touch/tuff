import type { PreloadAPI } from '@talex-touch/utils/preload'

/**
 * What preload actually bridges — deliberately narrower than @electron-toolkit's ElectronAPI.
 *
 * This used to be typed as the full `ElectronAPI`, which advertised `invoke`, `sendSync`,
 * `once` and `removeAllListeners` on any channel name. Those are no longer bridged (#693), and
 * leaving the wide type in place would let such a call typecheck and then fail at runtime —
 * the type is where the narrowing has to be visible.
 *
 * `send` and `on` accept only the raw transport channels; preload throws for anything else.
 */
export interface BridgedElectronAPI {
  ipcRenderer: {
    send: (channel: string, ...args: unknown[]) => void
    on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => () => void
    removeListener: (channel: string, listener: (...args: unknown[]) => void) => void
  }
  process: {
    versions: Partial<NodeJS.ProcessVersions>
    platform: NodeJS.Platform
  }
}

declare global {
  interface Window {
    electron: BridgedElectronAPI
    api: PreloadAPI
  }
}
