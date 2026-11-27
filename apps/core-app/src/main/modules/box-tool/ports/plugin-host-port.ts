import type { IProviderActivate, ISearchProvider, TuffQuery, TuffSearchResult } from '@talex-touch/utils'
import type { IManifest } from '@talex-touch/utils/plugin'
import type {
  CoreBoxInputChangeRequest,
  ProviderDetail
} from '@talex-touch/utils/transport/events/types'
import type { PluginActivationIdentity } from '@talex-touch/utils/transport/main'
import type { TouchPlugin } from '../../plugin/plugin'
import type { ProviderContext } from '../search-engine/types'

export interface BoxToolPluginActivationHost {
  getActivationState: () => IProviderActivate[] | null
  activateProviders: (activations: IProviderActivate[] | null) => void
  deactivateProvider: (uniqueKey: string) => void
}

export interface BoxToolPluginFeatureAdapter extends ISearchProvider<ProviderContext> {
  attach(host: BoxToolPluginActivationHost): void
  handleActiveFeatureInput(payload: CoreBoxInputChangeRequest): Promise<boolean>
}

export interface BoxToolPluginViewInjections {
  _: {
    indexPath?: string
    preload?: string
    isWebviewInit: boolean
  }
  attrs: Record<string, string>
  styles: string
  js: string
}

export interface BoxToolResolvedPluginViewSecurityProfile {
  candidateProfile: 'trusted-plugin-view'
  effectiveProfile: 'trusted-plugin-view'
  reason: 'missing-plugin' | 'trusted-candidate'
}

export interface BoxToolPluginViewNavigationPolicyOptions {
  pluginRoot: string
  targetUrl: string
  devAddress?: string
  appIsPackaged: boolean
  pluginDevEnabled: boolean
  pluginDevSource: boolean
  permissionScope?: { pluginId: string; sdkapi?: number }
}

export type BoxToolPluginViewNavigationPolicyHandle = unknown

export interface BoxToolDevPluginInstallResult {
  status: 'success' | 'error' | 'exists'
  manifest?: IManifest
  error?: string
}

export interface BoxToolPluginHostPort {
  hasPluginManager(): boolean
  setActivePlugin(pluginName: string): void
  getPluginProviderDetail(pluginId: string): ProviderDetail | null
  installDevPluginFromPath(
    sourcePath: string,
    options?: { forceUpdate?: boolean }
  ): Promise<BoxToolDevPluginInstallResult>
  canInstallTpexPlugin(): boolean
  installTpexPluginFromPath(
    sourcePath: string
  ): Promise<{ manifest?: IManifest } | null | undefined>
  handleActiveFeatureInput(payload: CoreBoxInputChangeRequest): Promise<boolean>
  searchPluginFeatures(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult>
  getDefaultSearchProviders(): {
    featuresAdapter?: BoxToolPluginFeatureAdapter
    entityProvider?: ISearchProvider<ProviderContext>
  }
  usePluginInjections(
    plugin?: TouchPlugin | null,
    source?: string
  ): BoxToolPluginViewInjections | null
  resolvePluginViewSecurityProfile(
    plugin: TouchPlugin | null | undefined,
    context: { source: string; injections?: Pick<BoxToolPluginViewInjections, '_'> | null }
  ): BoxToolResolvedPluginViewSecurityProfile
  buildPluginViewWebPreferences(
    profile: 'trusted-plugin-view',
    options: {
      plugin: TouchPlugin
      themeStyle: unknown
      source: string
      overrides?: Electron.WebPreferences
    }
  ): Electron.WebPreferences
  createPluginViewNavigationPolicy(
    options: BoxToolPluginViewNavigationPolicyOptions
  ): Promise<BoxToolPluginViewNavigationPolicyHandle>
  installPluginViewNavigationPolicy(
    webContents: Electron.WebContents,
    policy: BoxToolPluginViewNavigationPolicyHandle
  ): void
  registerPluginWebContents(webContentsId: number, activation: PluginActivationIdentity): string
  unregisterPluginWebContents(webContentsId: number, registrationToken?: string): boolean
  closePluginWebContents(webContents: Electron.WebContents | null | undefined): void
}

let activePort: BoxToolPluginHostPort | null = null

export function registerBoxToolPluginHostPort(port: BoxToolPluginHostPort): () => void {
  activePort = port
  return () => {
    if (activePort === port) {
      activePort = null
    }
  }
}

export function getBoxToolPluginHostPort(): BoxToolPluginHostPort | null {
  return activePort
}

export function resetBoxToolPluginHostPort(): void {
  activePort = null
}

export function hasBoxToolPluginManager(): boolean {
  return activePort?.hasPluginManager() ?? false
}

export function setBoxToolActivePlugin(pluginName: string): void {
  activePort?.setActivePlugin(pluginName)
}

export function getBoxToolPluginProviderDetail(pluginId: string): ProviderDetail | null {
  return activePort?.getPluginProviderDetail(pluginId) ?? null
}

export async function installBoxToolDevPluginFromPath(
  sourcePath: string,
  options?: { forceUpdate?: boolean }
): Promise<BoxToolDevPluginInstallResult> {
  if (!activePort) {
    return { status: 'error', error: 'PLUGIN_HOST_UNAVAILABLE' }
  }
  return await activePort.installDevPluginFromPath(sourcePath, options)
}

export function canInstallBoxToolTpexPlugin(): boolean {
  return activePort?.canInstallTpexPlugin() ?? false
}

export async function installBoxToolTpexPluginFromPath(
  sourcePath: string
): Promise<{ manifest?: IManifest } | null | undefined> {
  if (!activePort) {
    throw new Error('Plugin host port is not registered')
  }
  return await activePort.installTpexPluginFromPath(sourcePath)
}

export async function forwardBoxToolActiveFeatureInput(
  payload: CoreBoxInputChangeRequest
): Promise<boolean> {
  if (!activePort) {
    return false
  }
  return await activePort.handleActiveFeatureInput(payload)
}

export async function searchBoxToolPluginFeatures(
  query: TuffQuery,
  signal: AbortSignal
): Promise<TuffSearchResult | null> {
  if (!activePort) {
    return null
  }
  return await activePort.searchPluginFeatures(query, signal)
}

export function getBoxToolDefaultPluginSearchProviders(): {
  featuresAdapter?: BoxToolPluginFeatureAdapter
  entityProvider?: ISearchProvider<ProviderContext>
} {
  return activePort?.getDefaultSearchProviders() ?? {}
}

export function resolveBoxToolPluginInjections(
  plugin?: TouchPlugin | null,
  source?: string
): BoxToolPluginViewInjections | null {
  if (!plugin) return null
  return activePort?.usePluginInjections(plugin, source) ?? null
}

export function resolveBoxToolPluginViewSecurityProfile(
  plugin: TouchPlugin | null | undefined,
  context: { source: string; injections?: Pick<BoxToolPluginViewInjections, '_'> | null }
): BoxToolResolvedPluginViewSecurityProfile {
  if (activePort) {
    return activePort.resolvePluginViewSecurityProfile(plugin, context)
  }
  if (!plugin) {
    return {
      candidateProfile: 'trusted-plugin-view',
      effectiveProfile: 'trusted-plugin-view',
      reason: 'missing-plugin'
    }
  }
  throw new Error(
    `Cannot resolve security profile for plugin "${plugin.name}": plugin host port is not registered`
  )
}

export function buildBoxToolPluginViewWebPreferences(
  profile: 'trusted-plugin-view',
  options: {
    plugin: TouchPlugin
    themeStyle: unknown
    source: string
    overrides?: Electron.WebPreferences
  }
): Electron.WebPreferences {
  if (!activePort) {
    throw new Error(
      `Cannot build webPreferences for plugin "${options.plugin.name}": plugin host port is not registered`
    )
  }
  return activePort.buildPluginViewWebPreferences(profile, options)
}

export async function createBoxToolPluginViewNavigationPolicy(
  options: BoxToolPluginViewNavigationPolicyOptions
): Promise<BoxToolPluginViewNavigationPolicyHandle> {
  if (!activePort) {
    throw new Error(
      'Cannot create plugin view navigation policy: plugin host port is not registered'
    )
  }
  return await activePort.createPluginViewNavigationPolicy(options)
}

export function installBoxToolPluginViewNavigationPolicy(
  webContents: Electron.WebContents,
  policy: BoxToolPluginViewNavigationPolicyHandle
): void {
  if (!activePort) {
    throw new Error(
      'Cannot install plugin view navigation policy: plugin host port is not registered'
    )
  }
  activePort.installPluginViewNavigationPolicy(webContents, policy)
}

export function registerBoxToolPluginWebContents(
  webContentsId: number,
  activation: PluginActivationIdentity
): string {
  if (!activePort) {
    throw new Error('Cannot register plugin webContents: plugin host port is not registered')
  }
  return activePort.registerPluginWebContents(webContentsId, activation)
}

export function unregisterBoxToolPluginWebContents(
  webContentsId: number,
  registrationToken?: string
): boolean {
  return activePort?.unregisterPluginWebContents(webContentsId, registrationToken) ?? false
}

export function closeBoxToolPluginWebContents(
  webContents: Electron.WebContents | null | undefined
): void {
  if (!webContents || webContents.isDestroyed()) {
    return
  }
  if (activePort) {
    activePort.closePluginWebContents(webContents)
    return
  }
  webContents.close()
}
