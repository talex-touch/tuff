import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { genTouchApp, TouchApp } from '../../../core/touch-core'
import { coreBoxManager } from './manager'
import { TuffItem, TuffQuery } from '@talex-touch/utils/core-box/tuff/tuff-dsl'
import { windowManager } from './window'

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
      'core-box:start-search',
      async ({ data }) => {
        const { query, searchId } = data as { query: TuffQuery; searchId: string }
        coreBoxManager.startSearch(query, searchId)
      }
    )

    this.touchApp.channel.regChannel(
      ChannelType.MAIN,
      'core-box:query',
      async ({ data, reply }) => {
        const { query } = data as { query: TuffQuery }
        const result = await coreBoxManager.search(query)
        reply(DataCode.SUCCESS, result)
      }
    )

    this.touchApp.channel.regChannel(
      ChannelType.MAIN,
      'core-box:execute',
      async ({ data, reply }) => {
        const { item } = data as { item: TuffItem }
        const result = await coreBoxManager.execute(item)
        reply(DataCode.SUCCESS, result)
      }
    )
  }

  public unregister(): void {
    // In a real scenario, we might want to unregister specific channels
    // For now, we don't have a clean way to do this with the current channel implementation
  }

  public pushItems(searchId: string, items: TuffItem[]): void {
    const window = windowManager.current
    if (window) {
      this.touchApp.channel.sendTo(window.window, ChannelType.MAIN, 'core-box:push-items', {
        searchId,
        items
      })
    }
  }

  public notifySearchEnd(searchId: string): void {
    const window = windowManager.current
    if (window) {
      this.touchApp.channel.sendTo(window.window, ChannelType.MAIN, 'core-box:search-end', {
        searchId
      })
    }
  }
}

export const ipcManager = IpcManager.getInstance()
