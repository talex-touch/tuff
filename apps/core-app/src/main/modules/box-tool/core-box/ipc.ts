import type { TuffQuery } from '@talex-touch/utils/core-box/tuff/tuff-dsl'
import type { TouchApp } from '../../../core/touch-app'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { genTouchApp } from '../../../core'
import { pluginModule } from '../../plugin/plugin-module'
import searchEngineCore from '../search-engine/search-core'
import { coreBoxManager } from './manager'
import { getCoreBoxWindow } from './window'

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

  public static getInstance(): IpcManager {
    if (!IpcManager.instance) {
      IpcManager.instance = new IpcManager()
    }
    return IpcManager.instance
  }

  public register(): void {


    this.touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:hide', () =>
      coreBoxManager.trigger(false))
    this.touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:show', () =>
      coreBoxManager.trigger(true))
    this.touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:expand', ({ data }: any) => {
      if (typeof data === 'object' && data) {
        if (data.mode === 'collapse') {
          coreBoxManager.shrink()
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
        coreBoxManager.expand({ length: data })
      }
      else {
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
      },
    )

    this.touchApp.channel.regChannel(
      ChannelType.MAIN,
      'core-box:deactivate-provider',
      async ({ data, reply }) => {
        const { id } = data as { id: string }
        searchEngineCore.deactivateProvider(id)
        reply(DataCode.SUCCESS, searchEngineCore.getActivationState())
      },
    )

    this.touchApp.channel.regChannel(
      ChannelType.MAIN,
      'core-box:deactivate-providers',
      async ({ reply }) => {
        searchEngineCore.deactivateProviders()
        // Return the new, empty state for consistency
        reply(DataCode.SUCCESS, searchEngineCore.getActivationState())
      },
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
        const nativeProviderDetails = nativeProviders.map(p => ({
          id: p.id,
          name: p.name,
          icon: p.icon,
        }))

        const nativeProviderIds = new Set(nativeProviders.map(p => p.id))
        const pluginIdsToFetch = providerIds.filter(id => !nativeProviderIds.has(id))

        const pluginDetails = pluginIdsToFetch
          .map((id) => {
            const plugin = pluginModule.pluginManager!.plugins.get(id)
            if (!plugin)
              return null
            return {
              id: plugin.name,
              name: plugin.name,
              icon: plugin.icon,
            }
          })
          .filter((p): p is { id: string, name: string, icon: any } => !!p)

        const allDetails = [...nativeProviderDetails, ...pluginDetails]
        reply(DataCode.SUCCESS, allDetails)
      },
    )

    this.touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:enter-ui-mode', ({ data }) => {
      const { url } = data as { url: string }
      if (url) {
        coreBoxManager.enterUIMode(url)
      }
    })

    this.touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:exit-ui-mode', () => {
      coreBoxManager.exitUIMode()
    })

    // 新增：隐藏输入框
    this.touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:hide-input', ({ reply }) => {
      const coreBoxWindow = getCoreBoxWindow()
      if (!coreBoxWindow || coreBoxWindow.window.isDestroyed()) {
        reply(DataCode.ERROR, { error: 'CoreBox window not available' })
        return
      }
      
      this.touchApp.channel.sendTo(
        coreBoxWindow.window,
        ChannelType.MAIN,
        'core-box:set-input-visibility',
        { visible: false }
      ).then(() => {
        reply(DataCode.SUCCESS, { hidden: true })
      }).catch((error) => {
        reply(DataCode.ERROR, { error: error.message })
      })
    })

    // 新增：显示输入框
    this.touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:show-input', ({ reply }) => {
      const coreBoxWindow = getCoreBoxWindow()
      if (!coreBoxWindow || coreBoxWindow.window.isDestroyed()) {
        reply(DataCode.ERROR, { error: 'CoreBox window not available' })
        return
      }
      
      this.touchApp.channel.sendTo(
        coreBoxWindow.window,
        ChannelType.MAIN,
        'core-box:set-input-visibility',
        { visible: true }
      ).then(() => {
        reply(DataCode.SUCCESS, { shown: true })
      }).catch((error) => {
        reply(DataCode.ERROR, { error: error.message })
      })
    })

    // 新增：获取当前输入
    this.touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:get-input', async ({ reply }) => {
      try {
        const coreBoxWindow = getCoreBoxWindow()
        if (!coreBoxWindow || coreBoxWindow.window.isDestroyed()) {
          reply(DataCode.ERROR, { error: 'CoreBox window not available' })
          return
        }
        
        const result = await this.touchApp.channel.sendTo(
          coreBoxWindow.window,
          ChannelType.MAIN,
          'core-box:request-input-value',
          {}
        )
        reply(DataCode.SUCCESS, { input: result?.data?.input || result?.input || '' })
      } catch (error: any) {
        reply(DataCode.ERROR, { error: error.message })
      }
    })

    // 新增：接收渲染进程的输入变化，广播给所有插件
    this.touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:input-changed', ({ data }) => {
      const { input } = data
      // 广播给所有插件
      if (!pluginModule.pluginManager) {
        return
      }
      
      pluginModule.pluginManager.plugins.forEach((plugin) => {
        // PluginStatus.ENABLED = 1
        if (plugin.status === 1) {
          this.touchApp.channel.sendPlugin(plugin.name, 'core-box:input-changed', { input }).catch((error) => {
            console.error(`[CoreBox IPC] Failed to broadcast input change to plugin ${plugin.name}:`, error)
          })
        }
      })
    })

    this.touchApp.channel.regChannel(
      ChannelType.MAIN,
      'core-box:cancel-search',
      ({ data, reply }) => {
        const { searchId } = data as { searchId: string }
        if (searchId && searchEngineCore.getCurrentGatherController()) {
          console.debug(`[CoreBox] Canceling search with ID: ${searchId}`)
          searchEngineCore.cancelSearch(searchId)
          reply(DataCode.SUCCESS, { cancelled: true })
        }
        else {
          reply(DataCode.SUCCESS, { cancelled: false })
        }
      },
    )
  }

  public unregister(): void {
    // In a real scenario, we might want to unregister specific channels
    // For now, we don't have a clean way to do this with the current channel implementation
  }
}

export const ipcManager = IpcManager.getInstance()
