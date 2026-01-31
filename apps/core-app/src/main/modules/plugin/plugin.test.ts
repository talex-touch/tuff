import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IPluginFeature } from '@talex-touch/utils/plugin'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { NotificationEvents } from '@talex-touch/utils/transport/events'

vi.mock('@talex-touch/utils/plugin/node', () => {
  class PluginLogger {
    warn = vi.fn()
    info = vi.fn()
    debug = vi.fn()
    error = vi.fn()
  }

  class PluginLoggerManager {
    constructor() {}
  }

  return { PluginLogger, PluginLoggerManager }
})

vi.mock('electron', () => ({
  __esModule: true,
  app: { commandLine: { appendSwitch: vi.fn() } },
  clipboard: {},
  dialog: {},
  shell: {},
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
    on: vi.fn()
  },
  MessageChannelMain: class MessageChannelMain {
    port1 = {
      on: vi.fn(),
      postMessage: vi.fn(),
      start: vi.fn(),
      close: vi.fn()
    }

    port2 = {
      on: vi.fn(),
      postMessage: vi.fn(),
      start: vi.fn(),
      close: vi.fn()
    }
  }
}))

vi.mock('talex-mica-electron', () => ({
  IS_WINDOWS_11: false,
  WIN10: false,
  MicaBrowserWindow: class MicaBrowserWindow {},
  useMicaElectron: vi.fn()
}))

vi.mock('@sentry/electron/main', () => {
  const scope = {
    setTag: vi.fn(),
    setLevel: vi.fn(),
    setContext: vi.fn()
  }

  return {
    __esModule: true,
    init: vi.fn(),
    setContext: vi.fn(),
    setUser: vi.fn(),
    setTag: vi.fn(),
    withScope: (callback: (s: typeof scope) => void) => callback(scope),
    captureMessage: vi.fn(),
    captureException: vi.fn()
  }
})

vi.mock('../../core', () => ({
  genTouchApp: () => ({
    channel: {},
    window: { window: { id: 1 } }
  })
}))

vi.mock('../box-tool/core-box/manager', () => ({
  CoreBoxManager: {
    getInstance: () => ({
      exitUIMode: vi.fn()
    })
  }
}))

vi.mock('../box-tool/core-box/view-cache', () => ({
  viewCacheManager: {
    releasePlugin: vi.fn()
  }
}))

vi.mock('../box-tool/item-sdk', () => ({
  getBoxItemManager: () => ({
    clear: vi.fn()
  })
}))

vi.mock('../box-tool/core-box', () => ({
  getCoreBoxWindow: vi.fn()
}))

vi.mock('./widget/widget-manager', () => ({
  widgetManager: {
    registerWidget: vi.fn()
  }
}))

import { TouchPlugin } from './plugin'
import { getCoreBoxWindow } from '../box-tool/core-box'
import { widgetManager } from './widget/widget-manager'

describe('TouchPlugin.triggerFeature', () => {
  afterEach(() => {
    TouchPlugin.setTransport(null)
    vi.restoreAllMocks()
  })

  it('notifies CoreBox when widget registration fails', async () => {
    const coreBoxWindow = {
      window: {
        id: 1,
        isDestroyed: () => false
      }
    }
    vi.mocked(getCoreBoxWindow).mockReturnValue(coreBoxWindow as any)
    vi.mocked(widgetManager.registerWidget).mockResolvedValue(null)

    const transport = {
      sendToWindow: vi.fn().mockResolvedValue(undefined),
      keyManager: {
        requestKey: vi.fn(),
        revokeKey: vi.fn()
      }
    } as unknown as ITuffTransportMain

    TouchPlugin.setTransport(transport)

    const plugin = new TouchPlugin(
      'test-plugin',
      { type: 'class', value: 'i-ri-test-tube-line' },
      '1.0.0',
      'desc',
      '',
      { enable: true, address: 'http://localhost' },
      '/tmp',
      {},
      { skipDataInit: true }
    )

    const feature = {
      id: 'test-feature',
      name: 'Test Feature',
      desc: '',
      interaction: { type: 'widget', path: '/widget.vue' }
    } as IPluginFeature

    const result = await plugin.triggerFeature(feature, '')

    expect(result).toBe(false)
    expect(transport.sendToWindow).toHaveBeenCalledWith(
      1,
      NotificationEvents.push.notify,
      expect.objectContaining({
        id: expect.any(String),
        request: expect.objectContaining({
          channel: 'app',
          level: 'error',
          message: '哇 corebox 你这里是不是有点问题捏'
        })
      })
    )
  })
})
