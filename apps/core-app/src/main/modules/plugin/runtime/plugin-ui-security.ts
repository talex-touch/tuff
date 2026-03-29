import type { WebPreferences } from 'electron'
import { createLogger } from '../../../utils/logger'

const pluginUiSecurityLog = createLogger('PluginSystem').child('Security')
const warnedLegacyPluginUiModes = new Set<string>()

export const LEGACY_PLUGIN_UI_EXCEPTION_REASON =
  'Plugin UI still depends on privileged Electron renderer globals and preload injection; keep this legacy mode until the runtime migrates to contextBridge-based transport.'

export function warnLegacyPluginUiMode(pluginName: string, source: string): void {
  const key = `${pluginName}:${source}`
  if (warnedLegacyPluginUiModes.has(key)) return

  warnedLegacyPluginUiModes.add(key)
  pluginUiSecurityLog.warn(`[Plugin ${pluginName}] Using legacy privileged UI runtime`, {
    meta: {
      source,
      reason: LEGACY_PLUGIN_UI_EXCEPTION_REASON,
      requiredFlags: 'nodeIntegration, contextIsolation=false, webSecurity=false'
    }
  })
}

export function createLegacyPluginViewWebPreferences(preload?: string): WebPreferences {
  return {
    preload: preload || undefined,
    webSecurity: false,
    nodeIntegration: true,
    nodeIntegrationInSubFrames: false,
    contextIsolation: false,
    sandbox: false,
    webviewTag: true,
    scrollBounce: true,
    transparent: true
  }
}

export function createLegacyPluginWebviewAttrs(userAgent: string): Record<string, string> {
  return {
    enableRemoteModule: 'false',
    nodeintegration: 'true',
    webpreferences: 'contextIsolation=false',
    websecurity: 'false',
    useragent: userAgent
  }
}

export function __resetLegacyPluginUiWarningsForTest(): void {
  warnedLegacyPluginUiModes.clear()
}
