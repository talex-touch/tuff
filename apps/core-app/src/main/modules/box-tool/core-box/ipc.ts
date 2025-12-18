import type { TuffQuery } from '@talex-touch/utils/core-box/tuff/tuff-dsl'
import type { TouchApp } from '../../../core/touch-app'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { genTouchApp } from '../../../core'
import { pluginModule } from '../../plugin/plugin-module'
import searchEngineCore from '../search-engine/search-core'
import { coreBoxManager } from './manager'
import { coreBoxInputTransport } from './input-transport'
import { coreBoxKeyTransport } from './key-transport'
import { getCoreBoxWindow, windowManager } from './window'
import { BOX_ITEM_CHANNELS, getBoxItemManager } from '../item-sdk'

/**
 * @class IpcManager
 * @description
 * 集中处理所有与 CoreBox 相关的 IPC 通信。
 */
export class IpcManager {
  private static instance: IpcManager
  private _touchApp: TouchApp | null = null

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

    await this.touchApp.channel.sendTo(
      coreBoxWindow.window,
      ChannelType.MAIN,
      'core-box:set-query',
      { value }
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
      if (typeof data === 'object' && data) {
        if (data.mode === 'collapse') {
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

        if (data.mode === 'max') {
          coreBoxManager.expand({ forceMax: true })
          return
        }

        if (typeof data.length === 'number') {
          coreBoxManager.expand({ length: data.length })
          return
        }
      }

      if (typeof data === 'number' && data > 0) {
        const currentWindow = windowManager.current?.window
        if (!currentWindow || currentWindow.isDestroyed() || !currentWindow.isVisible()) {
          return
        }
        coreBoxManager.expand({ length: data })
      } else {
        coreBoxManager.shrink()
      }
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
        const nativeProviderDetails = nativeProviders.map((p) => ({
          id: p.id,
          name: p.name,
          icon: p.icon
        }))

        const nativeProviderIds = new Set(nativeProviders.map((p) => p.id))
        const pluginIdsToFetch = providerIds.filter((id) => !nativeProviderIds.has(id))

        const pluginDetails = pluginIdsToFetch
          .map((id) => {
            const plugin = pluginModule.pluginManager!.plugins.get(id)
            if (!plugin) return null
            return {
              id: plugin.name,
              name: plugin.name,
              icon: plugin.icon
            }
          })
          .filter((p): p is { id: string; name: string; icon: any } => !!p)

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

          if (coreBoxManager.isCollapsed && height > 60) {
            reply(DataCode.SUCCESS, { height: 60, ignored: true })
            return
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
  }

  public unregister(): void {
    // In a real scenario, we might want to unregister specific channels
    // For now, we don't have a clean way to do this with the current channel implementation
  }
}

export const ipcManager = IpcManager.getInstance()
