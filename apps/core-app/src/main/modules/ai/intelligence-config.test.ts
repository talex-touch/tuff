import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { getCapabilityOptions, ensureIntelligenceConfigLoaded } from './intelligence-config'
import { tuffIntelligence } from './intelligence-sdk'

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

  it('does not enable Nexus by default for a fresh intelligence config', () => {
    ensureIntelligenceConfigLoaded(true)

    expect(storageMocks.saveMainConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({ id: 'tuff-nexus-default', enabled: false })
        ]),
        capabilities: expect.objectContaining({
          'text.chat': expect.objectContaining({
            providers: expect.arrayContaining([
              expect.objectContaining({ providerId: 'tuff-nexus-default', enabled: false })
            ])
          })
        })
      })
    )
  })

  it('does not auto-enable Nexus when patching a config without explicit enabled flags', () => {
    storageMocks.storedConfig = {
      providers: [
        {
          id: 'local-default',
          type: IntelligenceProviderType.LOCAL,
          name: 'Local Model',
          priority: 1,
          capabilities: ['text.chat']
        }
      ],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false,
        enableQuota: true
      },
      capabilities: {},
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }

    ensureIntelligenceConfigLoaded(true)

    expect(storageMocks.saveMainConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({ id: 'tuff-nexus-default', enabled: false })
        ])
      })
    )
    expect(tuffIntelligence.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({ id: 'tuff-nexus-default', enabled: false })
        ])
      })
    )
  })

  it('adds missing Nexus text.chat binding as disabled during config patching', () => {
    storageMocks.storedConfig = {
      providers: [
        {
          id: 'local-default',
          type: IntelligenceProviderType.LOCAL,
          name: 'Local Model',
          enabled: true,
          priority: 1,
          capabilities: ['text.chat']
        }
      ],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false,
        enableQuota: true
      },
      capabilities: {
        'text.chat': {
          id: 'text.chat',
          name: 'Chat',
          type: 'chat',
          providers: [{ providerId: 'local-default', priority: 1, enabled: true }]
        }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }

    ensureIntelligenceConfigLoaded(true)

    expect(storageMocks.saveMainConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        capabilities: expect.objectContaining({
          'text.chat': expect.objectContaining({
            providers: expect.arrayContaining([
              expect.objectContaining({ providerId: 'tuff-nexus-default', enabled: false })
            ])
          })
        })
      })
    )
  })

  it('disables stale Nexus capability bindings when the Nexus provider is disabled', () => {
    storageMocks.storedConfig = {
      providers: [
        {
          id: 'tuff-nexus-default',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Tuff Nexus',
          enabled: false,
          priority: 1,
          capabilities: ['text.chat'],
          metadata: { origin: 'tuff-nexus' }
        },
        {
          id: 'local-default',
          type: IntelligenceProviderType.LOCAL,
          name: 'Local Model',
          enabled: true,
          priority: 1,
          capabilities: ['text.chat']
        }
      ],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false,
        enableQuota: true
      },
      capabilities: {
        'text.chat': {
          id: 'text.chat',
          name: 'Chat',
          type: 'chat',
          providers: [
            { providerId: 'tuff-nexus-default', priority: 1, enabled: true },
            { providerId: 'local-default', priority: 1, enabled: true, models: [] }
          ]
        }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }

    ensureIntelligenceConfigLoaded(true)

    expect(storageMocks.saveMainConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        capabilities: expect.objectContaining({
          'text.chat': expect.objectContaining({
            providers: expect.arrayContaining([
              expect.objectContaining({ providerId: 'tuff-nexus-default', enabled: false }),
              expect.objectContaining({ providerId: 'local-default', enabled: true })
            ])
          })
        })
      })
    )
    expect(getCapabilityOptions('text.chat')).toMatchObject({
      allowedProviderIds: ['local-default']
    })
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

  it('preserves quota enforcement when persisted global config is missing enableQuota', () => {
    storageMocks.storedConfig = {
      providers: [],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false
      },
      capabilities: {},
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }

    ensureIntelligenceConfigLoaded(true)

    expect(tuffIntelligence.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ enableQuota: true })
    )
    expect(storageMocks.saveMainConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        globalConfig: expect.objectContaining({ enableQuota: true })
      })
    )
  })

  it('does not re-enable Nexus when persisted providers are explicitly disabled', () => {
    storageMocks.storedConfig = {
      providers: [
        {
          id: 'local-default',
          type: IntelligenceProviderType.LOCAL,
          name: 'Local Model',
          enabled: false,
          priority: 1,
          capabilities: ['text.chat']
        }
      ],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false,
        enableQuota: true
      },
      capabilities: {
        'text.chat': {
          id: 'text.chat',
          name: 'Chat',
          type: 'chat',
          providers: [{ providerId: 'local-default', priority: 1, enabled: true }]
        }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }

    ensureIntelligenceConfigLoaded(true)

    expect(storageMocks.saveMainConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({ id: 'tuff-nexus-default', enabled: false }),
          expect.objectContaining({ id: 'local-default', enabled: false })
        ])
      })
    )
    expect(tuffIntelligence.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({ id: 'tuff-nexus-default', enabled: false }),
          expect.objectContaining({ id: 'local-default', enabled: false })
        ])
      })
    )
  })

  it('routes vision.ocr through the internal system OCR provider', () => {
    storageMocks.storedConfig = {
      providers: [
        {
          id: 'local-default',
          type: IntelligenceProviderType.LOCAL,
          name: 'Local Model',
          enabled: true,
          priority: 1,
          capabilities: ['text.chat']
        }
      ],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false,
        enableQuota: true
      },
      capabilities: {
        'text.chat': {
          id: 'text.chat',
          name: 'Chat',
          type: 'chat',
          providers: [{ providerId: 'local-default', priority: 1, enabled: true }]
        },
        'vision.ocr': {
          id: 'vision.ocr',
          name: 'OCR',
          type: 'vision',
          providers: [{ providerId: 'tuff-nexus-default', priority: 1, enabled: false }]
        }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }

    ensureIntelligenceConfigLoaded(true)

    expect(tuffIntelligence.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({
            id: 'local-system-ocr',
            enabled: true,
            capabilities: ['vision.ocr']
          })
        ]),
        capabilities: expect.objectContaining({
          'vision.ocr': expect.objectContaining({
            providers: expect.arrayContaining([
              expect.objectContaining({
                providerId: 'local-system-ocr',
                enabled: true,
                models: ['system-ocr']
              })
            ])
          })
        })
      })
    )

    expect(getCapabilityOptions('vision.ocr')).toMatchObject({
      allowedProviderIds: ['local-system-ocr'],
      modelPreference: ['system-ocr']
    })
  })
})
