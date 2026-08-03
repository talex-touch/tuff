import type { AppSetting, TuffQuery } from '@talex-touch/utils'
import type { IPluginFeature } from '@talex-touch/utils/plugin'
import type { CoreBoxInputChangeRequest } from '@talex-touch/utils/transport/events/types'
import type { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import type { TouchWindow } from '../../../core/touch-window'
import type { TouchPlugin } from '../../plugin/plugin'
import type { CoreBoxKeyEvent } from './key-event'
import { StorageList } from '@talex-touch/utils'
import { PluginStatus } from '@talex-touch/utils/plugin'
import { CoreBoxEvents, FlowEvents, PluginEvents } from '@talex-touch/utils/transport/events'
import { app, WebContentsView } from 'electron'
import { buildWindowWebPreferences } from '../../../core/window-security-profile'
import { useAliveWebContents } from '../../../hooks/use-electron-guard'
import { createLogger } from '../../../utils/logger'
import { pluginModule } from '../../plugin/plugin-module'
import { usePluginInjections } from '../../plugin/runtime/plugin-injections'
import { buildPluginViewWebPreferences } from '../../plugin/runtime/plugin-view-host'
import { resolvePluginViewSecurityProfile } from '../../plugin/runtime/plugin-view-security-profile'
import {
  registerPluginWebContents,
  unregisterPluginWebContents
} from '../../plugin/runtime/plugin-view-registry'
import {
  createPluginViewNavigationPolicy,
  installPluginViewNavigationPolicy
} from '../../plugin/runtime/plugin-window-policy'
import { getMainConfig } from '../../storage'
import { getBoxItemManager } from '../item-sdk'
import {
  buildCoreBoxKeyModifiers,
  isBlockedCoreBoxFunctionKey,
  mapDomKeyToElectronKeyCode,
  resolveCoreBoxFlowShortcut
} from './key-event'
import { coreBoxManager } from './manager'
import { metaOverlayManager } from './meta-overlay'
import { viewCacheManager } from './view-cache'
import { getLiveViewWebContents } from './web-contents-view-guard'

const pluginViewLog = createLogger('CoreBox').child('Window')
const CLIPBOARD_TYPE_BITS = {
  text: 0b0001,
  image: 0b0010,
  files: 0b0100
} as const

type CoreBoxTransport = ReturnType<typeof getTuffTransportMain>

export interface ExtractedCoreBoxUIView {
  view: WebContentsView
  plugin: TouchPlugin
  feature?: IPluginFeature
}

export interface PluginViewControllerOptions {
  headerHeight: number
  getCurrentWindow: () => TouchWindow | undefined
  getTransport: () => CoreBoxTransport
  getAppSettingConfig: () => AppSetting
  applyThemeToView: (view: WebContentsView) => void
  stopFollowingSystemTheme: () => void
  isCurrentThemeDark: () => boolean
  isAppDev: () => boolean
}

export class PluginViewController {
  private uiView: WebContentsView | null = null
  private uiViewFocused = false
  private attachedPlugin: TouchPlugin | null = null
  private attachedFeature: IPluginFeature | null = null
  private detachingUIView = false
  private inputAllowed = false
  private clipboardAllowedTypes = 0

  constructor(private readonly options: PluginViewControllerOptions) {}

  public getAttachedPlugin(): TouchPlugin | null {
    return this.attachedPlugin
  }

  public hasView(): boolean {
    return this.uiView !== null
  }

  public enableInputMonitoring(): void {
    this.inputAllowed = true
    pluginViewLog.debug('Input monitoring enabled for UI view')
  }

  public enableClipboardMonitoring(types: number): void {
    if (this.clipboardAllowedTypes === types) {
      pluginViewLog.debug('Clipboard monitoring already configured, skipping update')
      return
    }

    this.clipboardAllowedTypes = types
    pluginViewLog.debug(`Clipboard monitoring enabled for types: ${types.toString(2)}`)
  }

  public shouldForwardClipboardChange(itemType: 'text' | 'image' | 'files'): boolean {
    if (!this.attachedPlugin || this.clipboardAllowedTypes === 0) {
      return false
    }

    return (this.clipboardAllowedTypes & CLIPBOARD_TYPE_BITS[itemType]) !== 0
  }

  public getClipboardAllowedTypes(): number {
    return this.clipboardAllowedTypes
  }

  public forwardInputChange(payload: CoreBoxInputChangeRequest): void {
    if (!this.inputAllowed || !this.attachedPlugin) return

    this.sendChannelMessageToUIView(CoreBoxEvents.input.change.toEventName(), {
      input: payload.input,
      query: payload.query,
      source: payload.source
    })
  }

  public resizeToWindow(browserWindow: Electron.BrowserWindow): void {
    if (!this.uiView || browserWindow.isDestroyed()) {
      return
    }
    const bounds = browserWindow.getBounds()
    this.uiView.setBounds({
      x: 0,
      y: this.options.headerHeight,
      width: bounds.width,
      height: Math.max(0, bounds.height - this.options.headerHeight)
    })
  }

  public focusView(): boolean {
    const webContents = this.getAliveUIViewWebContents()
    if (!webContents) {
      return false
    }
    webContents.focus()
    this.uiViewFocused = true
    return true
  }

  public reloadView(): void {
    this.getAliveUIViewWebContents()?.reload()
  }

  public async attach(
    url: string,
    plugin?: TouchPlugin,
    query?: TuffQuery,
    feature?: IPluginFeature
  ): Promise<void> {
    const startTime = performance.now()
    const metrics = { preload: 0, viewCreate: 0, total: 0 }

    if (this.detachingUIView) {
      pluginViewLog.warn('Cannot attach UI view while ownership transfer is in progress')
      return
    }

    const currentWindow = this.options.getCurrentWindow()
    if (!currentWindow) {
      pluginViewLog.error('Cannot attach UI view: no window available')
      return
    }

    const transport = this.options.getTransport()
    const injections = usePluginInjections(plugin, 'core-box:attachUIView')
    const securityProfile = resolvePluginViewSecurityProfile(plugin, {
      source: 'core-box:attachUIView',
      injections
    })
    pluginViewLog.info('Resolved plugin UI view security profile', {
      meta: {
        plugin: plugin?.name,
        candidateProfile: securityProfile.candidateProfile,
        effectiveProfile: securityProfile.effectiveProfile,
        reason: securityProfile.reason
      }
    })

    pluginViewLog.debug(`AttachUIView - loading ${url}`)

    if (this.uiView) {
      pluginViewLog.warn('UI view already attached, skipping re-attachment')
      return
    }

    this.syncViewCacheConfig()

    if (plugin) {
      const cached = viewCacheManager.get(plugin, feature)
      if (cached) {
        if (feature?.interaction?.type === 'webcontent') {
          this.inputAllowed = feature.interaction.allowInput !== false
        }
        this.uiView = cached.view
        this.attachedPlugin = cached.plugin
        this.attachedFeature = cached.feature ?? null
        this.uiViewFocused = true

        currentWindow.window.contentView.addChildView(this.uiView)
        this.resizeToWindow(currentWindow.window)

        const uiWebContents = this.getAliveUIViewWebContents()
        if (uiWebContents) {
          this.options.applyThemeToView(this.uiView)
          uiWebContents.focus()

          if (query) {
            const normalizedQuery: TuffQuery = { ...query }
            void transport
              .sendToPlugin(plugin.name, CoreBoxEvents.input.change, {
                input: normalizedQuery.text ?? '',
                query: normalizedQuery,
                source: 'initial'
              })
              .catch(() => {})
          }

          this.broadcastCoreBoxUiResume(plugin.name, {
            source: 'cache',
            featureId: feature?.id,
            url: cached.url
          })
        }

        pluginViewLog.info(`AttachUIView cache hit: ${plugin.name}`)
        return
      }
    }

    if (feature?.interaction?.type === 'webcontent') {
      const shouldAllowInput = feature.interaction.allowInput !== false
      if (shouldAllowInput) {
        this.inputAllowed = true
        pluginViewLog.debug('Auto-enabled input monitoring for webcontent feature')
      }
    }

    metrics.preload = performance.now() - startTime

    const webPreferenceOverrides: Electron.WebPreferences = {
      scrollBounce: true,
      transparent: true
    }
    const webPreferences = plugin
      ? buildPluginViewWebPreferences(securityProfile.effectiveProfile, {
          plugin,
          themeStyle: getMainConfig(StorageList.THEME_STYLE) ?? {},
          source: `core-box:${url}`,
          overrides: webPreferenceOverrides
        })
      : buildWindowWebPreferences('app', webPreferenceOverrides)
    const navigationPolicy = plugin
      ? await createPluginViewNavigationPolicy({
          pluginRoot: plugin.pluginPath,
          targetUrl: url,
          devAddress: plugin.dev.address,
          appIsPackaged: app.isPackaged,
          pluginDevEnabled: plugin.dev.enable,
          pluginDevSource: Boolean(plugin.dev.source)
        })
      : null

    const viewCreateStart = performance.now()
    const view = (this.uiView = new WebContentsView({ webPreferences }))
    if (navigationPolicy) {
      installPluginViewNavigationPolicy(view.webContents, navigationPolicy)
    }
    if (plugin) {
      const pluginViewWebContentsId = view.webContents.id
      const registrationToken = registerPluginWebContents(
        pluginViewWebContentsId,
        plugin.getActivationIdentity()
      )
      view.webContents.once('destroyed', () => {
        unregisterPluginWebContents(pluginViewWebContentsId, registrationToken)
      })
    }
    metrics.viewCreate = performance.now() - viewCreateStart
    this.attachedPlugin = plugin ?? null
    this.attachedFeature = feature ?? null

    this.uiViewFocused = true
    currentWindow.window.contentView.addChildView(this.uiView)

    metaOverlayManager.ensureOnTop()

    this.uiView.webContents.addListener('blur', () => {
      this.uiViewFocused = false
    })

    this.uiView.webContents.addListener('focus', () => {
      this.uiViewFocused = true
    })

    this.uiView.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return

      if (isBlockedCoreBoxFunctionKey(input.key)) {
        event.preventDefault()
        return
      }

      const flowShortcut = resolveCoreBoxFlowShortcut(input)
      if (flowShortcut) {
        const ownerWindow = this.options.getCurrentWindow()
        if (
          this.uiView !== view ||
          !ownerWindow ||
          ownerWindow.window.isDestroyed() ||
          !ownerWindow.window.isVisible()
        ) {
          return
        }

        event.preventDefault()
        const triggerEvent =
          flowShortcut === 'detach' ? FlowEvents.triggerDetach : FlowEvents.triggerTransfer
        transport.broadcastToWindow(ownerWindow.window.id, triggerEvent, undefined)
        return
      }

      if (input.key === 'Escape') {
        pluginViewLog.debug('ESC pressed in UI view, exiting UI mode')
        coreBoxManager.exitUIMode()
        event.preventDefault()
        return
      }

      if (input.key === 'r' && (input.control || input.meta)) {
        if (app.isPackaged) {
          event.preventDefault()
        }
      }
    })

    this.uiView.webContents.addListener('dom-ready', () => {
      this.options.applyThemeToView(view)

      if (plugin) {
        const liveWebContents = getLiveViewWebContents(view)
        if (plugin.dev?.enable && liveWebContents) {
          liveWebContents.openDevTools({ mode: 'detach' })
          this.uiViewFocused = true
        }

        if (injections?.styles) {
          void getLiveViewWebContents(this.uiView)?.insertCSS(injections.styles)
        }
        if (pluginModule.pluginManager) {
          pluginModule.pluginManager.setActivePlugin(plugin.name)
        } else {
          pluginViewLog.warn('Plugin manager not available, cannot set plugin active')
        }

        getLiveViewWebContents(this.uiView)?.focus()
      }
    })

    this.resizeToWindow(currentWindow.window)

    pluginViewLog.debug(`AttachUIView - resolved URL ${url}`)
    this.uiView.webContents.loadURL(url)

    if (plugin) {
      viewCacheManager.set(plugin, view, url, feature)
    }

    metrics.total = performance.now() - startTime
    pluginViewLog.info(
      `AttachUIView metrics: preload=${metrics.preload.toFixed(1)}ms viewCreate=${metrics.viewCreate.toFixed(1)}ms total=${metrics.total.toFixed(1)}ms`
    )

    if (query && plugin) {
      const normalizedQuery: TuffQuery = { ...query }

      if (normalizedQuery.inputs && normalizedQuery.inputs.length > 0) {
        const seen = new Set<string>()
        normalizedQuery.inputs = normalizedQuery.inputs.filter((input) => {
          const key = `${input.type}:${input.content?.slice(0, 100)}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })

        if (!normalizedQuery.text && normalizedQuery.inputs.length > 0) {
          const firstInput = normalizedQuery.inputs[0]
          if (firstInput.type === 'text' || firstInput.type === 'html') {
            normalizedQuery.text = firstInput.content
            normalizedQuery.inputs = normalizedQuery.inputs.slice(1)
          }
        }
      }

      this.uiView.webContents.once('dom-ready', () => {
        void transport.sendToPlugin(plugin.name, CoreBoxEvents.input.change, {
          input: normalizedQuery.text ?? '',
          query: normalizedQuery,
          source: 'initial'
        })

        this.broadcastCoreBoxUiResume(plugin.name, {
          source: 'attach',
          featureId: feature?.id,
          url
        })
      })
    }

    if (!query && plugin) {
      this.uiView.webContents.once('dom-ready', () => {
        this.broadcastCoreBoxUiResume(plugin.name, {
          source: 'attach',
          featureId: feature?.id,
          url
        })
      })
    }
  }

  public detach(): void {
    if (this.detachingUIView) {
      pluginViewLog.debug('detachUIView skipped because detachment is already in progress')
      return
    }
    this.detachingUIView = true
    this.inputAllowed = false
    this.clipboardAllowedTypes = 0

    try {
      this.options.stopFollowingSystemTheme()

      const view = this.uiView
      if (!view) {
        return
      }

      if (this.attachedPlugin && pluginModule.pluginManager) {
        const plugin = this.attachedPlugin
        getBoxItemManager().clear(plugin.name)
        pluginViewLog.debug(`Cleared BoxItemManager items for plugin: ${plugin.name}`)

        if (plugin.status === PluginStatus.ACTIVE) {
          plugin.status = PluginStatus.ENABLED
          this.broadcastPluginMessage(
            plugin.name,
            PluginEvents.lifecycleSignal.inactive.toEventName(),
            undefined
          )
        }
      }

      const webContents = getLiveViewWebContents(view)
      const currentWindow = this.options.getCurrentWindow()
      if (currentWindow && !currentWindow.window.isDestroyed()) {
        if (webContents) {
          try {
            if (webContents.isDevToolsOpened()) {
              webContents.closeDevTools()
            }
          } catch (error) {
            pluginViewLog.warn('Failed to close UI view DevTools', { error })
          }
        }
        try {
          currentWindow.window.contentView.removeChildView(view)
        } catch (error) {
          pluginViewLog.warn('Failed to remove child view', { error })
        }
        currentWindow.window.webContents.focus()
      } else {
        pluginViewLog.warn('Cannot remove child view: current window is null or destroyed')
      }

      type AppSettingWithViewCache = AppSetting & {
        viewCache?: {
          maxCachedViews?: number
        }
      }
      const settings = this.options.getAppSettingConfig() as AppSettingWithViewCache
      const cacheEnabled = (settings.viewCache?.maxCachedViews ?? 0) > 0

      if (!cacheEnabled || !this.attachedPlugin) {
        try {
          webContents?.close()
        } catch (error) {
          pluginViewLog.warn('Failed to close UI view', { error })
        }
        if (this.attachedPlugin) {
          viewCacheManager.release(this.attachedPlugin, this.attachedFeature ?? undefined)
        }
      }

      this.uiView = null
      this.attachedPlugin = null
      this.attachedFeature = null
    } finally {
      this.detachingUIView = false
    }
  }

  public sendToUIView(channel: string, ...args: unknown[]): void {
    this.getAliveUIViewWebContents()?.postMessage(channel, args)
  }

  public sendChannelMessageToUIView(eventName: string, data?: unknown): void {
    if (!this.attachedPlugin || !this.uiView || this.detachingUIView) {
      return
    }
    if (!this.getAliveUIViewWebContents()) {
      return
    }
    this.broadcastPluginMessage(this.attachedPlugin.name, eventName, data)
  }

  public getUIView(): WebContentsView | undefined {
    return this.uiView ?? undefined
  }

  public extractUIView(): ExtractedCoreBoxUIView | null {
    if (this.detachingUIView || !this.uiView || !this.attachedPlugin) {
      return null
    }

    const currentWindow = this.options.getCurrentWindow()
    if (!currentWindow || currentWindow.window.isDestroyed()) {
      return null
    }

    if (!currentWindow.window.isVisible()) {
      pluginViewLog.warn('Cannot extract UI view: CoreBox window is not visible')
      return null
    }

    this.detachingUIView = true
    try {
      currentWindow.window.contentView.removeChildView(this.uiView)
    } catch (error) {
      this.detachingUIView = false
      pluginViewLog.error('Failed to remove UI view from CoreBox', { error })
      return null
    }

    const result: ExtractedCoreBoxUIView = {
      view: this.uiView,
      plugin: this.attachedPlugin,
      feature: this.attachedFeature ?? undefined
    }

    this.uiView = null
    this.attachedPlugin = null
    this.attachedFeature = null
    this.uiViewFocused = false

    pluginViewLog.info('UI view extracted for transfer')
    return result
  }

  public completeExtractedUIViewTransfer(): void {
    this.detachingUIView = false
  }

  public abandonExtractedUIView(): void {
    this.detachingUIView = false
    this.inputAllowed = false
    this.clipboardAllowedTypes = 0
    this.options.stopFollowingSystemTheme()
  }

  public restoreExtractedUIView(extracted: ExtractedCoreBoxUIView): boolean {
    const currentWindow = this.options.getCurrentWindow()
    if (!currentWindow || currentWindow.window.isDestroyed()) {
      this.detachingUIView = false
      pluginViewLog.warn('Cannot restore UI view: CoreBox window is not available')
      return false
    }

    if (this.uiView) {
      this.detachingUIView = false
      pluginViewLog.warn('Cannot restore UI view: another UI view is already attached')
      return false
    }

    this.uiView = extracted.view
    this.attachedPlugin = extracted.plugin
    this.attachedFeature = extracted.feature ?? null
    this.uiViewFocused = true

    try {
      currentWindow.window.contentView.addChildView(extracted.view)
      this.resizeToWindow(currentWindow.window)
    } catch (error) {
      pluginViewLog.error('Failed to restore extracted UI view', { error })
      this.uiView = null
      this.attachedPlugin = null
      this.attachedFeature = null
      this.uiViewFocused = false
      this.detachingUIView = false
      return false
    }

    const webContents = getLiveViewWebContents(extracted.view)
    if (webContents) {
      this.options.applyThemeToView(extracted.view)
      webContents.focus()
    }

    this.detachingUIView = false
    pluginViewLog.info('UI view restored after failed transfer', {
      meta: { plugin: extracted.plugin.name }
    })
    return true
  }

  public isUIViewActive(): boolean {
    return !!(this.uiView && this.attachedPlugin)
  }

  public isUIViewFocused(): boolean {
    return this.uiViewFocused
  }

  public forwardKeyEvent(event: CoreBoxKeyEvent): void {
    if (!this.uiView) {
      pluginViewLog.debug('Cannot forward key event: no UI view attached')
      return
    }

    const webContents = this.getAliveUIViewWebContents()
    if (!webContents) {
      pluginViewLog.debug('Cannot forward key event: UI view webContents is unavailable')
      return
    }

    if (isBlockedCoreBoxFunctionKey(event.key)) {
      pluginViewLog.debug(`Blocked function key forwarding: ${event.key}`)
      return
    }

    const modifiers = buildCoreBoxKeyModifiers(event)
    const keyCode = mapDomKeyToElectronKeyCode(event.key)

    pluginViewLog.debug(`Simulating key input: ${event.key}`, {
      meta: { keyCode, modifiers: modifiers.join(',') }
    })

    webContents.sendInputEvent({
      type: 'keyDown',
      keyCode,
      modifiers
    })

    if (event.key.length === 1) {
      webContents.sendInputEvent({
        type: 'char',
        keyCode: event.key,
        modifiers
      })
    }

    webContents.sendInputEvent({
      type: 'keyUp',
      keyCode,
      modifiers
    })
  }

  public openPluginDevTools(pluginName: string): boolean {
    if (!this.attachedPlugin || this.attachedPlugin.name !== pluginName) {
      return false
    }

    const devtoolsAllowed = this.attachedPlugin.dev?.enable || this.options.isAppDev()
    if (!devtoolsAllowed) {
      pluginViewLog.warn(`DevTools blocked for non-dev plugin: ${pluginName}`)
      return false
    }

    const uiWebContents = this.getAliveUIViewWebContents()
    if (!uiWebContents) {
      return false
    }
    uiWebContents.openDevTools({ mode: 'detach' })
    return true
  }

  private getAliveUIViewWebContents() {
    return useAliveWebContents(this.uiView)
  }

  private broadcastPluginMessage(pluginName: string, eventName: string, data?: unknown): void {
    this.options.getTransport().broadcastPlugin(pluginName, eventName, data)
  }

  private broadcastCoreBoxUiResume(
    pluginName: string,
    payload: {
      source: string
      featureId?: string | number
      url: string
    }
  ): void {
    this.broadcastPluginMessage(pluginName, CoreBoxEvents.ui.resume.toEventName(), payload)
  }

  private syncViewCacheConfig(): void {
    type AppSettingWithViewCache = AppSetting & {
      viewCache?: {
        maxCachedViews?: number
        hotCacheDurationMs?: number
      }
    }
    const settings = this.options.getAppSettingConfig() as AppSettingWithViewCache
    const cfg = settings.viewCache
    if (cfg && typeof cfg === 'object') {
      const patch: { maxCachedViews?: number; hotCacheDurationMs?: number } = {}
      if (typeof cfg.maxCachedViews === 'number') patch.maxCachedViews = cfg.maxCachedViews
      if (typeof cfg.hotCacheDurationMs === 'number')
        patch.hotCacheDurationMs = cfg.hotCacheDurationMs
      viewCacheManager.updateConfig(patch)
      viewCacheManager.cleanupStale()
    }
  }
}
