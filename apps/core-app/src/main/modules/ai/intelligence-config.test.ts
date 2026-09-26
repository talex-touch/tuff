import { DEFAULT_CAPABILITIES, IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { getLogger } from '@talex-touch/utils/common/logger'
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

const LOCAL_ASR_PROVIDER_ID = 'tuff-local-asr'
const LOCAL_ASR_MODEL_ID = 'sense-voice-small'
const CLOUD_ASR_PROVIDER_ID = 'custom-cloud-asr'

/**
 * A machine that already routes `audio.asr` through a configured cloud channel: the shape the
 * on-device route used to stay out of, on the assumption that one route was the whole story.
 */
function createCloudAsrConfig() {
  const guest = createGuestConfig()
  const audioAsrProviders: StoredBinding[] = [
    {
      providerId: CLOUD_ASR_PROVIDER_ID,
      priority: 2,
      enabled: true,
      models: ['paraformer-realtime-v2']
    }
  ]
  return {
    ...guest,
    providers: [
      ...guest.providers,
      {
        id: CLOUD_ASR_PROVIDER_ID,
        type: IntelligenceProviderType.CUSTOM,
        name: 'Custom Cloud ASR',
        enabled: true,
        priority: 2,
        capabilities: ['audio.asr'],
        metadata: { voiceAsr: { protocol: 'bailian-paraformer' } }
      }
    ],
    capabilities: {
      ...guest.capabilities,
      'audio.asr': {
        id: 'audio.asr',
        name: 'Realtime ASR',
        type: 'asr',
        providers: audioAsrProviders
      }
    }
  }
}

/** The on-device channel as this module writes it, marker included. */
function localAsrChannel(overrides: Partial<StoredProvider> = {}): StoredProvider {
  return {
    id: LOCAL_ASR_PROVIDER_ID,
    type: IntelligenceProviderType.CUSTOM,
    name: 'Local Speech',
    enabled: true,
    capabilities: ['audio.asr'],
    metadata: { channelType: 'on-device', voiceAsr: { protocol: 'local-offline' } },
    ...overrides
  }
}

function localAsrRouteBinding(): StoredBinding {
  return {
    providerId: LOCAL_ASR_PROVIDER_ID,
    priority: 1,
    enabled: true,
    models: [LOCAL_ASR_MODEL_ID]
  }
}

function localAsrProvider(): StoredProvider | undefined {
  return storedConfig().providers.find((provider) => provider.id === LOCAL_ASR_PROVIDER_ID)
}

function localAsrRoute(): StoredBinding | undefined {
  return storedConfig().capabilities['audio.asr']?.providers?.find(
    (binding) => binding.providerId === LOCAL_ASR_PROVIDER_ID
  )
}

/**
 * Seeds a fixture the way a launch does — config loaded once, listeners live — and clears the write
 * log so a case only observes the writes it causes itself.
 */
async function launchWithConfig(fixture: unknown) {
  storageMocks.storedConfig = fixture
  const imported = await importFreshConfigModule()
  imported.config.ensureIntelligenceConfigLoaded(true)
  imported.config.setupConfigUpdateListener()
  storageMocks.saveMainConfig.mockClear()
  return imported
}

describe('intelligence-config on-device ASR route adoption', () => {
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
    storageMocks.storedConfig = undefined
  })

  it('binds an installed model even while another channel already serves audio.asr', async () => {
    const { config } = await launchWithConfig(createCloudAsrConfig())
    const cloudRouteBefore = structuredClone(
      storedConfig().capabilities['audio.asr']?.providers?.find(
        (binding) => binding.providerId === CLOUD_ASR_PROVIDER_ID
      )
    )
    expect(cloudRouteBefore).toMatchObject({ enabled: true })

    config.ensureLocalAsrRoute([LOCAL_ASR_MODEL_ID])

    expect(storageMocks.saveMainConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({
            id: LOCAL_ASR_PROVIDER_ID,
            enabled: true,
            models: [LOCAL_ASR_MODEL_ID]
          })
        ]),
        capabilities: expect.objectContaining({
          'audio.asr': expect.objectContaining({
            providers: expect.arrayContaining([localAsrRouteBinding()])
          })
        })
      })
    )
    expect(localAsrProvider()).toMatchObject({
      enabled: true,
      capabilities: ['audio.asr'],
      models: [LOCAL_ASR_MODEL_ID]
    })
    expect(localAsrProvider()?.metadata?.voiceAsr).toEqual({ protocol: 'local-offline' })
    expect(localAsrRoute()).toEqual(localAsrRouteBinding())

    // The cloud channel is not asked to make room: same binding, still enabled.
    expect(
      storedConfig().capabilities['audio.asr']?.providers?.find(
        (binding) => binding.providerId === CLOUD_ASR_PROVIDER_ID
      )
    ).toEqual(cloudRouteBefore)
  })

  it('releases the route when the model is gone and binds it again on the next install', async () => {
    const fixture = createCloudAsrConfig()
    fixture.providers.push(localAsrChannel())
    fixture.capabilities['audio.asr'].providers.push(localAsrRouteBinding())
    const { config } = await launchWithConfig(fixture)

    // The launch that finds the model on disk keeps the route.
    config.ensureLocalAsrRoute([LOCAL_ASR_MODEL_ID])
    expect(localAsrRoute()?.enabled).toBe(true)

    // The model is removed: the route stops naming a bundle that is no longer there.
    config.ensureLocalAsrRoute([])

    expect(localAsrRoute()).toBeUndefined()
    expect(storageMocks.saveMainConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        capabilities: expect.objectContaining({
          'audio.asr': expect.objectContaining({
            providers: [expect.objectContaining({ providerId: CLOUD_ASR_PROVIDER_ID })]
          })
        })
      })
    )

    // Storage announces the write the way it announces any other. Releasing the route is this
    // module's own doing, so it must not be recorded as the user closing it — the marker it would
    // write is what keeps the next install from binding again.
    storageMocks.emitConfigChanged()
    expect(localAsrProvider()?.metadata?.localAsrRouteUserDisabled).toBeUndefined()

    config.ensureLocalAsrRoute([LOCAL_ASR_MODEL_ID])
    expect(localAsrRoute()).toEqual(localAsrRouteBinding())
  })

  it('leaves the route closed after the user switched the on-device channel off', async () => {
    const fixture = createCloudAsrConfig()
    fixture.providers.push(localAsrChannel({ metadata: { localAsrRouteUserDisabled: true } }))
    const { config } = await launchWithConfig(fixture)

    config.ensureLocalAsrRoute([LOCAL_ASR_MODEL_ID])

    expect(storageMocks.saveMainConfig).not.toHaveBeenCalled()
    expect(localAsrRoute()).toBeUndefined()
    expect(localAsrProvider()?.metadata?.localAsrRouteUserDisabled).toBe(true)
  })

  it('does not re-enable an on-device channel the user switched off', async () => {
    const fixture = createCloudAsrConfig()
    fixture.providers.push(localAsrChannel({ enabled: false }))
    const { config } = await launchWithConfig(fixture)

    config.ensureLocalAsrRoute([LOCAL_ASR_MODEL_ID])

    expect(storageMocks.saveMainConfig).not.toHaveBeenCalled()
    expect(localAsrRoute()).toBeUndefined()
    expect(localAsrProvider()?.enabled).toBe(false)
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

describe('intelligence-config prompt repair', () => {
  const translateDefault = DEFAULT_CAPABILITIES['text.translate']?.promptTemplate
  const configLog = getLogger('intelligence-config')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(configLog, 'warn').mockImplementation(() => undefined)
  })

  function promptBinding(capabilityId: string) {
    return {
      capabilityId,
      promptId: `capability.${capabilityId}.default`,
      promptVersion: '1.0.0',
      channel: 'stable'
    }
  }

  function promptRecord(capabilityId: string, template: string) {
    return {
      ...promptBinding(capabilityId),
      id: `capability.${capabilityId}.default`,
      version: '1.0.0',
      name: `${capabilityId} prompt`,
      template,
      scope: 'capability',
      status: 'active',
      updatedAt: 1789448376487
    }
  }

  function capabilityWithPrompt(capabilityId: string, promptTemplate: string) {
    return {
      id: capabilityId,
      label: capabilityId,
      providers: [{ providerId: 'local-default', priority: 1, enabled: true }],
      promptTemplate,
      promptBinding: promptBinding(capabilityId)
    }
  }

  function createConfig(prompts: Record<string, string>) {
    return {
      providers: [
        {
          id: 'local-default',
          type: IntelligenceProviderType.LOCAL,
          name: 'Local Model',
          enabled: true,
          priority: 1,
          capabilities: Object.keys(prompts)
        }
      ],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false,
        enableQuota: true
      },
      capabilities: Object.fromEntries(
        Object.entries(prompts).map(([capabilityId, prompt]) => [
          capabilityId,
          capabilityWithPrompt(capabilityId, prompt)
        ])
      ),
      promptRegistry: Object.entries(prompts).map(([capabilityId, prompt]) =>
        promptRecord(capabilityId, prompt)
      ),
      promptBindings: Object.keys(prompts).map(promptBinding),
      version: 2
    }
  }

  type PersistedPrompts = {
    capabilities: Record<string, { promptTemplate?: string; promptBinding?: unknown }>
    promptRegistry: Array<{ id: string; template: string }>
    promptBindings: Array<{ capabilityId?: string } | string>
  }

  function persisted(): PersistedPrompts {
    return storageMocks.storedConfig as PersistedPrompts
  }

  it('restores text.chat and text.translate after each was written with the other id', () => {
    // The dev profile as found on 2026-09-26, prompt registry included.
    storageMocks.storedConfig = createConfig({
      'text.chat': 'text.translate',
      'text.translate': 'text.chat',
      'text.summarize': '用三句话总结下面的内容。'
    })

    ensureIntelligenceConfigLoaded(true)

    // What the model receives: no system prompt for chat, the translation prompt for translation.
    expect(getCapabilityOptions('text.chat').promptTemplate).toBeUndefined()
    expect(getCapabilityOptions('text.translate').promptTemplate).toBe(translateDefault)
    expect(getCapabilityOptions('text.summarize').promptTemplate).toBe('用三句话总结下面的内容。')

    const config = persisted()
    expect(config.capabilities['text.chat']).not.toHaveProperty('promptTemplate')
    expect(config.capabilities['text.translate']?.promptTemplate).toBe(translateDefault)
    // The patch pass also seeds the default capabilities this fixture leaves out, with records.
    const templates = new Map(config.promptRegistry.map((record) => [record.id, record.template]))
    expect(templates.has('capability.text.chat.default')).toBe(false)
    expect(templates.get('capability.text.translate.default')).toBe(translateDefault)
    expect(templates.get('capability.text.summarize.default')).toBe('用三句话总结下面的内容。')
    expect([...templates.values()]).not.toContain('text.chat')
    expect([...templates.values()]).not.toContain('text.translate')
    expect(storageMocks.saveMainConfig).toHaveBeenCalledWith(expect.anything(), config)
    expect(configLog.warn).toHaveBeenCalledOnce()
    expect(configLog.warn).toHaveBeenCalledWith(expect.any(String), {
      capabilities: [
        { capabilityId: 'text.chat', prompt: 'text.translate', restored: 'cleared' },
        { capabilityId: 'text.translate', prompt: 'text.chat', restored: 'default' }
      ],
      droppedPromptRecords: [
        { promptId: 'capability.text.chat.default', template: 'text.translate' },
        { promptId: 'capability.text.translate.default', template: 'text.chat' }
      ]
    })

    // Repaired once: the next load finds nothing to undo.
    vi.mocked(configLog.warn).mockClear()
    ensureIntelligenceConfigLoaded(true)
    expect(configLog.warn).not.toHaveBeenCalled()
  })

  it('treats an id-shaped prompt the same way when no capability carries that id', () => {
    const summarizeDefault = DEFAULT_CAPABILITIES['text.summarize']?.promptTemplate
    // `chat.completion` is a registry alias, never a key of the capability map.
    storageMocks.storedConfig = createConfig({ 'text.summarize': 'chat.completion' })

    ensureIntelligenceConfigLoaded(true)

    expect(persisted().capabilities['text.summarize']?.promptTemplate).toBe(summarizeDefault)
    expect(getCapabilityOptions('text.summarize').promptTemplate).toBe(summarizeDefault)
    expect(configLog.warn).toHaveBeenCalledOnce()
  })

  it('leaves prompts that a person wrote alone', () => {
    const prompts = {
      'text.chat': '像 text.chat 那样回答，但要简短。',
      'text.translate': 'Translate into {{targetLang}}.',
      'text.summarize': '{{text}}',
      'code.explain': 'Explain.'
    }
    storageMocks.storedConfig = createConfig(prompts)

    ensureIntelligenceConfigLoaded(true)

    for (const [capabilityId, prompt] of Object.entries(prompts)) {
      expect(persisted().capabilities[capabilityId]?.promptTemplate).toBe(prompt)
      expect(getCapabilityOptions(capabilityId).promptTemplate).toBe(prompt)
    }
    expect(configLog.warn).not.toHaveBeenCalled()
  })

  /**
   * One binding object in both `promptBindings` and `capability.promptBinding` is what the channel
   * serializer sent as `"[Circular ~…]"` in its second position, which the renderer then saved back.
   */
  it('writes every prompt binding as its own object', () => {
    // text.chat gains a prompt with no binding yet; text.summarize has a binding only in the list.
    storageMocks.storedConfig = {
      ...createConfig({}),
      capabilities: {
        'text.chat': {
          id: 'text.chat',
          label: 'Chat',
          providers: [],
          promptTemplate: '简短地回答。'
        },
        'text.summarize': { id: 'text.summarize', label: 'Summarize', providers: [] }
      },
      promptBindings: [promptBinding('text.summarize')]
    }

    ensureIntelligenceConfigLoaded(true)

    const config = persisted()
    for (const capabilityId of ['text.chat', 'text.summarize']) {
      const listed = config.promptBindings.find(
        (binding) => typeof binding === 'object' && binding.capabilityId === capabilityId
      )
      expect(config.capabilities[capabilityId]?.promptBinding).toEqual(listed)
    }
    // The defaults the patch pass seeds get bindings the same way, so check every capability.
    const listedObjects = new Set<unknown>(config.promptBindings)
    const sharedWithList = Object.entries(config.capabilities)
      .filter(([, capability]) => listedObjects.has(capability.promptBinding))
      .map(([capabilityId]) => capabilityId)
    expect(sharedWithList).toEqual([])
  })

  it('drops the circular placeholders a renderer saved back', () => {
    const listPlaceholder = '[Circular ~root.data.data.capabilities.text.chat.promptBinding]'
    const fieldPlaceholder = '[Circular ~root.data.data.promptBindings[2]]'
    const base = createConfig({ 'text.summarize': '用三句话总结下面的内容。' })
    storageMocks.storedConfig = {
      ...base,
      capabilities: {
        ...base.capabilities,
        'text.chat': {
          id: 'text.chat',
          label: 'Chat',
          providers: [],
          promptBinding: promptBinding('text.chat')
        },
        'text.summarize': {
          ...base.capabilities['text.summarize'],
          promptBinding: fieldPlaceholder
        }
      },
      // As found in the dev profile: the placeholder sits beside the binding it stood for.
      promptBindings: [promptBinding('text.chat'), listPlaceholder, promptBinding('text.summarize')]
    }

    ensureIntelligenceConfigLoaded(true)

    const config = persisted()
    expect(config.promptBindings.filter((binding) => typeof binding === 'string')).toEqual([])
    expect(config.capabilities['text.summarize']?.promptBinding).toEqual(
      promptBinding('text.summarize')
    )
    expect(getCapabilityOptions('text.summarize').promptTemplate).toBe('用三句话总结下面的内容。')
    expect(storageMocks.saveMainConfig).toHaveBeenCalledWith(expect.anything(), config)
    expect(configLog.warn).toHaveBeenCalledOnce()
    expect(configLog.warn).toHaveBeenCalledWith(expect.any(String), {
      dropped: [
        { at: 'promptBindings[1]', placeholder: listPlaceholder },
        { at: 'capabilities.text.summarize.promptBinding', placeholder: fieldPlaceholder }
      ]
    })
  })
})
