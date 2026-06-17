import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { getCapabilityOptions } from './intelligence-config'

const storageMocks = vi.hoisted(() => ({
  storedConfig: undefined as unknown,
  getMainConfig: vi.fn(() => storageMocks.storedConfig),
  saveMainConfig: vi.fn(),
  subscribeMainConfig: vi.fn()
}))

vi.mock('electron', () => {
  const electronMock = {
    app: {
      commandLine: { appendSwitch: vi.fn() },
      getAppPath: vi.fn(() => '/tmp/app'),
      getPath: vi.fn(() => '/tmp'),
      getVersion: vi.fn(() => '0.0.0-test'),
      isPackaged: false,
      on: vi.fn(),
      once: vi.fn(),
      setAppLogsPath: vi.fn(),
      setPath: vi.fn(),
      whenReady: vi.fn().mockResolvedValue(undefined)
    },
    screen: {
      getPrimaryDisplay: vi.fn()
    },
    crashReporter: {
      start: vi.fn()
    },
    BrowserWindow: class BrowserWindow {},
    Tray: class Tray {},
    Menu: {
      buildFromTemplate: vi.fn(),
      setApplicationMenu: vi.fn()
    },
    nativeImage: {
      createFromPath: vi.fn()
    },
    ipcMain: {
      handle: vi.fn(),
      on: vi.fn(),
      removeHandler: vi.fn()
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
  }
  return {
    ...electronMock,
    default: electronMock
  }
})

vi.mock('@sentry/electron/main', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  setUser: vi.fn(),
  withScope: vi.fn((fn: (scope: unknown) => void) =>
    fn({
      setTag: vi.fn(),
      setContext: vi.fn(),
      setExtra: vi.fn()
    })
  ),
  getCurrentScope: vi.fn(() => ({
    setTag: vi.fn(),
    setContext: vi.fn(),
    setUser: vi.fn()
  })),
  flush: vi.fn(async () => true)
}))

vi.mock('../../core/precore', () => ({
  rootPath: '/tmp/tuff-test',
  innerRootPath: '/tmp/tuff-test'
}))

vi.mock('../storage', () => ({
  getMainConfig: storageMocks.getMainConfig,
  saveMainConfig: storageMocks.saveMainConfig,
  subscribeMainConfig: storageMocks.subscribeMainConfig,
  isMainStorageReady: vi.fn(() => false)
}))

vi.mock('./intelligence-sdk', () => ({
  tuffIntelligence: {
    updateConfig: vi.fn()
  }
}))

describe('intelligence-config capability options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storageMocks.storedConfig = undefined
  })

  it('excludes capability bindings whose provider is disabled', () => {
    storageMocks.storedConfig = {
      providers: [
        {
          id: 'local-default',
          type: IntelligenceProviderType.LOCAL,
          name: 'Local Model',
          enabled: true,
          priority: 1,
          capabilities: ['text.chat']
        },
        {
          id: 'tuff-nexus-default',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Tuff Nexus',
          enabled: false,
          priority: 2,
          capabilities: ['text.chat'],
          metadata: { origin: 'tuff-nexus' }
        }
      ],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false
      },
      capabilities: {
        'text.chat': {
          id: 'text.chat',
          name: 'Chat',
          type: 'chat',
          providers: [
            { providerId: 'tuff-nexus-default', priority: 1, enabled: true },
            { providerId: 'local-default', priority: 2, enabled: true, models: ['llama3.1'] }
          ]
        }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }

    expect(getCapabilityOptions('text.chat')).toMatchObject({
      allowedProviderIds: ['local-default'],
      modelPreference: ['llama3.1']
    })
  })
})
