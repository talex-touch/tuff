import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  __esModule: true,
  app: {
    commandLine: { appendSwitch: vi.fn() },
    getAppPath: vi.fn(() => '/tmp/tuff-test-app'),
    getLocale: vi.fn(() => 'zh-CN'),
    getPath: vi.fn(() => '/tmp/tuff-test'),
    getVersion: vi.fn(() => '0.0.0-test'),
    isPackaged: false,
    setPath: vi.fn(),
    userAgentFallback: ''
  },
  BrowserWindow: {
    fromId: vi.fn(() => null)
  },
  clipboard: {},
  dialog: {},
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
    on: vi.fn()
  },
  MessageChannelMain: class MessageChannelMain {
    port1 = {
      close: vi.fn(),
      on: vi.fn(),
      postMessage: vi.fn(),
      start: vi.fn()
    }

    port2 = {
      close: vi.fn(),
      on: vi.fn(),
      postMessage: vi.fn(),
      start: vi.fn()
    }
  },
  crashReporter: {
    start: vi.fn()
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
    showItemInFolder: vi.fn()
  }
}))

vi.mock('talex-mica-electron', () => ({
  IS_WINDOWS_11: false,
  WIN10: false,
  MicaBrowserWindow: class MicaBrowserWindow {},
  useMicaElectron: vi.fn()
}))

vi.mock('@sentry/electron/main', () => ({
  __esModule: true,
  init: vi.fn(),
  setContext: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  withScope: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn()
}))

vi.mock('../../core/precore', () => ({
  innerRootPath: '/tmp/tuff-sync-test'
}))

vi.mock('../plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: []
  }
}))

vi.mock('../storage', async () => {
  const { appSettingOriginData } =
    await import('@talex-touch/utils/common/storage/entity/app-settings')
  const appSetting = structuredClone(appSettingOriginData)

  return {
    getConfig: vi.fn(() => ({})),
    getMainConfig: vi.fn(() => appSetting),
    saveConfig: vi.fn(),
    saveMainConfig: vi.fn((_key: string, value: unknown) => {
      Object.assign(appSetting, value)
    }),
    storageModule: {
      subscribe: vi.fn(() => vi.fn())
    },
    subscribeMainConfig: vi.fn(() => vi.fn())
  }
})

import { __syncMigrationTestHooks } from './index'

describe('sync b64 migration payload repush marker', () => {
  afterEach(() => {
    __syncMigrationTestHooks.resetDirtyStateForTest()
  })

  it('marks b64 migration reads dirty and schedules an encrypted repush', () => {
    __syncMigrationTestHooks.resetDirtyStateForTest()

    __syncMigrationTestHooks.markB64PayloadAppliedForTest('app-setting')

    expect(__syncMigrationTestHooks.isDirtyForTest('app-setting')).toBe(true)
    expect(__syncMigrationTestHooks.hasScheduledPushForTest()).toBe(true)
  })
})
