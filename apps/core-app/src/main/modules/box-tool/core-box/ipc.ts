import type { TuffQuery, TuffItem } from '@talex-touch/utils/core-box/tuff/tuff-dsl'
import type { ITuffTransportMain } from '@talex-touch/utils/transport'
import type { TouchApp } from '../../../core/touch-app'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { getTuffTransportMain } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import type {
  AllowClipboardRequest,
  ActivationState,
  DeactivateProviderRequest,
  EnterUIModeRequest,
  ExpandOptions,
  GetProviderDetailsRequest,
  ProviderDetail,
  SetInputRequest,
  SetInputVisibilityRequest,
} from '@talex-touch/utils/transport/events/types'
import { genTouchApp } from '../../../core'
import { pluginModule } from '../../plugin/plugin-module'
import searchEngineCore from '../search-engine/search-core'
import { coreBoxManager } from './manager'
import { coreBoxInputTransport } from './input-transport'
import { coreBoxKeyTransport } from './key-transport'
import { getCoreBoxWindow, windowManager } from './window'
import { BOX_ITEM_CHANNELS, getBoxItemManager } from '../item-sdk'
import { metaOverlayManager } from './meta-overlay'
import { MetaOverlayEvents } from '@talex-touch/utils/transport/events/meta-overlay'
import type { MetaShowRequest, MetaActionExecuteRequest } from '@talex-touch/utils/transport/events/types/meta-overlay'
import { createLogger } from '../../../utils/logger'

const metaOverlayIpcLog = createLogger('CoreBox').child('MetaOverlayIpc')

/**
 * @class IpcManager
 * @description
 * 集中处理所有与 CoreBox 相关的 IPC 通信。
 */
export class IpcManager {
  private static instance: IpcManager
  private _touchApp: TouchApp | null = null
  private transport: ITuffTransportMain | null = null
  private transportDisposers: Array<() => void> = []

  private get touchApp(): TouchApp {
    if (!this._touchApp) {
      this._touchApp = genTouchApp()
    }
    return this._touchApp
  }

  private constructor() {
    //
  }

  private async sendInputValueToRenderer(value: string): Promise<void> {
    const coreBoxWindow = getCoreBoxWindow()
    if (!coreBoxWindow || coreBoxWindow.window.isDestroyed()) {
      throw new Error('CoreBox window not available')
    }

    if (this.transport) {
      await this.transport.sendTo(coreBoxWindow.window.webContents, CoreBoxEvents.input.setQuery, { value })
      return
    }

    await this.touchApp.channel.sendTo(
      coreBoxWindow.window,
      ChannelType.MAIN,
      'core-box:set-query',
      { value }
    )
  }

  private handleExpandRequest(data: ExpandOptions | number): void {
    if (typeof data === 'object' && data) {
      if ((data as ExpandOptions).mode === 'collapse') {
        if (coreBoxManager.isUIMode) {
          return
        }
        coreBoxManager.shrink()
        return
      }

      const currentWindow = windowManager.current?.window
      if (!currentWindow || currentWindow.isDestroyed() || !currentWindow.isVisible()) {
        return
      }

      if ((data as ExpandOptions).mode === 'max') {
        coreBoxManager.expand({ forceMax: true })
        return
      }

      if (typeof (data as ExpandOptions).length === 'number') {
        coreBoxManager.expand({ length: (data as ExpandOptions).length })
        return
      }
    }

    if (typeof data === 'number' && data > 0) {
      const currentWindow = windowManager.current?.window
      if (!currentWindow || currentWindow.isDestroyed() || !currentWindow.isVisible()) {
        return
      }
      coreBoxManager.expand({ length: data })
    }
    else {
      coreBoxManager.shrink()
    }
  }

  private async requestInputValue(): Promise<string> {
    const coreBoxWindow = getCoreBoxWindow()
    if (!coreBoxWindow || coreBoxWindow.window.isDestroyed()) {
      throw new Error('CoreBox window not available')
    }

    if (this.transport) {
      const result = await this.transport.sendTo(
        coreBoxWindow.window.webContents,
        CoreBoxEvents.input.requestValue,
        undefined,
      )
      return result?.input || ''
    }

    const result = await this.touchApp.channel.sendToMain(
      coreBoxWindow.window,
      'core-box:request-input-value',
      {},
    )
    return result?.data?.input || result?.input || ''
  }

  private async setInputVisibility(visible: boolean): Promise<void> {
    const coreBoxWindow = getCoreBoxWindow()
    if (!coreBoxWindow || coreBoxWindow.window.isDestroyed()) {
      throw new Error('CoreBox window not available')
    }

    if (this.transport) {
      await this.transport.sendTo(
        coreBoxWindow.window.webContents,
        CoreBoxEvents.input.setVisibility,
        { visible },
      )
      return
    }

    await this.touchApp.channel.sendTo(
      coreBoxWindow.window,
      ChannelType.MAIN,
      'core-box:set-input-visibility',
      { visible },
    )
  }

  public static getInstance(): IpcManager {
    if (!IpcManager.instance) {
      IpcManager.instance = new IpcManager()
    }
    return IpcManager.instance
  }

  public register(): void {
    // Register for both MAIN and PLUGIN channel types to support calls from:
    // - Renderer process (MAIN)
    // - Plugin WebContentsView (PLUGIN)
    const registerCoreBoxVisibility = (type: ChannelType): void => {
      this.touchApp.channel.regChannel(type, 'core-box:hide', () =>
        coreBoxManager.trigger(false)
      )
      this.touchApp.channel.regChannel(type, 'core-box:show', () =>
        coreBoxManager.trigger(true)
      )
    }
    registerCoreBoxVisibility(ChannelType.MAIN)
    registerCoreBoxVisibility(ChannelType.PLUGIN)
    this.touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:focus-window', ({ reply }) => {
      const window = getCoreBoxWindow()
      if (window && !window.window.isDestroyed()) {
        window.window.focus()
      }
      reply(DataCode.SUCCESS, { focused: true })
    })
      this.touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:expand', ({ data }: any) => {
        this.handleExpandRequest(data as ExpandOptions | number)
      })
    this.touchApp.channel.regChannel(
      ChannelType.MAIN,
      'core-box:query',
      async ({ data, reply }) => {
        const { query } = data as { query: TuffQuery }
        // The search engine now manages its own activation state.
        const result = await coreBoxManager.search(query)
        reply(DataCode.SUCCESS, result)
      }
    )

    this.touchApp.channel.regChannel(
      ChannelType.MAIN,
      'core-box:deactivate-provider',
      async ({ data, reply }) => {
        const { id } = data as { id: string }

        // Clear BoxItemManager items for the deactivated plugin
        // The id format is "plugin-features:pluginName" for plugin providers
        if (id.startsWith('plugin-features:')) {
          const pluginName = id.substring('plugin-features:'.length)
          const boxItemManager = getBoxItemManager()
          boxItemManager.clear(pluginName)
        }

        searchEngineCore.deactivateProvider(id)
        reply(DataCode.SUCCESS, searchEngineCore.getActivationState())
      }
    )

    this.touchApp.channel.regChannel(
      ChannelType.MAIN,
      'core-box:deactivate-providers',
      async ({ reply }) => {
        // Clear all items from BoxItemManager
        const boxItemManager = getBoxItemManager()
        boxItemManager.clear()

        searchEngineCore.deactivateProviders()
        // Return the new, empty state for consistency
        reply(DataCode.SUCCESS, searchEngineCore.getActivationState())
      }
    )

    this.touchApp.channel.regChannel(
      ChannelType.MAIN,
      'core-box:get-provider-details',
      async ({ data, reply }) => {
        const { providerIds } = data as { providerIds: string[] }
        if (!providerIds || providerIds.length === 0) {
          return reply(DataCode.SUCCESS, [])
        }

        const nativeProviders = searchEngineCore.getProvidersByIds(providerIds)
        const nativeProviderDetails: ProviderDetail[] = nativeProviders.map((p) => ({
          id: p.id,
          name: p.name ?? p.id,
          icon: p.icon as any,
        }))

        const nativeProviderIds = new Set(nativeProviders.map((p) => p.id))
        const pluginIdsToFetch = providerIds.filter((id) => !nativeProviderIds.has(id))

        const pluginDetails: ProviderDetail[] = pluginIdsToFetch
          .map((id): ProviderDetail | null => {
            const plugin = pluginModule.pluginManager!.plugins.get(id)
            if (!plugin) {
              return null
            }
            return {
              id: plugin.name,
              name: plugin.name,
              icon: plugin.icon as any,
            }
          })
          .filter((p): p is ProviderDetail => p !== null)

        const allDetails = [...nativeProviderDetails, ...pluginDetails]
        reply(DataCode.SUCCESS, allDetails)
      }
    )

    this.touchApp.channel.regChannel(ChannelType.PLUGIN, 'core-box:enter-ui-mode', ({ data }) => {
      const { url } = data as { url: string }
      if (url) {
        coreBoxManager.enterUIMode(url)
      }
    })

    this.touchApp.channel.regChannel(ChannelType.PLUGIN, 'core-box:exit-ui-mode', () => {
      coreBoxManager.exitUIMode()
    })

    this.touchApp.channel.regChannel(ChannelType.PLUGIN, 'core-box:hide-input', ({ reply }) => {
      const coreBoxWindow = getCoreBoxWindow()
      if (!coreBoxWindow || coreBoxWindow.window.isDestroyed()) {
        reply(DataCode.ERROR, { error: 'CoreBox window not available' })
        return
      }

      this.touchApp.channel
        .sendTo(coreBoxWindow.window, ChannelType.MAIN, 'core-box:set-input-visibility', {
          visible: false
        })
        .then(() => {
          reply(DataCode.SUCCESS, { hidden: true })
        })
        .catch((error) => {
          reply(DataCode.ERROR, { error: error.message })
        })
    })

    this.touchApp.channel.regChannel(ChannelType.PLUGIN, 'core-box:show-input', ({ reply }) => {
      const coreBoxWindow = getCoreBoxWindow()
      if (!coreBoxWindow || coreBoxWindow.window.isDestroyed()) {
        reply(DataCode.ERROR, { error: 'CoreBox window not available' })
        return
      }

      this.touchApp.channel
        .sendTo(coreBoxWindow.window, ChannelType.MAIN, 'core-box:set-input-visibility', {
          visible: true
        })
        .then(() => {
          reply(DataCode.SUCCESS, { shown: true })
        })
        .catch((error) => {
          reply(DataCode.ERROR, { error: error.message })
        })
    })

    this.touchApp.channel.regChannel(
      ChannelType.PLUGIN,
      'core-box:get-input',
      async ({ reply }) => {
        try {
          const coreBoxWindow = getCoreBoxWindow()
          if (!coreBoxWindow || coreBoxWindow.window.isDestroyed()) {
            reply(DataCode.ERROR, { error: 'CoreBox window not available' })
            return
          }

          const result = await this.touchApp.channel.sendToMain(
            coreBoxWindow.window,
            'core-box:request-input-value',
            {}
          )
          reply(DataCode.SUCCESS, { input: result?.data?.input || result?.input || '' })
        } catch (error: any) {
          reply(DataCode.ERROR, { error: error.message })
        }
      }
    )

    this.touchApp.channel.regChannel(
      ChannelType.PLUGIN,
      'core-box:set-input',
      async ({ data, reply }) => {
        try {
          const value = typeof (data as any)?.value === 'string' ? (data as any).value : ''
          await this.sendInputValueToRenderer(value)
          reply(DataCode.SUCCESS, { value })
        } catch (error: any) {
          reply(DataCode.ERROR, { error: error.message })
        }
      }
    )

    this.touchApp.channel.regChannel(
      ChannelType.PLUGIN,
      'core-box:clear-input',
      async ({ reply }) => {
        try {
          await this.sendInputValueToRenderer('')
          reply(DataCode.SUCCESS, { cleared: true })
        } catch (error: any) {
          reply(DataCode.ERROR, { error: error.message })
        }
      }
    )

    const registerAllowInput = (type: ChannelType): void => {
      this.touchApp.channel.regChannel(type, 'core-box:allow-input', ({ reply }) => {
        try {
          windowManager.enableInputMonitoring()
          reply(DataCode.SUCCESS, { enabled: true })
        } catch (error: any) {
          reply(DataCode.ERROR, { error: error.message })
        }
      })
    }

    registerAllowInput(ChannelType.MAIN)
    registerAllowInput(ChannelType.PLUGIN)

    // Dynamic height control from frontend
    const registerSetHeight = (type: ChannelType): void => {
      this.touchApp.channel.regChannel(type, 'core-box:set-height', ({ data, reply }) => {
        try {
          const { height } = data as { height: number }
          if (typeof height !== 'number' || height < 60 || height > 650) {
            reply(DataCode.ERROR, { error: 'Invalid height (must be 60-650)' })
            return
          }

          // Mark as expanded without triggering window animation (avoids double animation)
          if (height > 60 && coreBoxManager.isCollapsed) {
            coreBoxManager.markExpanded()
          }

          windowManager.setHeight(height)
          reply(DataCode.SUCCESS, { height })
        } catch (error: any) {
          reply(DataCode.ERROR, { error: error.message })
        }
      })
    }

    registerSetHeight(ChannelType.MAIN)
    registerSetHeight(ChannelType.PLUGIN)

    // Get current window bounds
    const registerGetBounds = (type: ChannelType): void => {
      this.touchApp.channel.regChannel(type, 'core-box:get-bounds', ({ reply }) => {
        try {
          const win = windowManager.current?.window
          if (!win || win.isDestroyed()) {
            reply(DataCode.ERROR, { error: 'No window available' })
            return
          }
          const bounds = win.getBounds()
          reply(DataCode.SUCCESS, { bounds })
        } catch (error: any) {
          reply(DataCode.ERROR, { error: error.message })
        }
      })
    }

    registerGetBounds(ChannelType.MAIN)
    registerGetBounds(ChannelType.PLUGIN)

    // Set window position offset (relative to default position)
    const registerSetPositionOffset = (type: ChannelType): void => {
      this.touchApp.channel.regChannel(type, 'core-box:set-position-offset', ({ data, reply }) => {
        try {
          const { topPercent } = data as { topPercent?: number }
          if (typeof topPercent === 'number') {
            windowManager.setPositionOffset(topPercent)
          }
          reply(DataCode.SUCCESS, { topPercent })
        } catch (error: any) {
          reply(DataCode.ERROR, { error: error.message })
        }
      })
    }

    registerSetPositionOffset(ChannelType.MAIN)
    registerSetPositionOffset(ChannelType.PLUGIN)

    this.touchApp.channel.regChannel(
      ChannelType.PLUGIN,
      'core-box:allow-clipboard',
      ({ data, reply }) => {
        try {
          const { types } = data as { types: number }
          windowManager.enableClipboardMonitoring(types)
          reply(DataCode.SUCCESS, { enabled: true, types })
        } catch (error: any) {
          reply(DataCode.ERROR, { error: error.message })
        }
      }
    )

    coreBoxInputTransport.register()
    coreBoxKeyTransport.register()

    // BoxItem SDK sync channel
    this.touchApp.channel.regChannel(
      ChannelType.MAIN,
      BOX_ITEM_CHANNELS.SYNC,
      ({ reply }) => {
        const boxItemManager = getBoxItemManager()
        boxItemManager.handleSyncRequest()
        reply(DataCode.SUCCESS, {})
      }
    )

    this.touchApp.channel.regChannel(
      ChannelType.MAIN,
      'core-box:cancel-search',
      ({ data, reply }) => {
        const { searchId } = data as { searchId: string }
        if (searchId && searchEngineCore.getCurrentGatherController()) {
          searchEngineCore.cancelSearch(searchId)
          reply(DataCode.SUCCESS, { cancelled: true })
        } else {
          reply(DataCode.SUCCESS, { cancelled: false })
        }
      }
    )

    // ============================================================================
    // MetaOverlay IPC Handlers
    // ============================================================================

    // Show MetaOverlay
    this.touchApp.channel.regChannel(
      ChannelType.MAIN,
      MetaOverlayEvents.ui.show.toEventName(),
      ({ data, reply }) => {
        try {
          const request = data as MetaShowRequest
          metaOverlayIpcLog.info('ui.show received', {
            meta: {
              hasItem: Boolean(request.item),
              builtinActions: request.builtinActions?.length ?? 0,
              itemActions: request.itemActions?.length ?? 0
            }
          })
          // Get plugin actions
          const pluginActions = metaOverlayManager.getPluginActions()
          request.pluginActions = pluginActions
          metaOverlayManager.show(request)
          reply(DataCode.SUCCESS, {})
        } catch (error) {
          reply(DataCode.ERROR, { error: String(error) })
        }
      }
    )

    // Hide MetaOverlay
    this.touchApp.channel.regChannel(
      ChannelType.MAIN,
      MetaOverlayEvents.ui.hide.toEventName(),
      ({ reply }) => {
        try {
          metaOverlayIpcLog.info('ui.hide received')
          metaOverlayManager.hide()
          reply(DataCode.SUCCESS, {})
        } catch (error) {
          reply(DataCode.ERROR, { error: String(error) })
        }
      }
    )

    // Check visibility
    this.touchApp.channel.regChannel(
      ChannelType.MAIN,
      MetaOverlayEvents.ui.isVisible.toEventName(),
      ({ reply }) => {
        try {
          const visible = metaOverlayManager.getVisible()
          metaOverlayIpcLog.debug('ui.isVisible received', { meta: { visible } })
          reply(DataCode.SUCCESS, { visible })
        } catch (error) {
          reply(DataCode.ERROR, { error: String(error) })
        }
      }
    )

    // Execute action
    this.touchApp.channel.regChannel(
      ChannelType.MAIN,
      MetaOverlayEvents.action.execute.toEventName(),
      async ({ data, reply }) => {
        try {
          const request = data as MetaActionExecuteRequest & { item?: TuffItem }
          // Get item from request (passed from renderer) or lookup by ID
          const item = request.item
          if (!item) {
            // TODO: Lookup item by ID from BoxItemManager if needed
            reply(DataCode.ERROR, { error: 'Item not found', success: false })
            return
          }
          await metaOverlayManager.executeAction(request.actionId, item)
          reply(DataCode.SUCCESS, { success: true })
        } catch (error) {
          reply(DataCode.ERROR, { error: String(error), success: false })
        }
      }
    )

    // Register plugin action
    this.touchApp.channel.regChannel(
      ChannelType.MAIN,
      MetaOverlayEvents.action.register.toEventName(),
      ({ data, reply }) => {
        try {
          const { pluginId, action } = data as { pluginId: string; action: any }
          metaOverlayManager.registerPluginAction(pluginId, action)
          reply(DataCode.SUCCESS, {})
        } catch (error) {
          reply(DataCode.ERROR, { error: String(error) })
        }
      }
    )

    // Unregister plugin actions
    this.touchApp.channel.regChannel(
      ChannelType.MAIN,
      MetaOverlayEvents.action.unregister.toEventName(),
      ({ data, reply }) => {
        try {
          const { pluginId, actionId } = data as { pluginId: string; actionId?: string }
          if (actionId) {
            metaOverlayManager.unregisterPluginAction(pluginId, actionId)
          } else {
            metaOverlayManager.unregisterPluginActions(pluginId)
          }
          reply(DataCode.SUCCESS, {})
        } catch (error) {
          reply(DataCode.ERROR, { error: String(error) })
        }
      }
    )

    this.registerTransportHandlers()
  }

  public unregister(): void {
    // In a real scenario, we might want to unregister specific channels
    // For now, we don't have a clean way to do this with the current channel implementation
    for (const dispose of this.transportDisposers) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.transportDisposers = []
    this.transport = null
  }

  private registerTransportHandlers(): void {
    if (this.transport) {
      return
    }

    const channel = this.touchApp.channel as any
    this.transport = getTuffTransportMain(
      channel,
      channel?.keyManager ?? channel,
    )

    if (!this.transport) {
      return
    }

    const transport = this.transport

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.ui.show, () => {
        coreBoxManager.trigger(true)
      }),
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.ui.hide, () => {
        coreBoxManager.trigger(false)
      }),
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.ui.expand, (payload) => {
        this.handleExpandRequest(payload as ExpandOptions | number)
      }),
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.ui.focusWindow, () => {
        const window = getCoreBoxWindow()
        if (window && !window.window.isDestroyed()) {
          window.window.focus()
        }
        return { focused: true }
      }),
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.search.query, async ({ query }) => {
        return await coreBoxManager.search(query)
      }),
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.search.cancel, ({ searchId }) => {
        if (searchId && searchEngineCore.getCurrentGatherController()) {
          searchEngineCore.cancelSearch(searchId)
          return { cancelled: true }
        }
        return { cancelled: false }
      }),
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.input.get, async () => {
        const input = await this.requestInputValue()
        return { input }
      }),
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.input.set, async (request: SetInputRequest) => {
        const value = typeof request?.value === 'string' ? request.value : ''
        await this.sendInputValueToRenderer(value)
        return { value }
      }),
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.input.clear, async () => {
        await this.sendInputValueToRenderer('')
        return { cleared: true }
      }),
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.input.setVisibility, async (request: SetInputVisibilityRequest) => {
        await this.setInputVisibility(Boolean(request?.visible))
      }),
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.provider.deactivate, async (request: DeactivateProviderRequest) => {
        const { id } = request
        if (id?.startsWith('plugin-features:')) {
          const pluginName = id.substring('plugin-features:'.length)
          const boxItemManager = getBoxItemManager()
          boxItemManager.clear(pluginName)
        }

        searchEngineCore.deactivateProvider(id)
        const activeProviders = (searchEngineCore.getActivationState() ?? []).map((activation: any) => {
          if (activation?.id === 'plugin-features' && activation?.meta?.pluginName) {
            return `${activation.id}:${activation.meta.pluginName}`
          }
          return String(activation?.id ?? '')
        }).filter(Boolean)

        return { activeProviders } satisfies ActivationState
      }),
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.provider.deactivateAll, async () => {
        const boxItemManager = getBoxItemManager()
        boxItemManager.clear()
        searchEngineCore.deactivateProviders()
        return { activeProviders: [] } satisfies ActivationState
      }),
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.provider.getDetails, async (request: GetProviderDetailsRequest) => {
        const { providerIds } = request
        if (!providerIds || providerIds.length === 0) {
          return []
        }

        const nativeProviders = searchEngineCore.getProvidersByIds(providerIds)
        const nativeProviderDetails: ProviderDetail[] = nativeProviders.map((p) => ({
          id: p.id,
          name: p.name ?? p.id,
          icon: p.icon as any,
        }))

        const nativeProviderIds = new Set(nativeProviders.map((p) => p.id))
        const pluginIdsToFetch = providerIds.filter((id) => !nativeProviderIds.has(id))

        const pluginDetails: ProviderDetail[] = pluginIdsToFetch
          .map((id): ProviderDetail | null => {
            const plugin = pluginModule.pluginManager!.plugins.get(id)
            if (!plugin) return null
            return {
              id: plugin.name,
              name: plugin.name,
              icon: plugin.icon as any,
            }
          })
          .filter((p): p is ProviderDetail => p !== null)

        return [...nativeProviderDetails, ...pluginDetails]
      }),
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.uiMode.enter, (request: EnterUIModeRequest) => {
        const { url } = request
        if (url) {
          coreBoxManager.enterUIMode(url)
        }
      }),
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.uiMode.exit, () => {
        coreBoxManager.exitUIMode()
      }),
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.clipboard.allow, (request: AllowClipboardRequest) => {
        const types = request?.types ?? 0
        windowManager.enableClipboardMonitoring(types)
        return { enabled: true, types }
      }),
    )

    this.transportDisposers.push(
      transport.on(CoreBoxEvents.inputMonitoring.allow, () => {
        windowManager.enableInputMonitoring()
        return { enabled: true }
      }),
    )
  }
}

export const ipcManager = IpcManager.getInstance()
