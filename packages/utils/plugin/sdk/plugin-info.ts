import { hasWindow } from '../../env'

export interface PluginRuntimeInfo {
  name?: string
  sdkapi?: number
  [key: string]: unknown
}

const DEFAULT_PLUGIN_INFO_ERROR
  = '[Plugin SDK] Plugin info not available. Make sure this is called in a plugin context.'

const DEFAULT_PLUGIN_NAME_ERROR
  = '[Plugin SDK] Cannot determine plugin name. Make sure this is called in a plugin context.'

export function tryUsePluginInfo(): PluginRuntimeInfo | null {
  if (!hasWindow()) {
    return null
  }
  return (window as any)?.$plugin ?? null
}

export function usePluginInfo(errorMessage = DEFAULT_PLUGIN_INFO_ERROR): PluginRuntimeInfo {
  const plugin = tryUsePluginInfo()
  if (!plugin) {
    throw new Error(errorMessage)
  }
  return plugin
}

export function usePluginName(errorMessage = DEFAULT_PLUGIN_NAME_ERROR): string {
  const plugin = usePluginInfo(errorMessage)
  const name = typeof plugin.name === 'string' ? plugin.name : undefined
  if (!name) {
    throw new Error(errorMessage)
  }
  return name
}

export function tryGetPluginSdkApi(): number | undefined {
  const plugin = tryUsePluginInfo()
  const sdkapi = plugin?.sdkapi
  return typeof sdkapi === 'number' ? sdkapi : undefined
}
