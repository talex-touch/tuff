import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IPluginFeature } from '@talex-touch/utils/plugin'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { NotificationEvents, PluginEvents } from '@talex-touch/utils/transport/events'
import fse from 'fs-extra'

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
  app: { commandLine: { appendSwitch: vi.fn() }, getLocale: vi.fn(() => 'zh-CN') },
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

const boxItemManagerMock = vi.hoisted(() => ({
  clear: vi.fn(),
  upsert: vi.fn(),
  batchUpsert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getBySource: vi.fn(() => [])
}))

vi.mock('../box-tool/item-sdk', () => ({
  getBoxItemManager: () => boxItemManagerMock
}))

vi.mock('../box-tool/core-box', () => ({
  getCoreBoxWindow: vi.fn()
}))

vi.mock('./widget/widget-manager', () => ({
  widgetManager: {
    registerWidget: vi.fn()
  }
}))

import { PluginStatus } from '@talex-touch/utils/plugin'
import { TouchPlugin } from './plugin'
import { getCoreBoxWindow } from '../box-tool/core-box'
import { widgetManager } from './widget/widget-manager'

describe('TouchPlugin.triggerFeature', () => {
  afterEach(() => {
    TouchPlugin.setTransport(null)
    boxItemManagerMock.clear.mockClear()
    boxItemManagerMock.upsert.mockClear()
    boxItemManagerMock.batchUpsert.mockClear()
    boxItemManagerMock.update.mockClear()
    boxItemManagerMock.delete.mockClear()
    boxItemManagerMock.getBySource.mockClear()
    vi.restoreAllMocks()
  })

  it('blocks stale box item pushes after plugin is disabled', async () => {
    const transport = {
      broadcast: vi.fn(),
      invoke: vi.fn().mockResolvedValue({ level: 100, charging: true }),
      on: vi.fn(() => vi.fn()),
      keyManager: {
        requestKey: vi.fn(),
        revokeKey: vi.fn()
      },
      sendToPlugin: vi.fn().mockResolvedValue(undefined)
    } as unknown as ITuffTransportMain

    TouchPlugin.setTransport(transport)

    const plugin = new TouchPlugin(
      'test-plugin',
      { type: 'class', value: 'i-ri-test-tube-line' },
      '1.0.0',
      'desc',
      '',
      { enable: false, address: '' },
      '/tmp',
      {},
      { skipDataInit: true, runtime: { rootPath: '/tmp/root', mainWindowId: 1 } }
    )

    plugin.status = PluginStatus.ENABLED
    const boxItems = plugin.getFeatureUtil().boxItems

    await boxItems.pushItems([
      { id: 'before-disable', source: { type: 'plugin', id: 'custom', name: 'custom' } } as any
    ])
    expect(boxItemManagerMock.batchUpsert).toHaveBeenCalledTimes(1)

    plugin.status = PluginStatus.DISABLED
    await boxItems.pushItems([
      { id: 'after-disable', source: { type: 'plugin', id: 'custom', name: 'custom' } } as any
    ])

    expect(boxItemManagerMock.batchUpsert).toHaveBeenCalledTimes(1)
  })

  it('notifies CoreBox when widget registration fails', async () => {
    const coreBoxWindow = {
      window: {
        id: 1,
        isDestroyed: () => false
      }
    }
    vi.mocked(getCoreBoxWindow).mockReturnValue(
      coreBoxWindow as unknown as ReturnType<typeof getCoreBoxWindow>
    )
    vi.mocked(widgetManager.registerWidget).mockResolvedValue(null)

    const transport = {
      sendToWindow: vi.fn().mockResolvedValue(undefined),
      invoke: vi.fn().mockResolvedValue({ level: 100, charging: true }),
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

    const result = await plugin.triggerFeature(feature, { text: '', inputs: [] })

    expect(result).toBe(false)
    expect(transport.sendToWindow).toHaveBeenCalledWith(
      1,
      NotificationEvents.push.notify,
      expect.objectContaining({
        id: expect.any(String),
        request: expect.objectContaining({
          channel: 'app',
          level: 'error',
          title: 'Widget 加载失败',
          message: '插件 widget 初始化失败，请检查插件版本、路径和运行日志。'
        })
      })
    )
  })

  it('exposes plugin secret API through the injected feature util', async () => {
    const transport = {
      invoke: vi.fn().mockResolvedValue({ success: true }),
      on: vi.fn(() => vi.fn()),
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
      { skipDataInit: true, runtime: { rootPath: '/tmp/root', mainWindowId: 1 } }
    )

    await plugin.getFeatureUtil().plugin.secret.set('providers.baidu.secretKey', 'secret-value')

    expect(transport.invoke).toHaveBeenCalledWith(
      PluginEvents.storage.setSecret,
      {
        pluginName: 'test-plugin',
        key: 'providers.baidu.secretKey',
        value: 'secret-value'
      },
      {
        plugin: {
          name: 'test-plugin',
          uniqueKey: expect.any(String),
          verified: expect.any(Boolean)
        }
      }
    )
  })
})

describe('TouchPlugin.setRuntime', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ensures plugin data directories after deferred runtime injection', () => {
    const ensureDirSync = vi.spyOn(fse, 'ensureDirSync').mockImplementation(() => undefined)
    const rootPath = '/tmp/plugin-runtime-root'

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

    expect(ensureDirSync).not.toHaveBeenCalled()

    plugin.setRuntime({ rootPath, mainWindowId: 1 })

    expect(ensureDirSync).toHaveBeenCalledTimes(5)
    expect(ensureDirSync).toHaveBeenNthCalledWith(
      1,
      path.join(rootPath, 'modules', 'plugins', 'test-plugin', 'data')
    )
    expect(ensureDirSync).toHaveBeenNthCalledWith(
      2,
      path.join(rootPath, 'modules', 'plugins', 'test-plugin', 'data', 'config')
    )
    expect(ensureDirSync).toHaveBeenNthCalledWith(
      3,
      path.join(rootPath, 'modules', 'plugins', 'test-plugin', 'data', 'logs')
    )
    expect(ensureDirSync).toHaveBeenNthCalledWith(
      4,
      path.join(rootPath, 'modules', 'plugins', 'test-plugin', 'data', 'verify')
    )
    expect(ensureDirSync).toHaveBeenNthCalledWith(
      5,
      path.join(rootPath, 'modules', 'plugins', 'test-plugin', 'data', 'temp')
    )
  })
})

describe('TouchPlugin.enable', () => {
  afterEach(() => {
    TouchPlugin.setTransport(null)
    boxItemManagerMock.clear.mockClear()
    boxItemManagerMock.upsert.mockClear()
    boxItemManagerMock.batchUpsert.mockClear()
    boxItemManagerMock.update.mockClear()
    boxItemManagerMock.delete.mockClear()
    boxItemManagerMock.getBySource.mockClear()
    vi.restoreAllMocks()
  })

  it('refuses to enable plugins blocked by sdkapi hard-cut', async () => {
    const transport = {
      broadcast: vi.fn(),
      invoke: vi.fn().mockResolvedValue({ level: 100, charging: true }),
      keyManager: {
        requestKey: vi.fn(),
        revokeKey: vi.fn()
      },
      sendToPlugin: vi.fn().mockResolvedValue(undefined)
    } as unknown as ITuffTransportMain

    TouchPlugin.setTransport(transport)

    const plugin = new TouchPlugin(
      'test-plugin',
      { type: 'class', value: 'i-ri-test-tube-line' },
      '1.0.0',
      'desc',
      '',
      { enable: false, address: '' },
      '/tmp',
      {},
      { skipDataInit: true }
    )

    plugin.issues.push({
      type: 'error',
      code: 'SDKAPI_BLOCKED',
      message: 'sdk blocked'
    })

    await expect(plugin.enable()).resolves.toBe(false)
    expect(plugin.loadState).toBe('load_failed')
    expect(plugin.loadError).toEqual({
      code: 'SDKAPI_BLOCKED',
      message: 'sdk blocked'
    })
  })
})
