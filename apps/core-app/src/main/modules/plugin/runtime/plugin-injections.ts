import { createLogger } from '../../../utils/logger'

const pluginInjectionLog = createLogger('PluginSystem').child('Injection')

export interface PluginInjections {
  _: {
    indexPath?: string
    preload?: string
    isWebviewInit: boolean
  }
  attrs: Record<string, string>
  styles: string
  js: string
}

export interface PluginInjectionProvider {
  name: string
  __getInjections__: () => PluginInjections
}

export function usePluginInjections(
  plugin?: PluginInjectionProvider | null,
  source = 'unknown'
): PluginInjections | null {
  if (!plugin) return null
  try {
    return plugin.__getInjections__()
  } catch (error) {
    pluginInjectionLog.warn(`[Plugin ${plugin.name}] Failed to build injections`, {
      meta: { source },
      error
    })
    return null
  }
}
