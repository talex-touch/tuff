import type { TuffItem } from '@talex-touch/utils'
import type { IPluginFeature } from '@talex-touch/utils/plugin'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { createHash } from 'node:crypto'
import os from 'node:os'
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
import type { PluginRuntimeActivationOptions } from './host/plugin-runtime-service'
import { PluginRuntimeHostError } from './host/plugin-runtime-host'
import { TouchPlugin } from './plugin'
import { widgetManager } from './widget/widget-manager'

const permissionModuleMock = vi.hoisted(() => ({
  hasPermission: vi.fn(() => true),
  getStore() {
    return { hasPermission: permissionModuleMock.hasPermission }
  },
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

const coreBoxManagerMock = vi.hoisted(() => ({
  exitUIMode: vi.fn(),
  getCurrentFeature: vi.fn()
}))

vi.mock('../box-tool/core-box/manager', () => ({
  CoreBoxManager: {
    getInstance: () => coreBoxManagerMock
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
    registerWidget: vi.fn(),
    releasePlugin: vi.fn().mockResolvedValue(undefined)
  }
}))

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createRuntimeServiceMock(overrides: Record<string, unknown> = {}) {
  const host = { state: 'active', processId: 7001 }
  const lifecycle = {
    onMessage: vi.fn(async () => undefined),
    onLaunch: vi.fn(async () => undefined),
    onFeatureTriggered: vi.fn(async () => undefined),
    onInputChanged: vi.fn(async () => undefined),
    onActionClick: vi.fn(async () => undefined),
    onClose: vi.fn(async () => undefined),
    onItemAction: vi.fn(async () => undefined),
    onStorageChange: vi.fn(async () => undefined)
  }
  return {
    host,
    lifecycle,
    startActivation: vi.fn(async (options: { activation: unknown }) => ({
      activation: options.activation,
      host,
      lifecycle
    })),
    stopActivation: vi.fn(async () => undefined),
    resolve: vi.fn(() => host),
    ...overrides
  }
}

function clearBoxItemMocks(): void {
  boxItemManagerMock.clear.mockReset()
  boxItemManagerMock.upsert.mockReset()
  boxItemManagerMock.batchUpsert.mockReset()
  boxItemManagerMock.update.mockReset()
  boxItemManagerMock.delete.mockReset()
  boxItemManagerMock.get.mockReset()
  boxItemManagerMock.get.mockReturnValue(undefined)
  boxItemManagerMock.getBySource.mockReset()
  boxItemManagerMock.getBySource.mockReturnValue([])
  permissionModuleMock.checkPermission.mockReset()
  permissionModuleMock.hasPermission.mockReset()
  permissionModuleMock.hasPermission.mockReturnValue(true)
  permissionModuleMock.checkPermission.mockReturnValue({
    allowed: true,
    permissionId: 'search.root-results',
    pluginId: 'test-plugin'
  })
  notificationModuleMock.showInternalSystemNotification.mockClear()
  notificationModuleMock.showInternalSystemNotification.mockReturnValue({ id: 'notification-id' })
  coreBoxManagerMock.exitUIMode.mockClear()
  coreBoxManagerMock.getCurrentFeature.mockReset()
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
    const activeFeatureItem = boxItemManagerMock.batchUpsert.mock.calls.at(-1)?.[0]?.[0]
    boxItemManagerMock.get.mockImplementation((id: string) =>
      id === 'active-feature-item' ? activeFeatureItem : undefined
    )

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
      meta: { updated: true, pluginName: 'test-plugin' }
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
      meta: { updated: true, pluginName: 'test-plugin' }
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

  it('awaits the isolated onClose lifecycle before completing feature exit', async () => {
    const closeBarrier = deferred<void>()
    const feature = {
      id: 'closing-feature',
      name: 'Closing Feature',
      desc: '',
      commands: [{ type: 'over', value: ['close'] }]
    } as IPluginFeature
    coreBoxManagerMock.getCurrentFeature.mockReturnValue(feature)

    const plugin = new TouchPlugin(
      'closing-plugin',
      { type: 'class', value: 'i-ri-test-tube-line' },
      '1.0.0',
      'desc',
      '',
      { enable: false, address: '' },
      '/tmp',
      {},
      { skipDataInit: true }
    )
    plugin.pluginLifecycle = {
      onFeatureTriggered: vi.fn(),
      onClose: vi.fn(() => closeBarrier.promise)
    }

    const exiting = plugin.triggerFeatureExit()
    expect(exiting).toBeInstanceOf(Promise)
    let settled = false
    void exiting.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    closeBarrier.resolve()
    await expect(exiting).resolves.toBeUndefined()
    expect(plugin.pluginLifecycle.onClose).toHaveBeenCalledWith(feature)
  })

  it('exposes plugin secret API through the injected feature util', async () => {
    const transport = {
      invoke: vi.fn().mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({
        backend: 'local-secret',
        available: true,
        degraded: false
      }),
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
          uniqueKey: expect.any(String)
        }
      }
    )
    expect(transport.invoke).toHaveBeenCalledWith(PluginEvents.storage.getSecretHealth, undefined, {
      plugin: {
        name: 'test-plugin',
        uniqueKey: expect.any(String)
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
        uniqueKey: ''
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
        uniqueKey: ''
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
    const readdirSync = vi.spyOn(fse, 'readdirSync').mockImplementation(((
      targetPath: Parameters<typeof fse.readdirSync>[0]
    ) => {
      const normalizedPath = String(targetPath)
      if (normalizedPath.endsWith(path.join('data', 'config'))) return ['settings.json']
      if (normalizedPath.endsWith(path.join('test-plugin-source', 'logs'))) return ['session.log']
      return []
    }) as typeof fse.readdirSync)
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
      } as ReturnType<typeof fse.statSync>
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

  it('keeps committed business file writes successful when notification transport is unavailable', () => {
    const root = fse.mkdtempSync(path.join(os.tmpdir(), 'tuff-business-notify-'))
    try {
      const plugin = new TouchPlugin(
        'file-plugin',
        { type: 'class', value: 'i-ri-test-tube-line' },
        '1.0.0',
        'desc',
        '',
        { enable: false, address: '' },
        path.join(root, 'source'),
        {},
        { runtime: { rootPath: root, mainWindowId: 1 } }
      )

      expect(() => plugin.writeBusinessFile('state.json', { version: 2 })).not.toThrow()
      expect(plugin.readBusinessFile('state.json')).toEqual({
        found: true,
        value: { version: 2 }
      })
    } finally {
      fse.removeSync(root)
    }
  })

  it('rejects symlink escapes for dynamic business feature file icons', async () => {
    const root = fse.mkdtempSync(path.join(os.tmpdir(), 'tuff-business-icon-'))
    try {
      const pluginRoot = path.join(root, 'plugin')
      const assets = path.join(pluginRoot, 'assets')
      fse.ensureDirSync(assets)
      const outside = path.join(root, 'outside.svg')
      fse.writeFileSync(outside, '<svg/>')
      fse.symlinkSync(outside, path.join(assets, 'linked.svg'))
      const plugin = new TouchPlugin(
        'icon-plugin',
        { type: 'class', value: 'i-ri-test-tube-line' },
        '1.0.0',
        'desc',
        '',
        { enable: false, address: '' },
        pluginRoot,
        {},
        { skipDataInit: true, runtime: { rootPath: root, mainWindowId: 1 } }
      )

      await expect(
        plugin.addBusinessFeature({
          id: 'linked-icon',
          name: 'Linked icon',
          desc: 'Linked icon',
          icon: { type: 'file', value: 'assets/linked.svg' },
          push: false,
          platform: {},
          commands: [{ type: 'match', value: 'linked' }]
        })
      ).resolves.toBe(false)
      expect(plugin.getFeature('linked-icon')).toBeNull()
    } finally {
      fse.removeSync(root)
    }
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
    TouchPlugin.setRuntimeService(null)
    TouchPlugin.setSnipasteProcessCapabilityFactory(null)
    TouchPlugin.setSystemActionCapabilityFactory(null)
    TouchPlugin.setBrowserOpenCapabilityFactory(null)
    TouchPlugin.setWindowManagerCapabilityFactory(null)
    TouchPlugin.setWindowPresetCapabilityFactory(null)
    TouchPlugin.setWorkspaceScriptCapabilityFactory(null)
    clearBoxItemMocks()
    vi.restoreAllMocks()
  })

  it('signs authority before starting an empty Prelude and awaits activation commit', async () => {
    const order: string[] = []
    const activationBarrier = deferred<void>()
    const runtime = createRuntimeServiceMock({
      startActivation: vi.fn(async (options: { activation: unknown }) => {
        order.push('start')
        await activationBarrier.promise
        return {
          activation: options.activation,
          host: { state: 'active', processId: 7001 },
          lifecycle: createRuntimeServiceMock().lifecycle
        }
      })
    })
    const requestKey = vi.fn(() => {
      order.push('key')
      return 'activation-key-1'
    })
    TouchPlugin.setTransport({
      broadcast: vi.fn(),
      invoke: vi.fn().mockResolvedValue(undefined),
      keyManager: { requestKey, revokeKey: vi.fn(() => true) },
      sendToPlugin: vi.fn().mockResolvedValue(undefined)
    } as unknown as ITuffTransportMain)
    TouchPlugin.setRuntimeService(runtime as never)
    const plugin = new TouchPlugin(
      'empty-plugin',
      { type: 'class', value: 'i-ri-test-tube-line' },
      '1.0.0',
      'desc',
      '',
      { enable: false, address: '' },
      '/tmp/missing-empty-plugin',
      {},
      { skipDataInit: true }
    )

    let settled = false
    const enabling = plugin.enable().then((result) => {
      settled = true
      return result
    })
    await vi.waitFor(() => expect(runtime.startActivation).toHaveBeenCalledTimes(1))

    expect(order).toEqual(['key', 'start'])
    expect(plugin.status).toBe(PluginStatus.LOADING)
    expect(settled).toBe(false)
    expect(runtime.startActivation).toHaveBeenCalledWith(
      expect.objectContaining({
        activation: expect.objectContaining({
          name: 'empty-plugin',
          activationGeneration: 1,
          key: 'activation-key-1'
        }),
        scriptContent: 'module.exports = {}',
        snapshot: expect.objectContaining({
          manifest: expect.objectContaining({ name: 'empty-plugin' })
        })
      })
    )
    const startOptions = vi.mocked(runtime.startActivation).mock
      .calls[0]?.[0] as unknown as PluginRuntimeActivationOptions
    expect(startOptions.capabilityDefinitions).toBeUndefined()
    expect(startOptions.closeResources).toBeUndefined()
    expect(startOptions.snapshot.manifest).not.toHaveProperty('issues')
    expect(startOptions.snapshot.manifest).not.toHaveProperty('loadError')
    expect(startOptions.snapshot.manifest).not.toHaveProperty('dev')
    expect(startOptions.snapshot.manifest).not.toHaveProperty('pluginPath')

    activationBarrier.resolve()
    await expect(enabling).resolves.toBe(true)
    expect(plugin.status).toBe(PluginStatus.ENABLED)
    expect(plugin.pluginLifecycle).not.toBeNull()
  })

  it('injects a batch-rename-only filesystem definition and approves lifecycle file inputs', async () => {
    const root = fse.mkdtempSync(path.join(os.tmpdir(), 'tuff-batch-rename-activation-'))
    try {
      const sourcePath = path.join(root, 'alpha.txt')
      fse.writeFileSync(path.join(root, 'index.js'), 'module.exports = {}')
      fse.writeFileSync(sourcePath, 'alpha')
      const runtime = createRuntimeServiceMock()
      TouchPlugin.setTransport({
        broadcast: vi.fn(),
        invoke: vi.fn().mockResolvedValue(undefined),
        keyManager: {
          requestKey: vi.fn(() => 'batch-rename-activation-key'),
          revokeKey: vi.fn(() => true)
        },
        sendToPlugin: vi.fn().mockResolvedValue(undefined)
      } as unknown as ITuffTransportMain)
      TouchPlugin.setRuntimeService(runtime as never)
      const plugin = new TouchPlugin(
        'touch-batch-rename',
        { type: 'class', value: 'i-ri-file-edit-line' },
        '1.0.0',
        'desc',
        '',
        { enable: false, address: '' },
        root,
        {},
        { skipDataInit: true }
      )
      plugin.sdkapi = SdkApi.V260713
      plugin.declaredPermissions = {
        required: ['fs.read', 'fs.write', 'search.root-results', 'storage.plugin'],
        optional: [],
        reasons: {}
      }
      plugin.setPreludeContract({ main: 'index.js' })

      await expect(plugin.enable()).resolves.toBe(true)
      const startOptions = vi.mocked(runtime.startActivation).mock
        .calls[0]?.[0] as unknown as PluginRuntimeActivationOptions
      expect(startOptions.capabilityDefinitions?.map((definition) => definition.id)).toEqual([
        'filesystem.write'
      ])
      expect(startOptions.capabilityDefinitions?.[0]?.permission).toBe('fs.write')
      expect(startOptions.closeResources).toEqual(expect.any(Function))

      await plugin.triggerFeature(
        { id: 'batch-rename' } as IPluginFeature,
        {
          text: 'prefix:renamed-',
          inputs: [{ type: 'files', content: JSON.stringify([sourcePath]) }]
        } as never
      )
      expect(permissionModuleMock.hasPermission).toHaveBeenCalledWith(
        'touch-batch-rename',
        'fs.read',
        SdkApi.V260713
      )
      expect(runtime.lifecycle.onFeatureTriggered).toHaveBeenCalledOnce()
      await expect(startOptions.closeResources?.()).resolves.toBeUndefined()
    } finally {
      fse.removeSync(root)
    }
  })

  it.each(['touch-quick-actions', 'touch-system-actions'] as const)(
    '%s injects an activation-local system definition and rotates it on re-enable',
    async (pluginName) => {
      const root = fse.mkdtempSync(path.join(os.tmpdir(), 'tuff-system-action-activation-'))
      try {
        fse.writeFileSync(path.join(root, 'index.js'), 'module.exports = {}')
        const runtime = createRuntimeServiceMock()
        const requestKey = vi
          .fn()
          .mockReturnValueOnce('system-action-key-1')
          .mockReturnValueOnce('system-action-key-2')
        TouchPlugin.setTransport({
          broadcast: vi.fn(),
          invoke: vi.fn().mockResolvedValue(undefined),
          keyManager: { requestKey, revokeKey: vi.fn(() => true) },
          sendToPlugin: vi.fn().mockResolvedValue(undefined)
        } as unknown as ITuffTransportMain)
        TouchPlugin.setRuntimeService(runtime as never)
        const factory = vi.fn((_activation: PluginRuntimeActivationOptions['activation']) => ({
          definitions: Object.freeze([{ id: 'system.invoke' }])
        }))
        TouchPlugin.setSystemActionCapabilityFactory(factory as never)
        const plugin = new TouchPlugin(
          pluginName,
          { type: 'class', value: 'i-ri-settings-3-line' },
          '1.0.0',
          'desc',
          '',
          { enable: false, address: '' },
          root,
          {},
          { skipDataInit: true }
        )
        plugin.setPreludeContract({ main: 'index.js' })

        await expect(plugin.enable()).resolves.toBe(true)
        const first = vi.mocked(runtime.startActivation).mock
          .calls[0]?.[0] as unknown as PluginRuntimeActivationOptions
        expect(first?.capabilityDefinitions?.map((definition) => definition.id)).toEqual([
          'system.invoke'
        ])
        expect(first?.closeResources).toBeUndefined()
        expect(first?.activation).toMatchObject({
          activationGeneration: 1,
          key: 'system-action-key-1'
        })

        await expect(plugin.disable()).resolves.toBe(true)
        await expect(plugin.enable()).resolves.toBe(true)
        const second = vi.mocked(runtime.startActivation).mock
          .calls[1]?.[0] as unknown as PluginRuntimeActivationOptions
        expect(second?.capabilityDefinitions?.map((definition) => definition.id)).toEqual([
          'system.invoke'
        ])
        expect(second?.activation).toMatchObject({
          activationGeneration: 2,
          key: 'system-action-key-2'
        })
        expect(factory).toHaveBeenCalledTimes(2)
        expect(factory.mock.calls[0]?.[0]).not.toEqual(factory.mock.calls[1]?.[0])
      } finally {
        fse.removeSync(root)
      }
    }
  )

  it('injects a generation-local window manager definition and awaited close barrier', async () => {
    const root = fse.mkdtempSync(path.join(os.tmpdir(), 'tuff-window-manager-activation-'))
    try {
      fse.writeFileSync(path.join(root, 'index.js'), 'module.exports = {}')
      const runtime = createRuntimeServiceMock()
      const requestKey = vi
        .fn()
        .mockReturnValueOnce('window-manager-key-1')
        .mockReturnValueOnce('window-manager-key-2')
      TouchPlugin.setTransport({
        broadcast: vi.fn(),
        invoke: vi.fn().mockResolvedValue(undefined),
        keyManager: { requestKey, revokeKey: vi.fn(() => true) },
        sendToPlugin: vi.fn().mockResolvedValue(undefined)
      } as unknown as ITuffTransportMain)
      TouchPlugin.setRuntimeService(runtime as never)
      const closes: Array<ReturnType<typeof vi.fn>> = []
      const factory = vi.fn((_activation: PluginRuntimeActivationOptions['activation']) => {
        const close = vi.fn(async () => undefined)
        closes.push(close)
        return {
          definitions: Object.freeze([{ id: 'system.window-manager', permission: 'system.shell' }]),
          close
        }
      })
      TouchPlugin.setWindowManagerCapabilityFactory(factory as never)
      const plugin = new TouchPlugin(
        'touch-window-manager',
        { type: 'class', value: 'i-ri-window-line' },
        '1.0.0',
        'desc',
        '',
        { enable: false, address: '' },
        root,
        {},
        { skipDataInit: true }
      )
      plugin.setPreludeContract({ main: 'index.js' })

      await expect(plugin.enable()).resolves.toBe(true)
      const first = vi.mocked(runtime.startActivation).mock
        .calls[0]?.[0] as unknown as PluginRuntimeActivationOptions
      expect(first.capabilityDefinitions?.map((definition) => definition.id)).toEqual([
        'system.window-manager'
      ])
      expect(first.capabilityDefinitions?.[0]?.permission).toBe('system.shell')
      expect(first.closeResources).toEqual(expect.any(Function))
      expect(first.activation).toMatchObject({
        activationGeneration: 1,
        key: 'window-manager-key-1'
      })
      await expect(first.closeResources?.()).resolves.toBeUndefined()
      expect(closes[0]).toHaveBeenCalledOnce()

      await expect(plugin.disable()).resolves.toBe(true)
      await expect(plugin.enable()).resolves.toBe(true)
      const second = vi.mocked(runtime.startActivation).mock
        .calls[1]?.[0] as unknown as PluginRuntimeActivationOptions
      expect(second.activation).toMatchObject({
        activationGeneration: 2,
        key: 'window-manager-key-2'
      })
      expect(factory).toHaveBeenCalledTimes(2)
      expect(factory.mock.calls[0]?.[0]).not.toEqual(factory.mock.calls[1]?.[0])
    } finally {
      fse.removeSync(root)
    }
  })

  it('injects a generation-local window preset definition and awaited close barrier', async () => {
    const root = fse.mkdtempSync(path.join(os.tmpdir(), 'tuff-window-presets-activation-'))
    try {
      fse.writeFileSync(path.join(root, 'index.js'), 'module.exports = {}')
      const runtime = createRuntimeServiceMock()
      const requestKey = vi
        .fn()
        .mockReturnValueOnce('window-presets-key-1')
        .mockReturnValueOnce('window-presets-key-2')
      TouchPlugin.setTransport({
        broadcast: vi.fn(),
        invoke: vi.fn().mockResolvedValue(undefined),
        keyManager: { requestKey, revokeKey: vi.fn(() => true) },
        sendToPlugin: vi.fn().mockResolvedValue(undefined)
      } as unknown as ITuffTransportMain)
      TouchPlugin.setRuntimeService(runtime as never)
      const closes: Array<ReturnType<typeof vi.fn>> = []
      const factory = vi.fn((_activation: PluginRuntimeActivationOptions['activation']) => {
        const close = vi.fn(async () => undefined)
        closes.push(close)
        return {
          definitions: Object.freeze([{ id: 'system.window-presets', permission: 'system.shell' }]),
          close
        }
      })
      TouchPlugin.setWindowPresetCapabilityFactory(factory as never)
      const plugin = new TouchPlugin(
        'touch-window-presets',
        { type: 'class', value: 'i-ri-layout-column-line' },
        '1.0.0',
        'desc',
        '',
        { enable: false, address: '' },
        root,
        {},
        { skipDataInit: true }
      )
      plugin.setPreludeContract({ main: 'index.js' })

      await expect(plugin.enable()).resolves.toBe(true)
      const first = vi.mocked(runtime.startActivation).mock
        .calls[0]?.[0] as unknown as PluginRuntimeActivationOptions
      expect(first.capabilityDefinitions?.map((definition) => definition.id)).toEqual([
        'system.window-presets'
      ])
      expect(first.capabilityDefinitions?.[0]?.permission).toBe('system.shell')
      expect(first.closeResources).toEqual(expect.any(Function))
      expect(first.activation).toMatchObject({
        activationGeneration: 1,
        key: 'window-presets-key-1'
      })
      await expect(first.closeResources?.()).resolves.toBeUndefined()
      expect(closes[0]).toHaveBeenCalledOnce()

      await expect(plugin.disable()).resolves.toBe(true)
      await expect(plugin.enable()).resolves.toBe(true)
      const second = vi.mocked(runtime.startActivation).mock
        .calls[1]?.[0] as unknown as PluginRuntimeActivationOptions
      expect(second.activation).toMatchObject({
        activationGeneration: 2,
        key: 'window-presets-key-2'
      })
      expect(factory).toHaveBeenCalledTimes(2)
      expect(factory.mock.calls[0]?.[0]).not.toEqual(factory.mock.calls[1]?.[0])
    } finally {
      fse.removeSync(root)
    }
  })

  it('injects a generation-local browser-open definition and awaited close barrier', async () => {
    const root = fse.mkdtempSync(path.join(os.tmpdir(), 'tuff-browser-open-activation-'))
    try {
      fse.writeFileSync(path.join(root, 'index.js'), 'module.exports = {}')
      const runtime = createRuntimeServiceMock()
      const requestKey = vi
        .fn()
        .mockReturnValueOnce('browser-open-key-1')
        .mockReturnValueOnce('browser-open-key-2')
      TouchPlugin.setTransport({
        broadcast: vi.fn(),
        invoke: vi.fn().mockResolvedValue(undefined),
        keyManager: { requestKey, revokeKey: vi.fn(() => true) },
        sendToPlugin: vi.fn().mockResolvedValue(undefined)
      } as unknown as ITuffTransportMain)
      TouchPlugin.setRuntimeService(runtime as never)
      const closes: Array<ReturnType<typeof vi.fn>> = []
      const factory = vi.fn((_activation: PluginRuntimeActivationOptions['activation']) => {
        const close = vi.fn(async () => undefined)
        closes.push(close)
        return {
          definitions: Object.freeze([{ id: 'system.browser-open', permission: 'system.shell' }]),
          close
        }
      })
      TouchPlugin.setBrowserOpenCapabilityFactory(factory as never)
      const plugin = new TouchPlugin(
        'touch-browser-open',
        { type: 'class', value: 'i-ri-global-line' },
        '1.0.4',
        'desc',
        '',
        { enable: false, address: '' },
        root,
        {},
        { skipDataInit: true }
      )
      plugin.setPreludeContract({ main: 'index.js' })

      await expect(plugin.enable()).resolves.toBe(true)
      const first = vi.mocked(runtime.startActivation).mock
        .calls[0]?.[0] as unknown as PluginRuntimeActivationOptions
      expect(first.capabilityDefinitions?.map((definition) => definition.id)).toEqual([
        'system.browser-open'
      ])
      expect(first.capabilityDefinitions?.[0]?.permission).toBe('system.shell')
      expect(first.closeResources).toEqual(expect.any(Function))
      expect(first.activation).toMatchObject({
        activationGeneration: 1,
        key: 'browser-open-key-1'
      })
      await expect(first.closeResources?.()).resolves.toBeUndefined()
      expect(closes[0]).toHaveBeenCalledOnce()

      await expect(plugin.disable()).resolves.toBe(true)
      await expect(plugin.enable()).resolves.toBe(true)
      const second = vi.mocked(runtime.startActivation).mock
        .calls[1]?.[0] as unknown as PluginRuntimeActivationOptions
      expect(second.activation).toMatchObject({
        activationGeneration: 2,
        key: 'browser-open-key-2'
      })
      expect(factory).toHaveBeenCalledTimes(2)
      expect(factory.mock.calls[0]?.[0]).not.toEqual(factory.mock.calls[1]?.[0])
    } finally {
      fse.removeSync(root)
    }
  })

  it('injects a generation-local workspace script definition and awaited close barrier', async () => {
    const root = fse.mkdtempSync(path.join(os.tmpdir(), 'tuff-workspace-script-activation-'))
    try {
      fse.writeFileSync(path.join(root, 'index.js'), 'module.exports = {}')
      const runtime = createRuntimeServiceMock()
      const requestKey = vi
        .fn()
        .mockReturnValueOnce('workspace-script-key-1')
        .mockReturnValueOnce('workspace-script-key-2')
      TouchPlugin.setTransport({
        broadcast: vi.fn(),
        invoke: vi.fn().mockResolvedValue(undefined),
        keyManager: { requestKey, revokeKey: vi.fn(() => true) },
        sendToPlugin: vi.fn().mockResolvedValue(undefined)
      } as unknown as ITuffTransportMain)
      TouchPlugin.setRuntimeService(runtime as never)
      const closes: Array<ReturnType<typeof vi.fn>> = []
      const factory = vi.fn((_activation: PluginRuntimeActivationOptions['activation']) => {
        const close = vi.fn(async () => undefined)
        closes.push(close)
        return {
          definitions: Object.freeze([{ id: 'process.workspace-scripts', permission: 'fs.read' }]),
          close
        }
      })
      TouchPlugin.setWorkspaceScriptCapabilityFactory(factory as never)
      const plugin = new TouchPlugin(
        'touch-workspace-scripts',
        { type: 'class', value: 'i-ri-terminal-box-line' },
        '1.0.0',
        'desc',
        '',
        { enable: false, address: '' },
        root,
        {},
        { skipDataInit: true }
      )
      plugin.setPreludeContract({ main: 'index.js' })

      await expect(plugin.enable()).resolves.toBe(true)
      const first = vi.mocked(runtime.startActivation).mock
        .calls[0]?.[0] as unknown as PluginRuntimeActivationOptions
      expect(first.capabilityDefinitions?.map((definition) => definition.id)).toEqual([
        'process.workspace-scripts'
      ])
      expect(first.capabilityDefinitions?.[0]?.permission).toBe('fs.read')
      expect(first.closeResources).toEqual(expect.any(Function))
      expect(first.activation).toMatchObject({
        activationGeneration: 1,
        key: 'workspace-script-key-1'
      })
      await expect(first.closeResources?.()).resolves.toBeUndefined()
      expect(closes[0]).toHaveBeenCalledOnce()

      await expect(plugin.disable()).resolves.toBe(true)
      await expect(plugin.enable()).resolves.toBe(true)
      const second = vi.mocked(runtime.startActivation).mock
        .calls[1]?.[0] as unknown as PluginRuntimeActivationOptions
      expect(second.activation).toMatchObject({
        activationGeneration: 2,
        key: 'workspace-script-key-2'
      })
      expect(factory).toHaveBeenCalledTimes(2)
      expect(factory.mock.calls[0]?.[0]).not.toEqual(factory.mock.calls[1]?.[0])
    } finally {
      fse.removeSync(root)
    }
  })

  it('injects a generation-local Snipaste process definition and awaited close barrier', async () => {
    const root = fse.mkdtempSync(path.join(os.tmpdir(), 'tuff-snipaste-activation-'))
    try {
      fse.writeFileSync(path.join(root, 'index.js'), 'module.exports = {}')
      const runtime = createRuntimeServiceMock()
      const requestKey = vi
        .fn()
        .mockReturnValueOnce('snipaste-key-1')
        .mockReturnValueOnce('snipaste-key-2')
      TouchPlugin.setTransport({
        broadcast: vi.fn(),
        invoke: vi.fn().mockResolvedValue(undefined),
        keyManager: { requestKey, revokeKey: vi.fn(() => true) },
        sendToPlugin: vi.fn().mockResolvedValue(undefined)
      } as unknown as ITuffTransportMain)
      TouchPlugin.setRuntimeService(runtime as never)
      const closes: Array<ReturnType<typeof vi.fn>> = []
      const factory = vi.fn((_activation: PluginRuntimeActivationOptions['activation']) => {
        const close = vi.fn(async () => undefined)
        closes.push(close)
        return {
          definitions: Object.freeze([{ id: 'process.spawn', permission: 'system.shell' }]),
          close
        }
      })
      TouchPlugin.setSnipasteProcessCapabilityFactory(factory as never)
      const plugin = new TouchPlugin(
        'touch-snipaste',
        { type: 'class', value: 'i-ri-screenshot-line' },
        '1.0.0',
        'desc',
        '',
        { enable: false, address: '' },
        root,
        {},
        { skipDataInit: true }
      )
      plugin.setPreludeContract({ main: 'index.js' })

      await expect(plugin.enable()).resolves.toBe(true)
      const first = vi.mocked(runtime.startActivation).mock
        .calls[0]?.[0] as unknown as PluginRuntimeActivationOptions
      expect(first.capabilityDefinitions?.map((definition) => definition.id)).toEqual([
        'process.spawn'
      ])
      expect(first.capabilityDefinitions?.[0]?.permission).toBe('system.shell')
      expect(first.closeResources).toEqual(expect.any(Function))
      expect(first.activation).toMatchObject({ activationGeneration: 1, key: 'snipaste-key-1' })
      await expect(first.closeResources?.()).resolves.toBeUndefined()
      expect(closes[0]).toHaveBeenCalledOnce()

      await expect(plugin.disable()).resolves.toBe(true)
      await expect(plugin.enable()).resolves.toBe(true)
      const second = vi.mocked(runtime.startActivation).mock
        .calls[1]?.[0] as unknown as PluginRuntimeActivationOptions
      expect(second.activation).toMatchObject({ activationGeneration: 2, key: 'snipaste-key-2' })
      expect(factory).toHaveBeenCalledTimes(2)
      expect(factory.mock.calls[0]?.[0]).not.toEqual(factory.mock.calls[1]?.[0])
    } finally {
      fse.removeSync(root)
    }
  })

  it('loads a declared canonical build artifact instead of a stale root projection', async () => {
    const root = fse.mkdtempSync(path.join(os.tmpdir(), 'tuff-prelude-canonical-'))
    try {
      fse.ensureDirSync(path.join(root, 'index'))
      fse.ensureDirSync(path.join(root, 'dist', 'build'))
      fse.writeFileSync(path.join(root, 'index', 'main.ts'), 'module.exports = {}')
      fse.writeFileSync(path.join(root, 'index.js'), 'module.exports = { stale: true }')
      const canonicalScript = 'module.exports = { onInit() { return "canonical" } }'
      fse.writeFileSync(path.join(root, 'dist', 'build', 'index.js'), canonicalScript)
      fse.writeJsonSync(path.join(root, 'dist', 'build', 'manifest.json'), {
        _files: {
          'index.js': `sha256-${createHash('sha256').update(canonicalScript).digest('hex')}`
        }
      })
      const runtime = createRuntimeServiceMock()
      TouchPlugin.setTransport({
        broadcast: vi.fn(),
        invoke: vi.fn().mockResolvedValue(undefined),
        keyManager: {
          requestKey: vi.fn(() => 'canonical-key'),
          revokeKey: vi.fn(() => true)
        },
        sendToPlugin: vi.fn().mockResolvedValue(undefined)
      } as unknown as ITuffTransportMain)
      TouchPlugin.setRuntimeService(runtime as never)
      const plugin = new TouchPlugin(
        'clipboard-history',
        { type: 'class', value: 'i-ri-test-tube-line' },
        '1.0.0',
        'desc',
        '',
        { enable: false, address: '' },
        root,
        {},
        { skipDataInit: true }
      )
      plugin.setPreludeContract({ buildIndexEntry: 'index/main.ts' })

      await expect(plugin.enable()).resolves.toBe(true)
      expect(runtime.startActivation).toHaveBeenCalledWith(
        expect.objectContaining({
          scriptContent: 'module.exports = { onInit() { return "canonical" } }'
        })
      )
    } finally {
      fse.removeSync(root)
    }
  })

  it('fails a missing required Prelude build before spawning a runtime', async () => {
    const root = fse.mkdtempSync(path.join(os.tmpdir(), 'tuff-prelude-missing-'))
    try {
      fse.ensureDirSync(path.join(root, 'index'))
      fse.writeFileSync(path.join(root, 'index', 'main.ts'), 'module.exports = {}')
      fse.writeFileSync(path.join(root, 'index.js'), 'module.exports = { stale: true }')
      const runtime = createRuntimeServiceMock()
      const revokeKey = vi.fn(() => true)
      TouchPlugin.setTransport({
        broadcast: vi.fn(),
        invoke: vi.fn().mockResolvedValue(undefined),
        keyManager: {
          requestKey: vi.fn(() => 'missing-build-key'),
          revokeKey
        },
        sendToPlugin: vi.fn().mockResolvedValue(undefined)
      } as unknown as ITuffTransportMain)
      TouchPlugin.setRuntimeService(runtime as never)
      const plugin = new TouchPlugin(
        'clipboard-history',
        { type: 'class', value: 'i-ri-test-tube-line' },
        '1.0.0',
        'desc',
        '',
        { enable: false, address: '' },
        root,
        {},
        { skipDataInit: true }
      )
      plugin.setPreludeContract({ buildIndexEntry: 'index/main.ts' })

      await expect(plugin.enable()).resolves.toBe(false)
      expect(runtime.startActivation).not.toHaveBeenCalled()
      expect(revokeKey).toHaveBeenCalledWith('missing-build-key')
      expect(plugin.issues.at(-1)).toMatchObject({
        code: 'PLUGIN_RUNTIME_PRELUDE_ARTIFACT_MISSING',
        source: 'runtime:activation'
      })
    } finally {
      fse.removeSync(root)
    }
  })

  it('binds feature items to the activation and cleans only the exact owned records', async () => {
    const stored = new Map<string, TuffItem>()
    boxItemManagerMock.get.mockImplementation((id: string) => stored.get(id))
    boxItemManagerMock.batchUpsert.mockImplementation((items: TuffItem[]) => {
      for (const item of items) stored.set(item.id, item)
    })
    boxItemManagerMock.update.mockImplementation((id: string, patch: Partial<TuffItem>) => {
      const current = stored.get(id)
      if (!current) return
      stored.set(id, {
        ...current,
        ...patch,
        source: { ...current.source, ...(patch.source ?? {}) },
        meta: { ...current.meta, ...(patch.meta ?? {}) }
      })
    })
    boxItemManagerMock.delete.mockImplementation((id: string) => {
      stored.delete(id)
    })

    const runtime = createRuntimeServiceMock()
    TouchPlugin.setTransport({
      broadcast: vi.fn(),
      invoke: vi.fn().mockResolvedValue(undefined),
      keyManager: { requestKey: vi.fn(() => 'activation-key-1'), revokeKey: vi.fn(() => true) },
      sendToPlugin: vi.fn().mockResolvedValue(undefined)
    } as unknown as ITuffTransportMain)
    TouchPlugin.setRuntimeService(runtime as never)
    const plugin = new TouchPlugin(
      'owner-plugin',
      { type: 'file', value: '/private/owner-plugin/icon.png' },
      '1.0.0',
      'desc',
      '',
      { enable: false, address: '' },
      '/private/owner-plugin',
      {},
      { skipDataInit: true }
    )

    await expect(plugin.enable()).resolves.toBe(true)
    const startOptions = vi.mocked(runtime.startActivation).mock
      .calls[0]?.[0] as unknown as PluginRuntimeActivationOptions
    expect(JSON.stringify(startOptions.snapshot)).not.toContain('/private/owner-plugin')
    expect(startOptions.snapshot.manifest).not.toHaveProperty('issues')
    expect(startOptions.snapshot.manifest).not.toHaveProperty('key')

    const featureHost = plugin.createBusinessFeatureHost(startOptions.activation)
    const signal = new AbortController().signal

    const item = (id: string) => ({
      id,
      source: { type: 'plugin', id: 'victim-plugin', name: 'victim-plugin' },
      actions: [
        { id: 'copy', type: 'plugin', label: 'Copy', primary: true, payload: { text: 'safe' } }
      ],
      meta: {
        pluginName: 'victim-plugin',
        featureId: 'feature',
        defaultAction: 'copy'
      },
      render: { mode: 'default', basic: { title: id } }
    })

    await expect(
      featureHost.pushItems('active-feature', [item('owned-a'), item('owned-b')], signal)
    ).resolves.toBeUndefined()
    expect(stored.get('owned-a')).toMatchObject({
      source: { type: 'plugin', id: 'plugin-features', name: 'owner-plugin' },
      meta: { pluginName: 'owner-plugin' }
    })

    await expect(
      Promise.resolve(
        featureHost.updateItem(
          'active-feature',
          'owned-a',
          {
            source: { type: 'plugin', id: 'victim-plugin', name: 'victim-plugin' },
            meta: { pluginName: 'victim-plugin' }
          },
          signal
        )
      )
    ).resolves.toBe(true)
    expect(stored.get('owned-a')).toMatchObject({
      source: { type: 'plugin', id: 'plugin-features', name: 'owner-plugin' },
      meta: { pluginName: 'owner-plugin' }
    })

    await expect(Promise.resolve(featureHost.listItems(signal))).resolves.toMatchObject([
      { id: 'owned-a', meta: { pluginName: 'owner-plugin' } },
      { id: 'owned-b', meta: { pluginName: 'owner-plugin' } }
    ])

    stored.set('foreign-id', {
      id: 'foreign-id',
      source: { type: 'plugin', id: 'plugin-features', name: 'victim-plugin' },
      meta: { pluginName: 'victim-plugin' },
      render: { mode: 'default', basic: { title: 'Foreign' } }
    })
    await expect(
      featureHost.pushItems('active-feature', [item('foreign-id')], signal)
    ).rejects.toMatchObject({ code: 'PLUGIN_FEATURE_ITEM_OWNERSHIP_CONFLICT' })
    expect(boxItemManagerMock.batchUpsert).toHaveBeenCalledTimes(1)

    const replacement = { ...stored.get('owned-b')! }
    stored.set('owned-b', replacement)
    await plugin.cleanupBusinessItems(startOptions.activation, ['owned-a', 'owned-b'])

    expect(boxItemManagerMock.delete).toHaveBeenCalledWith('owned-a')
    expect(boxItemManagerMock.delete).not.toHaveBeenCalledWith('owned-b')
    expect(stored.get('owned-b')).toBe(replacement)
  })

  it('atomically transfers item ownership to a newer activation binding', async () => {
    const stored = new Map<string, TuffItem>()
    boxItemManagerMock.get.mockImplementation((id: string) => stored.get(id))
    boxItemManagerMock.batchUpsert.mockImplementation((items: TuffItem[]) => {
      for (const item of items) stored.set(item.id, item)
    })
    boxItemManagerMock.delete.mockImplementation((id: string) => {
      stored.delete(id)
    })
    const plugin = new TouchPlugin(
      'transfer-plugin',
      { type: 'class', value: 'i-ri-test-tube-line' },
      '1.0.0',
      'desc',
      '',
      { enable: false, address: '' },
      '/tmp/transfer-plugin',
      {},
      { skipDataInit: true, runtime: { rootPath: '/tmp/root', mainWindowId: 1 } }
    )
    plugin.status = PluginStatus.ENABLED
    const signal = new AbortController().signal
    const previousActivation = plugin.getActivationIdentity()
    const previousHost = plugin.createBusinessFeatureHost(previousActivation)
    const item = (title: string) => ({
      id: 'shared-item',
      source: { type: 'plugin', id: 'plugin-features' },
      render: { mode: 'default', basic: { title } }
    })

    await previousHost.pushItems('active-feature', [item('generation one')], signal)
    plugin._activationGeneration += 1
    plugin._uniqueChannelKey = 'generation-two-key'
    const currentActivation = plugin.getActivationIdentity()
    const currentHost = plugin.createBusinessFeatureHost(currentActivation)
    await currentHost.pushItems('active-feature', [item('generation two')], signal, [
      { id: 'shared-item', activation: previousActivation }
    ])

    await plugin.cleanupBusinessItems(previousActivation, ['shared-item'])
    expect(stored.get('shared-item')).toMatchObject({
      render: { basic: { title: 'generation two' } }
    })
    expect(boxItemManagerMock.delete).not.toHaveBeenCalledWith('shared-item')
  })

  it('revokes authority before stopping a failed activation and reports only a stable code', async () => {
    const order: string[] = []
    const runtime = createRuntimeServiceMock({
      startActivation: vi.fn(async () => {
        throw Object.assign(new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_LOAD_FAILED'), {
          nativePath: '/private/plugin/index.js',
          activationKey: 'secret-key'
        })
      }),
      stopActivation: vi.fn(async () => {
        order.push('stop')
      })
    })
    const revokeKey = vi.fn(() => {
      order.push('revoke')
      return true
    })
    TouchPlugin.setTransport({
      broadcast: vi.fn(),
      invoke: vi.fn().mockResolvedValue(undefined),
      keyManager: { requestKey: vi.fn(() => 'secret-key'), revokeKey },
      sendToPlugin: vi.fn().mockResolvedValue(undefined)
    } as unknown as ITuffTransportMain)
    TouchPlugin.setRuntimeService(runtime as never)
    const plugin = new TouchPlugin(
      'failed-plugin',
      { type: 'class', value: 'i-ri-test-tube-line' },
      '1.0.0',
      'desc',
      '',
      { enable: false, address: '' },
      '/tmp/missing-failed-plugin',
      {},
      { skipDataInit: true }
    )

    await expect(plugin.enable()).resolves.toBe(false)

    expect(order).toEqual(['revoke', 'stop'])
    expect(plugin.status).toBe(PluginStatus.CRASHED)
    expect(plugin.pluginLifecycle).toBeNull()
    expect(plugin.issues.at(-1)).toMatchObject({
      code: 'PLUGIN_RUNTIME_HOST_LOAD_FAILED',
      source: 'runtime:activation'
    })
    expect(JSON.stringify(plugin.issues.at(-1))).not.toMatch(
      /private\/plugin|secret-key|nativePath|activationKey/
    )
  })

  it('revokes activation authority before awaiting the runtime termination barrier', async () => {
    const order: string[] = []
    const stopBarrier = deferred<void>()
    const runtime = createRuntimeServiceMock({
      stopActivation: vi.fn(() => {
        order.push('stop')
        return stopBarrier.promise
      })
    })
    TouchPlugin.setTransport({
      broadcast: vi.fn(),
      invoke: vi.fn().mockResolvedValue(undefined),
      keyManager: {
        requestKey: vi.fn(() => 'activation-key-1'),
        revokeKey: vi.fn(() => {
          order.push('revoke')
          return true
        })
      },
      sendToPlugin: vi.fn().mockResolvedValue(undefined)
    } as unknown as ITuffTransportMain)
    TouchPlugin.setRuntimeService(runtime as never)
    const plugin = new TouchPlugin(
      'barrier-plugin',
      { type: 'class', value: 'i-ri-test-tube-line' },
      '1.0.0',
      'desc',
      '',
      { enable: false, address: '' },
      '/tmp/missing-barrier-plugin',
      {},
      { skipDataInit: true }
    )
    await plugin.enable()

    let disabled = false
    const disabling = plugin.disable().then((result) => {
      disabled = true
      return result
    })
    await vi.waitFor(() => expect(runtime.stopActivation).toHaveBeenCalledTimes(1))

    expect(order).toEqual(['revoke', 'stop'])
    expect(plugin.status).toBe(PluginStatus.DISABLING)
    expect(disabled).toBe(false)
    expect(runtime.stopActivation).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'barrier-plugin', activationGeneration: 1 }),
      { runDestroy: true }
    )

    stopBarrier.resolve()
    await expect(disabling).resolves.toBe(true)
    expect(plugin.status).toBe(PluginStatus.DISABLED)
    expect(plugin.getActivationIdentity().key).toBe('')
  })

  it('rotates activation metadata across disable and re-enable', async () => {
    const requestKey = vi.fn(
      (
        _pluginName: string,
        activation?: { pluginInstanceId: string; activationGeneration: number }
      ) => `key-${activation?.activationGeneration ?? 0}`
    )
    const revokeKey = vi.fn(() => true)
    const transport = {
      broadcast: vi.fn(),
      invoke: vi.fn().mockResolvedValue(undefined),
      keyManager: { requestKey, revokeKey },
      sendToPlugin: vi.fn().mockResolvedValue(undefined)
    } as unknown as ITuffTransportMain
    TouchPlugin.setTransport(transport)
    TouchPlugin.setRuntimeService(createRuntimeServiceMock() as never)

    const plugin = new TouchPlugin(
      'rotating-plugin',
      { type: 'class', value: 'i-ri-test-tube-line' },
      '1.0.0',
      'desc',
      '',
      { enable: false, address: '' },
      '/tmp/missing-rotating-plugin',
      {},
      { skipDataInit: true }
    )

    await expect(plugin.enable()).resolves.toBe(true)
    const first = plugin.getActivationIdentity()
    await expect(plugin.disable()).resolves.toBe(true)
    expect(plugin.getActivationIdentity()).toMatchObject({
      pluginInstanceId: first.pluginInstanceId,
      activationGeneration: 1,
      key: ''
    })
    await expect(plugin.enable()).resolves.toBe(true)
    const second = plugin.getActivationIdentity()

    expect(first).toMatchObject({ activationGeneration: 1, key: 'key-1' })
    expect(second).toMatchObject({
      pluginInstanceId: first.pluginInstanceId,
      activationGeneration: 2,
      key: 'key-2'
    })
    expect(revokeKey).toHaveBeenCalledWith('key-1')
    expect(requestKey).toHaveBeenNthCalledWith(1, 'rotating-plugin', {
      pluginInstanceId: first.pluginInstanceId,
      activationGeneration: 1
    })
    expect(requestKey).toHaveBeenNthCalledWith(2, 'rotating-plugin', {
      pluginInstanceId: first.pluginInstanceId,
      activationGeneration: 2
    })
  })

  it('handles a runtime crash once and ignores its stale callback after re-enable', async () => {
    let crashCallback: ((diagnostic: { code: 'PLUGIN_RUNTIME_HOST_CRASHED' }) => void) | undefined
    const runtime = createRuntimeServiceMock({
      startActivation: vi.fn(
        async (options: {
          activation: unknown
          onCrash: (diagnostic: { code: 'PLUGIN_RUNTIME_HOST_CRASHED' }) => void
        }) => {
          crashCallback = options.onCrash
          const base = createRuntimeServiceMock()
          return {
            activation: options.activation,
            host: base.host,
            lifecycle: base.lifecycle
          }
        }
      )
    })
    const revokeKey = vi.fn(() => true)
    TouchPlugin.setTransport({
      broadcast: vi.fn(),
      invoke: vi.fn().mockResolvedValue(undefined),
      keyManager: {
        requestKey: vi.fn().mockReturnValueOnce('key-1').mockReturnValueOnce('key-2'),
        revokeKey
      },
      sendToPlugin: vi.fn().mockResolvedValue(undefined)
    } as unknown as ITuffTransportMain)
    TouchPlugin.setRuntimeService(runtime as never)
    const plugin = new TouchPlugin(
      'resource-plugin',
      { type: 'class', value: 'i-ri-test-tube-line' },
      '1.0.0',
      'desc',
      '',
      { enable: false, address: '' },
      '/tmp/missing-resource-plugin',
      {},
      { skipDataInit: true }
    )

    await plugin.enable()
    const staleCrashCallback = crashCallback
    staleCrashCallback?.({ code: 'PLUGIN_RUNTIME_HOST_CRASHED' })

    expect(plugin.status).toBe(PluginStatus.CRASHED)
    expect(plugin.getActivationIdentity().key).toBe('')
    expect(plugin.issues.at(-1)).toMatchObject({
      code: 'PLUGIN_RUNTIME_HOST_CRASHED',
      source: 'runtime:crash'
    })
    expect(JSON.stringify(plugin.issues.at(-1))).not.toMatch(/processId|signal|exitCode/)
    expect(revokeKey).toHaveBeenCalledWith('key-1')

    await expect(plugin.disable()).resolves.toBe(true)
    expect(runtime.stopActivation).not.toHaveBeenCalled()
    expect(plugin.issues).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'PLUGIN_RUNTIME_HOST_STOP_FAILED' })])
    )

    await plugin.enable()
    expect(plugin.status).toBe(PluginStatus.ENABLED)
    expect(plugin.getActivationIdentity()).toMatchObject({
      activationGeneration: 2,
      key: 'key-2'
    })

    staleCrashCallback?.({ code: 'PLUGIN_RUNTIME_HOST_CRASHED' })
    expect(plugin.status).toBe(PluginStatus.ENABLED)
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
