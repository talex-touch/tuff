import { TouchSDK, TouchSDKOptions } from './index'

/**
 * Factory function to create a TouchSDK instance
 */
export function createTouchSDK(options: TouchSDKOptions): TouchSDK {
  return new TouchSDK(options)
}

/**
 * Singleton instance for convenience
 */
let sdkInstance: TouchSDK | null = null

export function initTouchSDK(options: TouchSDKOptions): TouchSDK {
  sdkInstance = new TouchSDK(options)
  return sdkInstance
}

export function getTouchSDK(): TouchSDK {
  if (!sdkInstance) {
    throw new Error('TouchSDK not initialized. Call initTouchSDK first.')
  }
  return sdkInstance
}

export function useTouchSDK(options?: TouchSDKOptions) {
  if (!sdkInstance) {
    if ( !options ) {
      throw new Error('TouchSDK not initialized. Call initTouchSDK first. Cannot use hook here.')
    }
    initTouchSDK(options)
  }

  return getTouchSDK()
}

/**
 * Utility functions for common operations
 */
export const TouchUtils = {
  async openFolder(path: string): Promise<void> {
    return getTouchSDK().openFolder({ path })
  },

  async executeCommand(command: string): Promise<void> {
    return getTouchSDK().executeCommand({ command })
  },

  async openApp(appName: string): Promise<void> {
    return getTouchSDK().openApp({ appName })
  },

  async openUrl(url: string): Promise<void> {
    return getTouchSDK().openExternalUrl({ url })
  },

  async openPluginFolder(pluginName: string): Promise<void> {
    return getTouchSDK().openPluginFolder(pluginName)
  }
}
