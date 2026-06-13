import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TuffItem } from '@talex-touch/utils'
import type { IPluginFeature } from '@talex-touch/utils/plugin'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { NotificationEvents, PluginEvents } from '@talex-touch/utils/transport/events'
import { intelligenceApiEvents } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import fse from 'fs-extra'

const permissionModuleMock = vi.hoisted(() => ({
  checkPermission: vi.fn<
    (
      pluginId: string,
      apiName: string,
      sdkapi?: number
    ) => { allowed: boolean; permissionId: string; pluginId: string; reason?: string }
  >(() => ({
    allowed: true,
    permissionId: 'search.root-results',
    pluginId: 'test-plugin'
  }))
}))

const appSettingsMock = vi.hoisted(() => ({
  value: {} as Record<string, unknown>
}))

vi.mock('../permission', () => ({
  getPermissionModule: () => permissionModuleMock
}))

vi.mock('../storage', () => ({
  getMainConfig: vi.fn(() => appSettingsMock.value),
  isMainStorageReady: vi.fn(() => true),
  saveMainConfig: vi.fn(),
  subscribeMainConfig: vi.fn(() => vi.fn())
}))

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
  get: vi.fn(),
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

function clearBoxItemMocks(): void {
  boxItemManagerMock.clear.mockClear()
  boxItemManagerMock.upsert.mockClear()
  boxItemManagerMock.batchUpsert.mockClear()
  boxItemManagerMock.update.mockClear()
  boxItemManagerMock.delete.mockClear()
  boxItemManagerMock.get.mockClear()
  boxItemManagerMock.get.mockReturnValue(undefined)
  boxItemManagerMock.getBySource.mockClear()
  permissionModuleMock.checkPermission.mockReset()
  permissionModuleMock.checkPermission.mockReturnValue({
    allowed: true,
    permissionId: 'search.root-results',
    pluginId: 'test-plugin'
  })
  appSettingsMock.value = {}
}

describe('TouchPlugin.triggerFeature', () => {
  afterEach(() => {
    TouchPlugin.setTransport(null)
    clearBoxItemMocks()
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
      {
        id: 'before-disable',
        source: { type: 'plugin', id: 'custom', name: 'custom' },
        render: { mode: 'default' }
      } satisfies TuffItem
    ])
    expect(boxItemManagerMock.batchUpsert).toHaveBeenCalledTimes(1)

    plugin.status = PluginStatus.DISABLED
    await boxItems.pushItems([
      {
        id: 'after-disable',
        source: { type: 'plugin', id: 'custom', name: 'custom' },
        render: { mode: 'default' }
      } satisfies TuffItem
    ])

    expect(boxItemManagerMock.batchUpsert).toHaveBeenCalledTimes(1)
  })

  it('blocks root result pushes without search.root-results permission', async () => {
    permissionModuleMock.checkPermission.mockReturnValue({
      allowed: false,
      permissionId: 'search.root-results',
      pluginId: 'test-plugin',
      reason: "Permission 'search.root-results' is not declared in plugin manifest"
    })

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

    await plugin.getFeatureUtil().boxItems.pushItems([
      {
        id: 'blocked-root-result',
        source: { type: 'plugin', id: 'custom', name: 'custom' },
        render: { mode: 'default' }
      } satisfies TuffItem
    ])

    expect(permissionModuleMock.checkPermission).toHaveBeenCalledWith(
      'test-plugin',
      'search:root-results:push',
      undefined
    )
    expect(boxItemManagerMock.batchUpsert).not.toHaveBeenCalled()
  })

  it('blocks root result pushes when the plugin search provider is disabled by settings', async () => {
    appSettingsMock.value = {
      searchProviders: {
        providers: [{ providerId: 'test-plugin.root-results', enabled: false, order: 10 }]
      }
    }

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
    plugin.searchProviders = [
      {
        id: 'test-plugin.root-results',
        displayName: 'Test Plugin Results',
        kind: 'plugin',
        owner: 'third-party-plugin',
        mode: 'push',
        priority: 'fast',
        defaultOrder: 100,
        policy: {
          owner: 'third-party-plugin',
          mode: 'push',
          permissionScopes: ['root-results'],
          defaultState: 'ask',
          requiresUserConsent: true,
          pushesToRootResults: true
        }
      }
    ]
    plugin.status = PluginStatus.ENABLED

    const boxItems = plugin.getFeatureUtil().boxItems
    await boxItems.pushItems([
      {
        id: 'blocked-disabled-provider',
        source: { type: 'plugin', id: 'custom', name: 'custom' },
        render: { mode: 'default' }
      } satisfies TuffItem
    ])
    boxItems.update('blocked-disabled-provider', { meta: { updated: true } } as Partial<TuffItem>)
    boxItems.remove('blocked-disabled-provider')
    boxItems.clear()

    expect(permissionModuleMock.checkPermission).toHaveBeenCalled()
    expect(boxItemManagerMock.batchUpsert).not.toHaveBeenCalled()
    expect(boxItemManagerMock.update).not.toHaveBeenCalled()
    expect(boxItemManagerMock.delete).toHaveBeenCalledWith('blocked-disabled-provider')
    expect(boxItemManagerMock.clear).toHaveBeenCalledWith('test-plugin')
  })

  it('blocks root result pushes for ask-state plugin providers until explicitly enabled', async () => {
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
    plugin.searchProviders = [
      {
        id: 'test-plugin.root-results',
        displayName: 'Test Plugin Results',
        kind: 'plugin',
        owner: 'third-party-plugin',
        mode: 'push',
        priority: 'fast',
        defaultOrder: 100,
        policy: {
          owner: 'third-party-plugin',
          mode: 'push',
          permissionScopes: ['root-results'],
          defaultState: 'ask',
          requiresUserConsent: true,
          pushesToRootResults: true
        }
      }
    ]
    plugin.status = PluginStatus.ENABLED

    await plugin.getFeatureUtil().boxItems.push({
      id: 'blocked-ask-provider',
      source: { type: 'plugin', id: 'custom', name: 'custom' },
      render: { mode: 'default' }
    } satisfies TuffItem)

    expect(permissionModuleMock.checkPermission).toHaveBeenCalled()
    expect(boxItemManagerMock.upsert).not.toHaveBeenCalled()
  })

  it('tags pushed root result items with the plugin search provider id', async () => {
    appSettingsMock.value = {
      searchProviders: {
        providers: [{ providerId: 'test-plugin.root-results', enabled: true, order: 10 }]
      }
    }

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
    plugin.searchProviders = [
      {
        id: 'test-plugin.root-results',
        displayName: 'Test Plugin Results',
        kind: 'plugin',
        owner: 'third-party-plugin',
        mode: 'push',
        priority: 'fast',
        defaultOrder: 100,
        policy: {
          owner: 'third-party-plugin',
          mode: 'push',
          permissionScopes: ['root-results'],
          defaultState: 'ask',
          requiresUserConsent: true,
          pushesToRootResults: true
        }
      }
    ]
    plugin.status = PluginStatus.ENABLED

    await plugin.getFeatureUtil().boxItems.push({
      id: 'tagged-provider-item',
      source: { type: 'plugin', id: 'custom', name: 'custom' },
      render: { mode: 'default' }
    } satisfies TuffItem)

    expect(boxItemManagerMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tagged-provider-item',
        meta: expect.objectContaining({
          pluginName: 'test-plugin',
          searchProviderId: 'test-plugin.root-results'
        })
      })
    )
  })

  it('routes multi-provider push items by feature id and filters only disabled providers', async () => {
    appSettingsMock.value = {
      searchProviders: {
        providers: [
          { providerId: 'test-plugin.search', enabled: true, order: 10 },
          { providerId: 'test-plugin.manage', enabled: false, order: 20 }
        ]
      }
    }

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
    plugin.searchProviders = [
      {
        id: 'test-plugin.search',
        displayName: 'Search',
        featureId: 'search',
        kind: 'plugin',
        owner: 'third-party-plugin',
        mode: 'push',
        priority: 'fast',
        defaultOrder: 100,
        policy: {
          owner: 'third-party-plugin',
          mode: 'push',
          permissionScopes: ['root-results'],
          defaultState: 'ask',
          requiresUserConsent: true,
          pushesToRootResults: true
        }
      },
      {
        id: 'test-plugin.manage',
        displayName: 'Manage',
        featureId: 'manage',
        kind: 'plugin',
        owner: 'third-party-plugin',
        mode: 'push',
        priority: 'fast',
        defaultOrder: 101,
        policy: {
          owner: 'third-party-plugin',
          mode: 'push',
          permissionScopes: ['root-results'],
          defaultState: 'ask',
          requiresUserConsent: true,
          pushesToRootResults: true
        }
      }
    ]
    plugin.status = PluginStatus.ENABLED

    await plugin.getFeatureUtil().boxItems.pushItems([
      {
        id: 'visible-search-item',
        source: { type: 'plugin', id: 'custom', name: 'custom' },
        meta: { featureId: 'search' },
        render: { mode: 'default' }
      } satisfies TuffItem,
      {
        id: 'hidden-manage-item',
        source: { type: 'plugin', id: 'custom', name: 'custom' },
        meta: { featureId: 'manage' },
        render: { mode: 'default' }
      } satisfies TuffItem
    ])

    expect(boxItemManagerMock.batchUpsert).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'visible-search-item',
        meta: expect.objectContaining({
          featureId: 'search',
          searchProviderId: 'test-plugin.search'
        })
      })
    ])
  })

  it('allows updates for existing items from enabled providers in multi-provider plugins', () => {
    appSettingsMock.value = {
      searchProviders: {
        providers: [
          { providerId: 'test-plugin.search', enabled: true, order: 10 },
          { providerId: 'test-plugin.manage', enabled: false, order: 20 }
        ]
      }
    }

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
    plugin.searchProviders = [
      {
        id: 'test-plugin.search',
        displayName: 'Search',
        featureId: 'search',
        kind: 'plugin',
        owner: 'third-party-plugin',
        mode: 'push',
        priority: 'fast',
        defaultOrder: 100,
        policy: {
          owner: 'third-party-plugin',
          mode: 'push',
          permissionScopes: ['root-results'],
          defaultState: 'ask',
          requiresUserConsent: true,
          pushesToRootResults: true
        }
      },
      {
        id: 'test-plugin.manage',
        displayName: 'Manage',
        featureId: 'manage',
        kind: 'plugin',
        owner: 'third-party-plugin',
        mode: 'push',
        priority: 'fast',
        defaultOrder: 101,
        policy: {
          owner: 'third-party-plugin',
          mode: 'push',
          permissionScopes: ['root-results'],
          defaultState: 'ask',
          requiresUserConsent: true,
          pushesToRootResults: true
        }
      }
    ]
    plugin.status = PluginStatus.ENABLED

    boxItemManagerMock.get.mockReturnValue({
      id: 'existing-search-item',
      source: { type: 'plugin', id: 'custom', name: 'custom' },
      meta: {
        featureId: 'search',
        searchProviderId: 'test-plugin.search'
      },
      render: { mode: 'default' }
    } satisfies TuffItem)

    plugin.getFeatureUtil().boxItems.update('existing-search-item', {
      meta: { updated: true }
    } as Partial<TuffItem>)

    expect(boxItemManagerMock.update).toHaveBeenCalledWith('existing-search-item', {
      meta: { updated: true }
    })
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

  it('converts widget registration throws into a feature failure', async () => {
    vi.mocked(getCoreBoxWindow).mockReturnValue(undefined)
    vi.mocked(widgetManager.registerWidget).mockRejectedValue(new Error('missing widget bundle'))

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

    await expect(plugin.triggerFeature(feature, { text: '', inputs: [] })).resolves.toBe(false)
    expect(plugin.issues.at(-1)).toMatchObject({
      code: 'RUNTIME_ERROR',
      source: 'runtime:registerWidget'
    })
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
    await plugin.getFeatureUtil().plugin.secret.health()

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
    expect(transport.invoke).toHaveBeenCalledWith(PluginEvents.storage.getSecretHealth, undefined, {
      plugin: {
        name: 'test-plugin',
        uniqueKey: expect.any(String),
        verified: expect.any(Boolean)
      }
    })
  })

  it('exposes intelligence SDK with the current plugin sdkapi marker', async () => {
    const transport = {
      invoke: vi.fn().mockResolvedValue({
        ok: true,
        result: { result: 'pong' }
      }),
      on: vi.fn(() => vi.fn()),
      keyManager: {
        requestKey: vi.fn(),
        revokeKey: vi.fn()
      }
    } as unknown as ITuffTransportMain

    TouchPlugin.setTransport(transport)

    const plugin = new TouchPlugin(
      'touch-intelligence',
      { type: 'class', value: 'i-ri-test-tube-line' },
      '1.0.2',
      'desc',
      '',
      { enable: true, address: 'http://localhost' },
      '/tmp',
      {},
      { skipDataInit: true, runtime: { rootPath: '/tmp/root', mainWindowId: 1 } }
    )
    plugin.sdkapi = 260615
    const featureUtil = plugin.getFeatureUtil()

    await expect(featureUtil.intelligence.invoke('text.chat', { messages: [] })).resolves.toEqual({
      result: 'pong'
    })
    expect(featureUtil.plugin.intelligence).toBe(featureUtil.intelligence)

    const [event, payload, context] = vi.mocked(transport.invoke).mock.calls[0]
    expect(event.toEventName()).toBe(intelligenceApiEvents.invoke.toEventName())
    expect(payload).toEqual({
      capabilityId: 'text.chat',
      payload: { messages: [] },
      options: undefined,
      _sdkapi: 260615
    })
    expect(context).toEqual({
      plugin: {
        name: 'touch-intelligence',
        uniqueKey: '',
        verified: false
      }
    })
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
    clearBoxItemMocks()
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
