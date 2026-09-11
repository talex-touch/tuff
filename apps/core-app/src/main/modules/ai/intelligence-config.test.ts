import { DEFAULT_CAPABILITIES, IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureIntelligenceConfigLoaded, getCapabilityOptions } from './intelligence-config'
import { tuffIntelligence } from './intelligence-sdk'

const storageMocks = vi.hoisted(() => ({
  storedConfig: undefined as unknown,
  configListeners: new Set<() => void>(),
  getMainConfig: vi.fn(() => storageMocks.storedConfig),
  saveMainConfig: vi.fn(),
  subscribeMainConfig: vi.fn(),
  /** Delivers one config-write notification the way the real storage layer does. */
  emitConfigChanged(): void {
    for (const listener of [...storageMocks.configListeners]) {
      listener()
    }
  }
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
  subscribeMainConfig: (_key: unknown, listener: () => void) => {
    storageMocks.configListeners.add(listener)
    return () => storageMocks.configListeners.delete(listener)
  },
  isMainStorageReady: vi.fn(() => false)
}))

vi.mock('./intelligence-sdk', () => ({
  tuffIntelligence: {
    updateConfig: vi.fn()
  }
}))

const authMocks = vi.hoisted(() => {
  const session = { isSignedIn: false }
  const listeners = new Set<(state: { isSignedIn: boolean }) => void>()
  return {
    session,
    listeners,
    subscribeAuthState: vi.fn(),
    getSanitizedAuthSessionState: vi.fn(() => ({
      isLoaded: true,
      isSignedIn: session.isSignedIn,
      user: null
    })),
    /** Delivers one auth notification the way the real auth module does. */
    emitSignedIn(isSignedIn: boolean): void {
      session.isSignedIn = isSignedIn
      for (const listener of [...listeners]) {
        listener({ isSignedIn })
      }
    }
  }
})

vi.mock('../auth', () => ({
  subscribeAuthState: authMocks.subscribeAuthState,
  getSanitizedAuthSessionState: authMocks.getSanitizedAuthSessionState,
  getAuthToken: vi.fn(() => (authMocks.session.isSignedIn ? 'nexus-access-token' : null))
}))

describe('intelligence-config capability options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storageMocks.storedConfig = undefined
  })

  it('does not enable Nexus by default for a fresh intelligence config', () => {
    ensureIntelligenceConfigLoaded(true)
    const savedConfig = storageMocks.saveMainConfig.mock.calls[0]?.[1] as {
      providers: Array<{ id: string; capabilities?: string[] }>
      capabilities: Record<string, { providers: Array<{ providerId: string }> }>
    }

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

    expect(
      savedConfig.providers.find((provider) => provider.id === 'tuff-nexus-default')?.capabilities
    ).not.toContain('audio.tts')
    expect(
      savedConfig.capabilities['audio.tts']?.providers.map((binding) => binding.providerId)
    ).not.toContain('tuff-nexus-default')
    expect(
      DEFAULT_CAPABILITIES['audio.tts']?.providers.map((binding) => binding.providerId)
    ).not.toContain('tuff-nexus-default')
  })

  it('removes stale Nexus TTS routing from stored configs without dropping valid bindings', () => {
    const survivingTtsBindings = [
      {
        providerId: 'siliconflow-default',
        priority: 1,
        enabled: true,
        models: ['fnlp/MOSS-TTSD-v0.5']
      },
      {
        providerId: 'openai-default',
        priority: 2,
        enabled: false,
        models: ['tts-1', 'tts-1-hd']
      }
    ]
    const unrelatedCapability = {
      id: 'custom.legacy',
      name: 'Legacy capability',
      type: 'custom',
      providers: [{ providerId: 'local-default', priority: 1, enabled: true }]
    }
    const localProvider = {
      id: 'local-default',
      type: IntelligenceProviderType.LOCAL,
      name: 'Local Model',
      enabled: true,
      priority: 3,
      capabilities: ['custom.legacy']
    }

    storageMocks.storedConfig = {
      providers: [
        {
          id: 'tuff-nexus-default',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Tuff Nexus',
          enabled: true,
          priority: 1,
          capabilities: ['text.chat', 'audio.tts'],
          metadata: { origin: 'tuff-nexus' }
        },
        localProvider
      ],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false,
        enableQuota: true
      },
      capabilities: {
        'audio.tts': {
          id: 'audio.tts',
          name: 'Text-to-Speech',
          type: 'tts',
          providers: [
            { providerId: 'tuff-nexus-default', priority: 0, enabled: true },
            ...survivingTtsBindings
          ]
        },
        'custom.legacy': unrelatedCapability
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }

    ensureIntelligenceConfigLoaded(true)

    const savedConfig = storageMocks.saveMainConfig.mock.calls[0]?.[1] as {
      providers: Array<{ id: string; capabilities?: string[] }>
      capabilities: Record<string, { providers: unknown[] }>
    }

    expect(storageMocks.saveMainConfig).toHaveBeenCalledOnce()
    expect(
      savedConfig.providers.find((provider) => provider.id === 'tuff-nexus-default')?.capabilities
    ).not.toContain('audio.tts')
    expect(savedConfig.capabilities['audio.tts']?.providers).toEqual(survivingTtsBindings)
    expect(savedConfig.providers.find((provider) => provider.id === 'local-default')).toEqual(
      localProvider
    )
    expect(savedConfig.capabilities['custom.legacy']).toEqual(unrelatedCapability)
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

  it('migrates persisted Qwen ASR models to the Qwen realtime protocol and model', () => {
    const qwenAsrModels = [
      'qwen-audio-3.0-asr-flash',
      'qwen-audio-3.0-asr-flash-filetrans',
      'qwen3-asr-flash-realtime'
    ]
    const persistedCapabilities = JSON.parse(JSON.stringify(DEFAULT_CAPABILITIES))

    storageMocks.storedConfig = {
      providers: [
        {
          id: 'dashscope-asr',
          type: IntelligenceProviderType.CUSTOM,
          name: 'DashScope Paraformer',
          enabled: true,
          priority: 1,
          capabilities: ['audio.asr'],
          metadata: { voiceAsr: { protocol: 'bailian-paraformer' } }
        }
      ],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false,
        enableQuota: true
      },
      capabilities: {
        ...persistedCapabilities,
        'audio.asr': {
          ...persistedCapabilities['audio.asr'],
          providers: [
            {
              providerId: 'dashscope-asr',
              priority: 1,
              enabled: true,
              models: qwenAsrModels
            }
          ]
        }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }

    ensureIntelligenceConfigLoaded(true)

    const savedConfig = storageMocks.saveMainConfig.mock.calls[0]?.[1] as {
      providers: Array<{ id: string; metadata?: { voiceAsr?: { protocol?: string } } }>
      capabilities: Record<string, { providers: Array<{ providerId: string; models?: string[] }> }>
    }
    const savedProvider = savedConfig.providers.find((provider) => provider.id === 'dashscope-asr')
    const savedAsrBinding = savedConfig.capabilities['audio.asr']?.providers.find(
      (binding) => binding.providerId === 'dashscope-asr'
    )

    expect(savedProvider?.metadata).toEqual({
      voiceAsr: { protocol: 'dashscope-qwen-asr-realtime' }
    })
    expect(savedAsrBinding?.models).toEqual(['qwen3-asr-flash-realtime'])
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

  it('patches persisted configs with missing stable default capabilities without enabling Nexus', () => {
    const capabilityIdsPatchedFromDefaults = [
      'search.semantic',
      'audio.stt',
      'workflow.execute',
      'agent.run'
    ] as const

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
          priority: 2,
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
            { providerId: 'local-default', priority: 2, enabled: true }
          ]
        }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }

    ensureIntelligenceConfigLoaded(true)

    const patchedConfig = storageMocks.storedConfig as {
      providers: Array<{ id: string; enabled?: boolean }>
      capabilities: Record<
        string,
        { id?: string; providers?: Array<{ providerId: string; enabled?: boolean }> }
      >
    }

    for (const capabilityId of capabilityIdsPatchedFromDefaults) {
      expect(
        Object.prototype.hasOwnProperty.call(DEFAULT_CAPABILITIES, capabilityId),
        `${capabilityId} must be registered as a default capability`
      ).toBe(true)
      expect(patchedConfig.capabilities[capabilityId], capabilityId).toMatchObject({
        id: capabilityId
      })
    }

    expect(
      patchedConfig.providers.find((provider) => provider.id === 'tuff-nexus-default')
    ).toMatchObject({
      enabled: false
    })
    expect(patchedConfig.capabilities['text.chat']?.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerId: 'tuff-nexus-default', enabled: false })
      ])
    )
    expect(tuffIntelligence.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({ id: 'tuff-nexus-default', enabled: false })
        ])
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

const NEXUS_PROVIDER_ID = 'tuff-nexus-default'

type StoredBinding = {
  providerId: string
  enabled?: boolean
  priority?: number
  models?: string[]
}

type StoredProvider = {
  id: string
  type?: IntelligenceProviderType
  name?: string
  enabled?: boolean
  priority?: number
  capabilities?: string[]
  metadata?: Record<string, unknown>
}

type StoredConfig = {
  providers: StoredProvider[]
  capabilities: Record<string, { providers?: StoredBinding[] }>
}

/**
 * A guest machine: the user configured a local channel but never signed in to Nexus, so the
 * built-in Nexus provider arrives with `enabled: false` on the sign-in state, not on the fixture.
 */
function createGuestConfig() {
  const providers: StoredProvider[] = [
    {
      id: 'local-default',
      type: IntelligenceProviderType.LOCAL,
      name: 'Local Model',
      enabled: false,
      priority: 9,
      capabilities: ['text.chat']
    }
  ]
  return {
    providers,
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
          { providerId: 'local-default', priority: 9, enabled: false, models: ['llama3.1'] }
        ]
      }
    },
    promptRegistry: [],
    promptBindings: [],
    version: 2
  }
}

function storedConfig(): StoredConfig {
  return storageMocks.storedConfig as StoredConfig
}

/** Every Nexus binding in the persisted config, with the capability it routes. */
function nexusBindings(): Array<{ capabilityId: string; enabled?: boolean }> {
  const config = storedConfig()
  return Object.entries(config.capabilities).flatMap(([capabilityId, capability]) =>
    (capability.providers ?? [])
      .filter((binding) => binding.providerId === NEXUS_PROVIDER_ID)
      .map((binding) => ({ capabilityId, enabled: binding.enabled }))
  )
}

function nexusProviderEnabled(): boolean | undefined {
  return storedConfig().providers.find((provider) => provider.id === NEXUS_PROVIDER_ID)?.enabled
}

/** The persisted override: absent whenever the user never closed the Nexus route. */
function nexusRouteDisabledByUser(): boolean {
  const provider = storedConfig().providers.find((candidate) => candidate.id === NEXUS_PROVIDER_ID)
  return provider?.metadata?.nexusRouteUserDisabled === true
}

/**
 * The user toggles the Nexus channel on the channels page: the provider flag and every Nexus
 * binding move together, and storage announces the write the way the real layer does.
 */
function toggleNexusRouteFromChannelsPage(enabled: boolean, notify = true): void {
  const config = storedConfig()
  const provider = config.providers.find((candidate) => candidate.id === NEXUS_PROVIDER_ID)
  if (provider) provider.enabled = enabled
  for (const capability of Object.values(config.capabilities)) {
    for (const binding of capability.providers ?? []) {
      if (binding.providerId === NEXUS_PROVIDER_ID) binding.enabled = enabled
    }
  }
  if (notify) storageMocks.emitConfigChanged()
}

/**
 * Re-imports the module under test so each case owns the module-level auth baseline
 * (`lastAppliedAuthSignedIn` and the listener teardown) instead of inheriting the previous
 * case's. A static import cannot be reset between cases, so the import is dynamic on purpose.
 */
async function importFreshConfigModule() {
  vi.resetModules()
  const config = await import('./intelligence-config')
  const sdk = await import('./intelligence-sdk')
  return { config, updateConfig: vi.mocked(sdk.tuffIntelligence.updateConfig) }
}

describe('intelligence-config Nexus sign-in activation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.session.isSignedIn = false
    authMocks.listeners.clear()
    storageMocks.configListeners.clear()
    authMocks.subscribeAuthState.mockImplementation(
      (listener: (state: { isSignedIn: boolean }) => void) => {
        authMocks.listeners.add(listener)
        return () => authMocks.listeners.delete(listener)
      }
    )
    storageMocks.storedConfig = createGuestConfig()
  })

  it('leaves the Nexus provider and its bindings disabled on a signed-out cold start', async () => {
    const { config } = await importFreshConfigModule()
    config.ensureIntelligenceConfigLoaded(true)

    expect(nexusBindings().map((binding) => binding.capabilityId)).toEqual(
      expect.arrayContaining(['text.chat', 'audio.stt'])
    )

    storageMocks.saveMainConfig.mockClear()
    config.setupConfigUpdateListener()

    expect(nexusProviderEnabled()).toBe(false)
    expect(nexusBindings().filter((binding) => binding.enabled !== false)).toEqual([])
    expect(storageMocks.saveMainConfig).not.toHaveBeenCalled()
  })

  it('enables the Nexus provider and its bindings when the user signs in', async () => {
    const { config, updateConfig } = await importFreshConfigModule()
    config.ensureIntelligenceConfigLoaded(true)
    config.setupConfigUpdateListener()
    storageMocks.saveMainConfig.mockClear()
    updateConfig.mockClear()

    authMocks.emitSignedIn(true)

    expect(storageMocks.saveMainConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({ id: NEXUS_PROVIDER_ID, enabled: true })
        ]),
        capabilities: expect.objectContaining({
          'text.chat': expect.objectContaining({
            providers: expect.arrayContaining([
              expect.objectContaining({ providerId: NEXUS_PROVIDER_ID, enabled: true })
            ])
          }),
          'audio.stt': expect.objectContaining({
            providers: expect.arrayContaining([
              expect.objectContaining({ providerId: NEXUS_PROVIDER_ID, enabled: true })
            ])
          })
        })
      })
    )
    expect(nexusProviderEnabled()).toBe(true)
    expect(nexusBindings().filter((binding) => binding.enabled !== true)).toEqual([])

    expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({ id: NEXUS_PROVIDER_ID, enabled: true })
        ])
      })
    )
  })

  it('applies enablement from the startup session state without a transition notification', async () => {
    authMocks.session.isSignedIn = true

    const { config } = await importFreshConfigModule()
    config.ensureIntelligenceConfigLoaded(true)
    storageMocks.saveMainConfig.mockClear()

    config.setupConfigUpdateListener()

    expect(storageMocks.saveMainConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({ id: NEXUS_PROVIDER_ID, enabled: true })
        ])
      })
    )
    expect(nexusProviderEnabled()).toBe(true)
    expect(nexusBindings().filter((binding) => binding.enabled !== true)).toEqual([])
  })

  it('takes the Nexus route back off when the user signs out', async () => {
    authMocks.session.isSignedIn = true

    const { config } = await importFreshConfigModule()
    config.ensureIntelligenceConfigLoaded(true)
    config.setupConfigUpdateListener()
    expect(nexusProviderEnabled()).toBe(true)

    storageMocks.saveMainConfig.mockClear()

    authMocks.emitSignedIn(false)

    expect(storageMocks.saveMainConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({ id: NEXUS_PROVIDER_ID, enabled: false })
        ])
      })
    )
    expect(nexusProviderEnabled()).toBe(false)
    expect(nexusBindings().filter((binding) => binding.enabled !== false)).toEqual([])
  })

  it('ignores a repeat auth notification so a manually disabled Nexus channel stays off', async () => {
    const { config } = await importFreshConfigModule()
    config.ensureIntelligenceConfigLoaded(true)
    config.setupConfigUpdateListener()
    authMocks.emitSignedIn(true)
    expect(nexusProviderEnabled()).toBe(true)

    // The user turns the Nexus channel off from the channels page in this session.
    const persisted = storedConfig()
    const nexusProvider = persisted.providers.find((provider) => provider.id === NEXUS_PROVIDER_ID)
    if (nexusProvider) nexusProvider.enabled = false
    for (const capability of Object.values(persisted.capabilities)) {
      for (const binding of capability.providers ?? []) {
        if (binding.providerId === NEXUS_PROVIDER_ID) binding.enabled = false
      }
    }
    storageMocks.saveMainConfig.mockClear()

    // A token refresh / profile update repeats the same sign-in state.
    authMocks.emitSignedIn(true)

    expect(storageMocks.saveMainConfig).not.toHaveBeenCalled()
    expect(nexusProviderEnabled()).toBe(false)
  })

  it('leaves other providers and their bindings untouched when Nexus is enabled', async () => {
    const { config } = await importFreshConfigModule()
    config.ensureIntelligenceConfigLoaded(true)

    const localProviderBefore = structuredClone(
      storedConfig().providers.find((provider) => provider.id === 'local-default')
    )
    const localBindingBefore = structuredClone(
      storedConfig().capabilities['text.chat']?.providers?.find(
        (binding) => binding.providerId === 'local-default'
      )
    )
    expect(localProviderBefore).toMatchObject({ enabled: false, priority: 9 })
    expect(localBindingBefore).toMatchObject({ enabled: false, priority: 9 })

    config.setupConfigUpdateListener()
    authMocks.emitSignedIn(true)

    expect(storedConfig().providers.find((provider) => provider.id === 'local-default')).toEqual(
      localProviderBefore
    )
    expect(
      storedConfig().capabilities['text.chat']?.providers?.find(
        (binding) => binding.providerId === 'local-default'
      )
    ).toEqual(localBindingBefore)
  })

  it('records the user closing the route and keeps it closed across sign-out and sign-in', async () => {
    const { config } = await importFreshConfigModule()
    config.ensureIntelligenceConfigLoaded(true)
    config.setupConfigUpdateListener()
    authMocks.emitSignedIn(true)
    expect(nexusProviderEnabled()).toBe(true)

    toggleNexusRouteFromChannelsPage(false)
    expect(nexusRouteDisabledByUser()).toBe(true)

    authMocks.emitSignedIn(false)
    storageMocks.saveMainConfig.mockClear()
    authMocks.emitSignedIn(true)

    // Signing in is what makes the injected token usable; it is not consent to reopen a route the
    // user closed, which is what a plain `enabled: true` on sign-in used to assume.
    expect(nexusProviderEnabled()).toBe(false)
    expect(nexusBindings().filter((binding) => binding.enabled !== false)).toEqual([])
  })

  it('keeps a user-closed route closed when the app restarts signed in', async () => {
    const seeded = createGuestConfig()
    seeded.providers.push({
      id: NEXUS_PROVIDER_ID,
      enabled: false,
      priority: 1,
      capabilities: ['text.chat'],
      metadata: { nexusRouteUserDisabled: true }
    })
    storageMocks.storedConfig = seeded
    authMocks.session.isSignedIn = true

    const { config } = await importFreshConfigModule()
    config.ensureIntelligenceConfigLoaded(true)
    storageMocks.saveMainConfig.mockClear()

    config.setupConfigUpdateListener()

    expect(nexusProviderEnabled()).toBe(false)
    expect(nexusBindings().filter((binding) => binding.enabled !== false)).toEqual([])
    expect(storageMocks.saveMainConfig).not.toHaveBeenCalled()
  })

  it('reopens the route after the user turns it back on', async () => {
    const { config } = await importFreshConfigModule()
    config.ensureIntelligenceConfigLoaded(true)
    config.setupConfigUpdateListener()
    authMocks.emitSignedIn(true)

    toggleNexusRouteFromChannelsPage(false)
    expect(nexusRouteDisabledByUser()).toBe(true)

    toggleNexusRouteFromChannelsPage(true)
    expect(nexusRouteDisabledByUser()).toBe(false)

    authMocks.emitSignedIn(false)
    authMocks.emitSignedIn(true)

    expect(nexusProviderEnabled()).toBe(true)
    expect(nexusBindings().filter((binding) => binding.enabled !== true)).toEqual([])
  })
})

describe('intelligence-config auth listener wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.session.isSignedIn = false
    authMocks.listeners.clear()
    storageMocks.configListeners.clear()
    authMocks.subscribeAuthState.mockImplementation(
      (listener: (state: { isSignedIn: boolean }) => void) => {
        authMocks.listeners.add(listener)
        return () => authMocks.listeners.delete(listener)
      }
    )
    storageMocks.storedConfig = createGuestConfig()
  })

  it('registers the auth listener before reconciling the startup session state', async () => {
    authMocks.session.isSignedIn = true
    const { config } = await importFreshConfigModule()
    config.ensureIntelligenceConfigLoaded(true)
    storageMocks.saveMainConfig.mockClear()
    // Storage is not ready yet, so the startup reconciliation cannot even read the config.
    storageMocks.getMainConfig.mockImplementationOnce(() => {
      throw new Error('main storage is not ready')
    })

    expect(() => config.setupConfigUpdateListener()).not.toThrow()
    expect(authMocks.listeners.size).toBe(1)

    // The transition was never committed, so the next notification retries it instead of the
    // module sitting without a listener and without an applied sign-in.
    authMocks.emitSignedIn(true)

    expect(nexusProviderEnabled()).toBe(true)
    expect(nexusBindings().filter((binding) => binding.enabled !== true)).toEqual([])
  })

  it('does not re-enable the route after a failed reconciliation is retried', async () => {
    const { config } = await importFreshConfigModule()
    config.ensureIntelligenceConfigLoaded(true)
    config.setupConfigUpdateListener()
    storageMocks.getMainConfig.mockImplementationOnce(() => {
      throw new Error('main storage is not ready')
    })
    // A signed-out session that cannot be reconciled yet.
    authMocks.emitSignedIn(false)
    storageMocks.saveMainConfig.mockClear()

    authMocks.emitSignedIn(true)
    toggleNexusRouteFromChannelsPage(false)

    authMocks.emitSignedIn(false)
    authMocks.emitSignedIn(true)

    expect(nexusRouteDisabledByUser()).toBe(true)
    expect(nexusProviderEnabled()).toBe(false)
  })
})
