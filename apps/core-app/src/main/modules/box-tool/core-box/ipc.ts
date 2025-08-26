import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { genTouchApp, TouchApp } from '../../../core/touch-core'
import { coreBoxManager } from './manager'
import searchEngineCore from '../search-engine/search-core'
import { TuffItem, TuffQuery, TuffSearchResult } from '@talex-touch/utils/core-box/tuff/tuff-dsl'
import { windowManager } from './window'
import { genPluginManager } from '../../../plugins'

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
    this.touchApp.channel.regChannel(
      ChannelType.MAIN,
      'file:extract-icon',
      async ({ data, reply }) => {
        try {
          const { path } = data as { path: string }
          const fileIcon = (await import('extract-file-icon')).default
          if (typeof fileIcon !== 'function') {
            return
          }

          const buffer = fileIcon(path, 32)
          reply(DataCode.SUCCESS, {
            buffer
          })
        } catch (error) {
          console.log('Cannot find target file icon:', data.path, error)
        }
      }
    )

    this.touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:hide', () =>
      coreBoxManager.trigger(false)
    )
    this.touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:expand', ({ data }: any) =>
      data ? coreBoxManager.expand(data) : coreBoxManager.shrink()
    )
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
        searchEngineCore.deactivateProvider(id)
        reply(DataCode.SUCCESS, searchEngineCore.getActivationState())
      }
    )

    this.touchApp.channel.regChannel(
      ChannelType.MAIN,
      'core-box:deactivate-providers',
      async ({ reply }) => {
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

        const pluginManager = genPluginManager()
        const pluginDetails = pluginIdsToFetch
          .map((id) => {
            const plugin = pluginManager.plugins.get(id)
            if (!plugin) return null
            return {
              id: plugin.name, // The plugin's name is its unique ID
              name: plugin.name,
              icon: plugin.icon
            }
          })
          .filter((p): p is { id: string; name: string; icon: any } => !!p)

        const allDetails = [...nativeProviderDetails, ...pluginDetails]
        reply(DataCode.SUCCESS, allDetails)
      }
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
  }

  public unregister(): void {
    // In a real scenario, we might want to unregister specific channels
    // For now, we don't have a clean way to do this with the current channel implementation
  }
}

export const ipcManager = IpcManager.getInstance()
