import type { TuffItem } from '@talex-touch/utils'
import type { IPluginFeature } from '@talex-touch/utils/plugin'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import path from 'node:path'
import { PluginStatus, SdkApi } from '@talex-touch/utils/plugin'
import {
  AppEvents,
  ClipboardEvents,
  FlowEvents,
  NativeEvents,
  PluginEvents,
  QuickOpsEvents
} from '@talex-touch/utils/transport/events'
import { intelligenceApiEvents } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import fse from 'fs-extra'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TuffIconImpl } from '../../core/tuff-icon'
import { getCoreBoxWindow } from '../box-tool/core-box'
import { TouchPlugin } from './plugin'
import { widgetManager } from './widget/widget-manager'

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

const notificationModuleMock = vi.hoisted(() => ({
  showInternalSystemNotification: vi.fn(() => ({ id: 'notification-id' }))
}))

vi.mock('../permission', () => ({
  getPermissionModule: () => permissionModuleMock
}))

vi.mock('../notification', () => ({
  notificationModule: notificationModuleMock
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
  notificationModuleMock.showInternalSystemNotification.mockClear()
  notificationModuleMock.showInternalSystemNotification.mockReturnValue({ id: 'notification-id' })
  appSettingsMock.value = {}
}

describe('touchPlugin.triggerFeature', () => {
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

  it('delivers active feature item changes despite a disabled root results provider', async () => {
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

    const feature = plugin.getFeatureUtil().plugin.feature
    feature.pushItems([
      {
        id: 'active-feature-item',
        source: { type: 'plugin', id: 'custom', name: 'custom' },
        render: { mode: 'default' }
      } satisfies TuffItem
    ])
    await Promise.resolve()
    await Promise.resolve()

    feature.updateItem('active-feature-item', {
      meta: { updated: true }
    } as Partial<TuffItem>)

    expect(boxItemManagerMock.batchUpsert).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'active-feature-item',
        meta: expect.not.objectContaining({ searchProviderId: expect.any(String) })
      })
    ])
    expect(boxItemManagerMock.update).toHaveBeenCalledWith('active-feature-item', {
      meta: { updated: true }
    })
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

  it('preserves explicit color and colorful icon intent on pushed root result items', async () => {
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
      id: 'colorful-provider-item',
      source: { type: 'plugin', id: 'custom', name: 'custom' },
      render: {
        mode: 'default',
        basic: {
          title: 'Colorful item',
          icon: {
            type: 'url',
            value: 'https://example.test/logo.svg',
            color: '#22c55e',
            colorful: true
          }
        }
      }
    } satisfies TuffItem)

    expect(boxItemManagerMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        render: expect.objectContaining({
          basic: expect.objectContaining({
            icon: expect.objectContaining({ color: '#22c55e', colorful: true })
          })
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

  it('notifies system only when widget registration fails', async () => {
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
    expect(notificationModuleMock.showInternalSystemNotification).toHaveBeenCalledWith({
      id: 'plugin-widget-load-failed:test-plugin:test-feature',
      title: 'Widget 加载失败',
      message: '插件 widget 初始化失败，请检查插件版本、路径和运行日志。',
      level: 'error',
      dedupeKey: 'plugin-widget-load-failed:test-plugin:test-feature',
      meta: {
        pluginName: 'test-plugin',
        featureId: 'test-feature',
        kind: 'plugin.widgetLoadFailed'
      },
      system: { silent: false }
    })
    expect(transport.sendToWindow).not.toHaveBeenCalled()
  })

  it('registers a shared widget renderer before invoking the dynamic feature lifecycle', async () => {
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
    const sharedWidget = {
      id: 'shared-widget',
      name: 'Shared Widget',
      desc: '',
      icon: { type: 'class', value: 'i-ri-layout-2-line' },
      push: false,
      platform: 'all',
      commands: [{ type: 'over', value: ['shared'] }],
      interaction: { type: 'widget', path: '/widgets/shared.vue' }
    } as IPluginFeature
    const dynamicFeature = {
      id: 'dynamic-command',
      name: 'Dynamic Command',
      desc: '',
      icon: { type: 'class', value: 'i-ri-magic-line' },
      push: false,
      platform: 'all',
      commands: [{ type: 'over', value: ['dynamic'] }],
      interaction: {
        type: 'widget',
        rendererFeatureId: 'shared-widget'
      }
    } as IPluginFeature
    const onFeatureTriggered = vi.fn(() => true)
    const query = { text: 'summarize this', inputs: [] }

    expect(plugin.addFeature(sharedWidget)).toBe(true)
    expect(plugin.addFeature(dynamicFeature)).toBe(true)
    const registeredSharedWidget = plugin.getFeature('shared-widget')!
    const registeredDynamicFeature = plugin.getFeature('dynamic-command')!
    plugin.pluginLifecycle = { onFeatureTriggered }
    vi.mocked(widgetManager.registerWidget).mockReset()
    vi.mocked(widgetManager.registerWidget).mockResolvedValue({
      widgetId: 'test-plugin::shared-widget',
      filePath: '/tmp/widgets/shared.vue'
    } as never)

    await expect(plugin.triggerFeature(registeredDynamicFeature, query)).resolves.toBe(true)

    expect(widgetManager.registerWidget).toHaveBeenCalledWith(plugin, registeredSharedWidget)
    expect(onFeatureTriggered).toHaveBeenCalledWith(
      'dynamic-command',
      query,
      registeredDynamicFeature,
      expect.any(AbortSignal)
    )
  })

  it('fails closed when a dynamic widget renderer target is missing', async () => {
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
    const dynamicFeature = {
      id: 'dynamic-command',
      name: 'Dynamic Command',
      desc: '',
      icon: { type: 'class', value: 'i-ri-magic-line' },
      push: false,
      platform: 'all',
      commands: [{ type: 'over', value: ['dynamic'] }],
      interaction: {
        type: 'widget',
        rendererFeatureId: 'missing-widget'
      }
    } as IPluginFeature
    const onFeatureTriggered = vi.fn(() => true)

    expect(plugin.addFeature(dynamicFeature)).toBe(true)
    plugin.pluginLifecycle = { onFeatureTriggered }
    vi.mocked(widgetManager.registerWidget).mockReset()

    await expect(
      plugin.triggerFeature(plugin.getFeature('dynamic-command')!, {
        text: 'summarize this',
        inputs: []
      })
    ).resolves.toBe(false)

    expect(widgetManager.registerWidget).not.toHaveBeenCalled()
    expect(onFeatureTriggered).not.toHaveBeenCalled()
    expect(notificationModuleMock.showInternalSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'plugin-widget-load-failed:test-plugin:dynamic-command',
        meta: expect.objectContaining({ kind: 'plugin.widgetLoadFailed' })
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
    expect(notificationModuleMock.showInternalSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'plugin-widget-load-failed:test-plugin:test-feature',
        title: 'Widget 加载失败',
        message: '插件 widget 初始化失败，请检查插件版本、路径和运行日志。',
        level: 'error'
      })
    )
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

  it('exposes QuickOps bounded host facade through typed transport events', async () => {
    const response = { ok: true }
    const transport = {
      invoke: vi.fn().mockResolvedValue(response),
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

    const featureUtil = plugin.getFeatureUtil()
    const quickOps = featureUtil.quickOps as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >
    const pluginContext = {
      plugin: {
        name: 'test-plugin',
        uniqueKey: '',
        verified: false
      }
    }
    const quickOpsCases = [
      {
        method: 'capabilities',
        event: QuickOpsEvents.capabilities.get,
        payload: undefined,
        args: []
      },
      { method: 'sessions', event: QuickOpsEvents.sessions.get, payload: undefined, args: [] },
      { method: 'auditRecent', event: QuickOpsEvents.audit.get, payload: {}, args: [] },
      {
        method: 'auditRecent',
        event: QuickOpsEvents.audit.get,
        payload: { limit: 5 },
        args: [{ limit: 5 }]
      },
      { method: 'systemInfo', event: QuickOpsEvents.systemInfo.get, payload: undefined, args: [] },
      {
        method: 'tuffDiagnostics',
        event: QuickOpsEvents.tuffDiagnostics.get,
        payload: undefined,
        args: []
      },
      { method: 'diskSpace', event: QuickOpsEvents.diskSpace.get, payload: undefined, args: [] },
      {
        method: 'directoryUsage',
        event: QuickOpsEvents.directoryUsage.get,
        payload: { deep: true },
        args: [{ deep: true }]
      },
      {
        method: 'queryLocalIp',
        event: QuickOpsEvents.queryLocalIp.get,
        payload: undefined,
        args: []
      },
      {
        method: 'portStatus',
        event: QuickOpsEvents.portStatus.get,
        payload: { port: 5173 },
        args: [{ port: 5173 }]
      },
      {
        method: 'dnsQuery',
        event: QuickOpsEvents.dnsQuery.get,
        payload: { hostname: 'example.com', deep: true },
        args: [{ hostname: 'example.com', deep: true }]
      },
      {
        method: 'fileHash',
        event: QuickOpsEvents.fileHash.get,
        payload: { path: '/tmp/demo.txt' },
        args: [{ path: '/tmp/demo.txt' }]
      },
      {
        method: 'fileBase64',
        event: QuickOpsEvents.fileBase64.get,
        payload: { path: '/tmp/demo.txt' },
        args: [{ path: '/tmp/demo.txt' }]
      },
      {
        method: 'recentDownload',
        event: QuickOpsEvents.recentDownload.get,
        payload: undefined,
        args: []
      },
      {
        method: 'commonDirectory',
        event: QuickOpsEvents.commonDirectory.get,
        payload: { query: 'logs' },
        args: [{ query: 'logs' }]
      },
      {
        method: 'pathFormat',
        event: QuickOpsEvents.pathFormat.get,
        payload: { path: '/tmp/demo.txt' },
        args: [{ path: '/tmp/demo.txt' }]
      },
      {
        method: 'formatText',
        event: QuickOpsEvents.formatText.get,
        payload: { text: 'Hello QuickOps', mode: 'snake' },
        args: [{ text: 'Hello QuickOps', mode: 'snake' }]
      },
      {
        method: 'networkStatus',
        event: QuickOpsEvents.networkStatus.get,
        payload: undefined,
        args: []
      },
      {
        method: 'batteryStatus',
        event: QuickOpsEvents.batteryStatus.get,
        payload: undefined,
        args: []
      },
      {
        method: 'systemProxy',
        event: QuickOpsEvents.systemProxy.get,
        payload: undefined,
        args: []
      },
      {
        method: 'developerPreview',
        event: QuickOpsEvents.developerPreview.get,
        payload: { query: { text: 'json', inputs: [] } },
        args: [{ query: { text: 'json', inputs: [] } }]
      },
      {
        method: 'saveDeveloperPreview',
        event: QuickOpsEvents.developerPreview.save,
        payload: {
          format: 'svg',
          payload: {
            abilityId: 'preview.quickops.developer',
            title: 'QR Code 生成',
            primaryValue: 'data:image/svg+xml;charset=utf-8,%3Csvg%20/%3E'
          }
        },
        args: [
          {
            format: 'svg',
            payload: {
              abilityId: 'preview.quickops.developer',
              title: 'QR Code 生成',
              primaryValue: 'data:image/svg+xml;charset=utf-8,%3Csvg%20/%3E'
            }
          }
        ]
      }
    ] as const
    const expectedMethods = Array.from(new Set(quickOpsCases.map((item) => item.method)))

    expect(Object.keys(quickOps)).toEqual(expectedMethods)
    expect(featureUtil.plugin.quickOps).toBe(featureUtil.quickOps)

    for (const quickOpsCase of quickOpsCases) {
      await expect(quickOps[quickOpsCase.method](...quickOpsCase.args)).resolves.toEqual(response)
      expect(transport.invoke).toHaveBeenLastCalledWith(
        quickOpsCase.event,
        quickOpsCase.payload,
        pluginContext
      )
    }
  })

  it('exposes Flow SDK through typed transport events', async () => {
    const response = {
      success: true,
      data: {
        sessionId: 'flow-session-1',
        state: 'COMPLETED',
        ackPayload: { state: 'stopped' }
      }
    }
    const transport = {
      invoke: vi.fn().mockResolvedValue(response),
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

    const featureUtil = plugin.getFeatureUtil()

    await expect(
      featureUtil.flow.dispatch(
        {
          type: 'json',
          data: { action: 'stop' },
          context: { sourcePluginId: 'test-plugin' }
        },
        {
          preferredTarget: 'quickops.stop-timer',
          skipSelector: true,
          requireAck: true
        }
      )
    ).resolves.toEqual(response.data)
    expect(featureUtil.plugin.flow).toBe(featureUtil.flow)
    const [event, payload, context] = vi.mocked(transport.invoke).mock.calls.at(-1)!
    expect(event.toEventName()).toBe(FlowEvents.dispatch.toEventName())
    expect(payload).toEqual({
      senderId: 'test-plugin',
      payload: {
        type: 'json',
        data: { action: 'stop' },
        context: { sourcePluginId: 'test-plugin' }
      },
      options: {
        preferredTarget: 'quickops.stop-timer',
        skipSelector: true,
        requireAck: true
      },
      _sdkapi: undefined
    })
    expect(context).toEqual({
      plugin: {
        name: 'test-plugin',
        uniqueKey: '',
        verified: false
      }
    })
  })

  it('routes plugin copy-and-paste through the governed clipboard transport', async () => {
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
      'clipboard-plugin',
      { type: 'class', value: 'i-ri-clipboard-line' },
      '1.0.0',
      'desc',
      '',
      { enable: true, address: 'http://localhost' },
      '/tmp',
      {},
      { skipDataInit: true, runtime: { rootPath: '/tmp/root', mainWindowId: 1 } }
    )
    plugin.sdkapi = SdkApi.V260713
    Reflect.set(plugin, '_uniqueChannelKey', 'verified-clipboard-key')

    const featureUtil = plugin.getFeatureUtil()
    await expect(
      featureUtil.clipboard.copyAndPaste({ text: 'replacement', delayMs: 50 })
    ).resolves.toBe(true)
    expect(transport.invoke).toHaveBeenCalledWith(
      ClipboardEvents.copyAndPaste,
      { text: 'replacement', delayMs: 50, _sdkapi: SdkApi.V260713 },
      {
        plugin: {
          name: 'clipboard-plugin',
          uniqueKey: 'verified-clipboard-key',
          verified: true,
          sdkapi: SdkApi.V260713
        }
      }
    )

    vi.mocked(transport.invoke).mockResolvedValueOnce({
      success: false,
      code: 'MACOS_AUTOMATION_PERMISSION_DENIED',
      message: 'Automation permission denied.'
    })
    await expect(featureUtil.clipboard.copyAndPaste({ text: 'replacement' })).rejects.toMatchObject(
      {
        message: 'Automation permission denied.',
        code: 'MACOS_AUTOMATION_PERMISSION_DENIED',
        result: {
          success: false,
          code: 'MACOS_AUTOMATION_PERMISSION_DENIED'
        }
      }
    )
  })

  it('exposes one verified screenshot facade that routes typed targets and redacts native paths', async () => {
    const nativeCapture = {
      tfileUrl: 'tfile:///tmp/native/shot.png',
      dataUrl: 'data:image/png;base64,c2NyZWVuc2hvdA==',
      path: '/private/tmp/native/shot.png',
      mimeType: 'image/png',
      width: 1280,
      height: 720,
      displayId: 'display-1',
      displayName: 'Primary Display',
      x: 0,
      y: 0,
      scaleFactor: 2,
      durationMs: 12,
      sizeBytes: 2048,
      wroteClipboard: false
    }
    // The main-process transport surface is broader than this test's plugin SDK boundary.
    const transport = {
      invoke: vi.fn().mockResolvedValue(nativeCapture),
      on: vi.fn(() => vi.fn()),
      keyManager: {
        requestKey: vi.fn(),
        revokeKey: vi.fn()
      }
    } as unknown as ITuffTransportMain

    TouchPlugin.setTransport(transport)

    const plugin = new TouchPlugin(
      'screenshot-plugin',
      { type: 'class', value: 'i-ri-camera-line' },
      '1.0.0',
      'desc',
      '',
      { enable: true, address: 'http://localhost' },
      '/tmp',
      {},
      { skipDataInit: true, runtime: { rootPath: '/tmp/root', mainWindowId: 1 } }
    )
    const resolvedPluginSdkapi = SdkApi.V260713
    plugin.sdkapi = resolvedPluginSdkapi
    const pluginContext = {
      plugin: {
        name: 'screenshot-plugin',
        uniqueKey: 'verified-screenshot-key',
        verified: true,
        sdkapi: resolvedPluginSdkapi
      }
    }
    Reflect.set(plugin, '_uniqueChannelKey', pluginContext.plugin.uniqueKey)

    const featureUtil = plugin.getFeatureUtil()

    expect(featureUtil.plugin.screenshot).toBe(featureUtil.screenshot)

    await featureUtil.screenshot.getSupport()
    await featureUtil.screenshot.listDisplays()
    await featureUtil.screenshot.capture({ target: 'cursor-display', writeClipboard: true })
    await featureUtil.screenshot.capture({
      target: 'display',
      displayId: 'display-external',
      output: 'data-url'
    })
    const regionCapture = await featureUtil.screenshot.capture({
      target: 'region',
      displayId: 'display-1',
      region: { x: 10, y: 20, width: 300, height: 200 },
      output: 'tfile'
    })

    expect(regionCapture).toEqual({
      tfileUrl: 'tfile:///tmp/native/shot.png',
      dataUrl: 'data:image/png;base64,c2NyZWVuc2hvdA==',
      mimeType: 'image/png',
      width: 1280,
      height: 720,
      displayId: 'display-1',
      displayName: 'Primary Display',
      x: 0,
      y: 0,
      scaleFactor: 2,
      durationMs: 12,
      sizeBytes: 2048,
      wroteClipboard: false
    })
    expect(regionCapture).not.toHaveProperty('path')

    const calls = vi.mocked(transport.invoke).mock.calls
    const expectedCalls = [
      { event: NativeEvents.screenshot.getSupport, payload: undefined },
      { event: NativeEvents.screenshot.listDisplays, payload: undefined },
      {
        event: NativeEvents.screenshot.capture,
        payload: { target: 'cursor-display', writeClipboard: true }
      },
      {
        event: NativeEvents.screenshot.capture,
        payload: { target: 'display', displayId: 'display-external', output: 'data-url' }
      },
      {
        event: NativeEvents.screenshot.capture,
        payload: {
          target: 'region',
          displayId: 'display-1',
          region: { x: 10, y: 20, width: 300, height: 200 },
          output: 'tfile'
        }
      }
    ]

    expect(calls).toHaveLength(expectedCalls.length)
    for (const [index, expected] of expectedCalls.entries()) {
      const [event, payload, context] = calls[index]!
      expect(event.toEventName()).toBe(expected.event.toEventName())
      expect(payload).toEqual(expected.payload)
      expect(context).toEqual(pluginContext)
    }
  })
  it('exposes one verified System facade through typed active-app and selection events', async () => {
    const activeApp = {
      identifier: 'com.acme.editor',
      displayName: 'Acme Editor',
      bundleId: 'com.acme.editor',
      processId: 4242,
      executablePath: '/Applications/Acme Editor.app',
      platform: 'macos' as const,
      windowTitle: 'Draft',
      url: null,
      icon: 'data:image/png;base64,aWNvbg==',
      lastUpdated: 1_721_024_800_000
    }
    const selection = {
      text: 'Selected passage',
      supportLevel: 'supported' as const,
      limitations: ['Accessibility permission is required on macOS.'],
      capturedAt: 1_721_024_800_123
    }
    const transport = {
      invoke: vi.fn().mockResolvedValueOnce(activeApp).mockResolvedValueOnce(selection),
      on: vi.fn(() => vi.fn()),
      keyManager: {
        requestKey: vi.fn(),
        revokeKey: vi.fn()
      }
    } as unknown as ITuffTransportMain

    TouchPlugin.setTransport(transport)

    const plugin = new TouchPlugin(
      'system-plugin',
      { type: 'class', value: 'i-ri-computer-line' },
      '1.0.0',
      'desc',
      '',
      { enable: true, address: 'http://localhost' },
      '/tmp',
      {},
      { skipDataInit: true, runtime: { rootPath: '/tmp/root', mainWindowId: 1 } }
    )
    const resolvedPluginSdkapi = SdkApi.V260713
    plugin.sdkapi = resolvedPluginSdkapi
    const pluginContext = {
      plugin: {
        name: 'system-plugin',
        uniqueKey: 'verified-system-key',
        verified: true,
        sdkapi: resolvedPluginSdkapi
      }
    }
    Reflect.set(plugin, '_uniqueChannelKey', pluginContext.plugin.uniqueKey)

    const featureUtil = plugin.getFeatureUtil()

    expect(featureUtil.plugin.system).toBe(featureUtil.system)
    await expect(
      featureUtil.system.getActiveAppSnapshot({ forceRefresh: true, includeIcon: true })
    ).resolves.toEqual(activeApp)
    await expect(featureUtil.system.captureSelection()).resolves.toEqual(selection)

    const calls = vi.mocked(transport.invoke).mock.calls
    expect(calls).toHaveLength(2)
    const expectedCalls = [
      {
        event: AppEvents.system.getActiveApp,
        payload: { forceRefresh: true, includeIcon: true }
      },
      { event: AppEvents.system.captureSelection, payload: {} }
    ]
    for (const [index, expected] of expectedCalls.entries()) {
      const [event, payload, context] = calls[index]!
      expect(event.toEventName()).toBe(expected.event.toEventName())
      expect(payload).toEqual(expected.payload)
      expect(context).toEqual(pluginContext)
    }
  })
  it('exposes one localization facade through the plugin-scoped typed transport', async () => {
    const transport = {
      invoke: vi.fn().mockResolvedValue('zh-CN'),
      on: vi.fn(() => vi.fn()),
      keyManager: {
        requestKey: vi.fn(),
        revokeKey: vi.fn()
      }
    } as unknown as ITuffTransportMain

    TouchPlugin.setTransport(transport)

    const plugin = new TouchPlugin(
      'touch-localization',
      { type: 'class', value: 'i-ri-test-tube-line' },
      '1.0.0',
      'desc',
      '',
      { enable: true, address: 'http://localhost' },
      '/tmp',
      {},
      { skipDataInit: true, runtime: { rootPath: '/tmp/root', mainWindowId: 1 } }
    )
    plugin.sdkapi = SdkApi.V260713

    const featureUtil = plugin.getFeatureUtil()

    expect(featureUtil.plugin.i18n).toBe(featureUtil.i18n)
    expect(featureUtil.plugin.lexicon).toBe(featureUtil.lexicon)
    expect(featureUtil.i18n.createMessage('plugin.status', { count: 2 })).toBe(
      '$i18n:plugin.status|{"count":2}'
    )
    await expect(featureUtil.i18n.getLocale()).resolves.toBe('zh-CN')

    const [event, payload, context] = vi.mocked(transport.invoke).mock.calls[0]
    expect(event.toEventName()).toBe(PluginEvents.i18n.getLocale.toEventName())
    expect(payload).toEqual({ _sdkapi: SdkApi.V260713 })
    expect(context).toEqual({
      plugin: {
        name: 'touch-localization',
        uniqueKey: '',
        verified: false,
        sdkapi: SdkApi.V260713
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
        verified: false,
        sdkapi: 260615
      }
    })
  })

  it('streams intelligence through the plugin transport and cancels through the protocol', async () => {
    const transport = {
      invoke: vi.fn().mockResolvedValue(undefined),
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
    const payload = { messages: [{ role: 'user', content: 'hello' }] }
    const invokeOptions = {
      preferredProviderId: 'test-provider',
      metadata: { caller: 'spoofed-caller' }
    }

    const controller = await featureUtil.intelligence.stream(
      'text.chat',
      payload,
      { onDelta: vi.fn() },
      invokeOptions
    )

    const [startEvent, startPayload, startContext] = vi.mocked(transport.invoke).mock.calls[0]
    expect(startEvent.toEventName()).toBe(
      `${intelligenceApiEvents.stream.toEventName()}:stream:start`
    )
    expect(startPayload).toEqual({
      streamId: controller.streamId,
      capabilityId: 'text.chat',
      payload,
      options: { ...invokeOptions, stream: true },
      _sdkapi: 260615
    })
    expect(startContext).toEqual({
      plugin: {
        name: 'touch-intelligence',
        uniqueKey: '',
        verified: false,
        sdkapi: 260615
      }
    })

    controller.cancel()

    const [cancelEvent, cancelPayload, cancelContext] = vi.mocked(transport.invoke).mock.calls[1]
    expect(cancelEvent.toEventName()).toBe(
      `${intelligenceApiEvents.stream.toEventName()}:stream:cancel`
    )
    expect(cancelPayload).toEqual({ streamId: controller.streamId })
    expect(cancelContext).toEqual(startContext)
    expect(controller.cancelled).toBe(true)
  })
})

describe('touchPlugin feature identity', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects duplicate feature ids and removes registered features by id', () => {
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
    const original = {
      id: 'shared-feature-id',
      name: 'Original Feature',
      desc: 'Original feature description',
      icon: { type: 'class', value: 'i-ri-test-tube-line' },
      commands: [{ type: 'over', value: ['original'] }]
    } as IPluginFeature
    const duplicateId = {
      id: 'shared-feature-id',
      name: 'Different Feature Name',
      desc: 'Different feature description',
      icon: { type: 'class', value: 'i-ri-test-tube-line' },
      commands: [{ type: 'over', value: ['different'] }]
    } as IPluginFeature
    const retained = {
      id: 'retained-feature-id',
      name: 'Retained Feature',
      desc: 'Retained feature description',
      icon: { type: 'class', value: 'i-ri-test-tube-line' },
      commands: [{ type: 'over', value: ['retained'] }]
    } as IPluginFeature
    const removable = {
      id: 'removable-feature-id',
      name: 'Removable Feature',
      desc: 'Removable feature description',
      icon: { type: 'class', value: 'i-ri-test-tube-line' },
      commands: [{ type: 'over', value: ['removable'] }]
    } as IPluginFeature

    expect(plugin.addFeature(original)).toBe(true)
    expect(plugin.addFeature(duplicateId)).toBe(false)
    expect(plugin.getFeatures()).toHaveLength(1)
    expect(plugin.getFeature('shared-feature-id')).toMatchObject({ name: 'Original Feature' })

    expect(plugin.addFeature(retained)).toBe(true)
    expect(plugin.addFeature(removable)).toBe(true)
    expect(plugin.delFeature('removable-feature-id')).toBe(true)
    expect(plugin.getFeature('removable-feature-id')).toBeNull()
    expect(plugin.getFeature('retained-feature-id')).toMatchObject({ name: 'Retained Feature' })
    expect(plugin.delFeature('unknown-feature-id')).toBe(false)
  })

  it('initializes file icons for dynamically registered features', () => {
    const init = vi.spyOn(TuffIconImpl.prototype, 'init').mockResolvedValue()
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

    expect(
      plugin.addFeature({
        id: 'dynamic-file-icon',
        name: 'Dynamic File Icon',
        desc: 'Dynamic feature with a packaged icon',
        icon: { type: 'file', value: 'assets/logo.svg' },
        commands: [{ type: 'over', value: ['dynamic-icon'] }]
      } as IPluginFeature)
    ).toBe(true)
    expect(init).toHaveBeenCalledTimes(1)
  })
})

describe('touchPlugin storage overview', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('includes runtime logs in storage stats, tree, and cleanup', () => {
    const existsSync = vi.spyOn(fse, 'existsSync').mockReturnValue(true)
    const readdirSync = vi.spyOn(fse, 'readdirSync').mockImplementation((targetPath) => {
      const normalizedPath = String(targetPath)
      if (normalizedPath.endsWith(path.join('data', 'config'))) return ['settings.json'] as any
      if (normalizedPath.endsWith(path.join('test-plugin-source', 'logs')))
        return ['session.log'] as any
      return [] as any
    })
    const statSync = vi.spyOn(fse, 'statSync').mockImplementation((targetPath) => {
      const normalizedPath = String(targetPath)
      const isDirectory =
        normalizedPath.endsWith('config') ||
        normalizedPath.endsWith('logs') ||
        normalizedPath.endsWith('data-logs') ||
        normalizedPath.endsWith('temp')
      return {
        isDirectory: () => isDirectory,
        size: normalizedPath.endsWith('session.log') ? 42 : 20,
        mtimeMs: 123
      } as any
    })
    const emptyDirSync = vi.spyOn(fse, 'emptyDirSync').mockImplementation(() => undefined)

    const plugin = new TouchPlugin(
      'test-plugin',
      { type: 'class', value: 'i-ri-test-tube-line' },
      '1.0.0',
      'desc',
      '',
      { enable: false, address: '' },
      '/tmp/test-plugin-source',
      {},
      { skipDataInit: true, runtime: { rootPath: '/tmp/root', mainWindowId: 1 } }
    )

    const stats = plugin.getStorageStats()
    const tree = plugin.getStorageTree()
    const result = plugin.clearStorage()

    expect(stats.fileCount).toBe(2)
    expect(stats.totalSize).toBe(62)
    expect(tree.map((node) => node.name)).toContain('logs')
    expect(result).toEqual({ success: true })
    expect(emptyDirSync).toHaveBeenCalledWith('/tmp/test-plugin-source/logs')
    expect(existsSync).toHaveBeenCalled()
    expect(readdirSync).toHaveBeenCalled()
    expect(statSync).toHaveBeenCalled()
  })
})

describe('touchPlugin.setRuntime', () => {
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

describe('touchPlugin.enable', () => {
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
