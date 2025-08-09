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
  private touchApp: TouchApp = genTouchApp()

  private constructor() {
    //
  }

  public static getInstance(): IpcManager {
    if (!IpcManager.instance) {
      IpcManager.instance = new IpcManager()
    }
    return IpcManager.instance
  }

  public register() {
    this.touchApp.channel.regChannel(ChannelType.MAIN, 'file:extract-icon', async ({ data, reply }) => {
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
    })

    this.touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:hide', () => coreBoxManager.trigger(false))
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
  }

  public unregister() {
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