import {
  DEFAULT_CAPABILITIES,
  DEFAULT_GLOBAL_CONFIG,
  DEFAULT_PROVIDERS
} from '@talex-touch/tuff-intelligence'
import { StorageList } from '@talex-touch/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ensureIntelligenceConfigLoaded,
  ensureNexusAsrRoute,
  setupConfigUpdateListener
} from './intelligence-config'

const NEXUS_PROVIDER_ID = 'tuff-nexus-default'
const USER_DISABLED_KEY = 'nexusAsrRouteUserDisabled'

const storageMocks = vi.hoisted(() => ({
  storedConfig: undefined as unknown,
  configListeners: new Set<() => void>(),
  getMainConfig: vi.fn(() => storageMocks.storedConfig),
  saveMainConfig: vi.fn((_key: unknown, value: unknown) => {
    storageMocks.storedConfig = value
  }),
  subscribeMainConfig: vi.fn((_key: unknown, listener: () => void) => {
    storageMocks.configListeners.add(listener)
    return () => storageMocks.configListeners.delete(listener)
  }),
  /** Delivers one config-write notification the way the real storage layer does. */
  emitConfigChanged(): void {
    for (const listener of [...storageMocks.configListeners]) {
      listener()
    }
  }
}))

const authMocks = vi.hoisted(() => {
  const session = { isSignedIn: true }
  return {
    session,
    subscribeAuthState: vi.fn(() => () => {}),
    getSanitizedAuthSessionState: vi.fn(() => ({
      isLoaded: true,
      isSignedIn: session.isSignedIn,
      user: null
    })),
    getAuthToken: vi.fn(() => (session.isSignedIn ? 'nexus-access-token' : null))
  }
})

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

vi.mock('../auth', () => ({
  subscribeAuthState: authMocks.subscribeAuthState,
  getSanitizedAuthSessionState: authMocks.getSanitizedAuthSessionState,
  getAuthToken: authMocks.getAuthToken
}))

interface TestBinding {
  providerId: string
  models?: string[]
  priority?: number
  enabled?: boolean
}

interface TestProvider {
  id: string
  enabled?: boolean
  capabilities?: string[]
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

interface TestConfig {
  providers: TestProvider[]
  globalConfig: Record<string, unknown>
  capabilities: Record<string, { providers?: TestBinding[]; [key: string]: unknown }>
  promptRegistry: unknown[]
  promptBindings: unknown[]
  version: number
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * Seeds a stored config shaped like one a booted app owns: the module's own startup pass normalizes
 * it first, so any write observed afterwards belongs to the call under test rather than to default
 * patching.
 */
function seedStoredConfig(
  options: {
    nexusEnabled?: boolean
    nexusMetadata?: Record<string, unknown>
    asrProviders?: TestBinding[]
  } = {}
): TestConfig {
  const config = {
    providers: clone(DEFAULT_PROVIDERS),
    globalConfig: clone(DEFAULT_GLOBAL_CONFIG),
    capabilities: clone(DEFAULT_CAPABILITIES),
    promptRegistry: [],
    promptBindings: [],
    version: 2
  } as unknown as TestConfig

  const nexus = config.providers.find((provider) => provider.id === NEXUS_PROVIDER_ID)!
  nexus.enabled = options.nexusEnabled ?? true
  if (options.nexusMetadata) {
    nexus.metadata = { ...(nexus.metadata ?? {}), ...options.nexusMetadata }
  }

  const asrProviders = clone(options.asrProviders ?? [])
  config.capabilities['audio.asr'].providers = asrProviders

  storageMocks.storedConfig = config
  ensureIntelligenceConfigLoaded(true)
  storageMocks.saveMainConfig.mockClear()
  return config
}

/** The single config the code under test persisted, with the storage key it persisted under. */
function singleSavedConfig(): TestConfig {
  expect(storageMocks.saveMainConfig).toHaveBeenCalledTimes(1)
  expect(storageMocks.saveMainConfig.mock.calls[0]?.[0]).toBe(StorageList.IntelligenceConfig)
  return storageMocks.saveMainConfig.mock.calls[0]?.[1] as TestConfig
}

function nexusAsrBinding(config: TestConfig): TestBinding | undefined {
  return config.capabilities['audio.asr']?.providers?.find(
    (binding) => binding.providerId === NEXUS_PROVIDER_ID
  )
}

describe('ensureNexusAsrRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.session.isSignedIn = true
    storageMocks.storedConfig = undefined
  })

  it('binds the first offered pack model to audio.asr', () => {
    seedStoredConfig({ asrProviders: [] })

    ensureNexusAsrRoute(['model-a', 'model-b'])

    const saved = singleSavedConfig()
    expect(saved.capabilities['audio.asr'].providers).toEqual([
      { providerId: NEXUS_PROVIDER_ID, models: ['model-a'], priority: 2, enabled: true }
    ])
  })

  it('appends the binding without disturbing other audio.asr channels, audio.stt or text.chat', () => {
    const existingAsrBindings: TestBinding[] = [
      { providerId: 'tuff-local-asr', models: ['sense-voice-small'], priority: 1, enabled: true },
      {
        providerId: 'siliconflow-default',
        models: ['FunAudioLLM/SenseVoiceSmall'],
        priority: 3,
        enabled: true
      }
    ]
    const seeded = seedStoredConfig({ asrProviders: existingAsrBindings })
    const sttBefore = clone(seeded.capabilities['audio.stt'])
    const chatBefore = clone(seeded.capabilities['text.chat'])

    ensureNexusAsrRoute(['model-a'])

    const saved = singleSavedConfig()
    expect(saved.capabilities['audio.asr'].providers).toEqual([
      ...existingAsrBindings,
      { providerId: NEXUS_PROVIDER_ID, models: ['model-a'], priority: 2, enabled: true }
    ])
    expect(saved.capabilities['audio.stt']).toEqual(sttBefore)
    expect(saved.capabilities['text.chat']).toEqual(chatBefore)
  })

  it('keeps a still-offered model the binding already names', () => {
    seedStoredConfig({
      asrProviders: [
        { providerId: NEXUS_PROVIDER_ID, models: ['model-b'], priority: 2, enabled: true }
      ]
    })

    ensureNexusAsrRoute(['model-a', 'model-b'])

    expect(nexusAsrBinding(storageMocks.storedConfig as TestConfig)?.models).toEqual(['model-b'])
  })

  it('adopts the current pack model when the bound one is no longer offered', () => {
    seedStoredConfig({
      asrProviders: [
        { providerId: NEXUS_PROVIDER_ID, models: ['model-retired'], priority: 2, enabled: true },
        { providerId: 'tuff-local-asr', models: ['sense-voice-small'], priority: 1, enabled: true }
      ]
    })

    ensureNexusAsrRoute(['model-fresh'])

    const saved = singleSavedConfig()
    expect(saved.capabilities['audio.asr'].providers).toEqual([
      { providerId: NEXUS_PROVIDER_ID, models: ['model-fresh'], priority: 2, enabled: true },
      { providerId: 'tuff-local-asr', models: ['sense-voice-small'], priority: 1, enabled: true }
    ])
  })

  it.each([
    {
      name: 'the account is signed out',
      signedIn: false,
      seed: { nexusEnabled: true },
      models: ['model-a']
    },
    {
      name: 'the Nexus provider is disabled',
      signedIn: true,
      seed: { nexusEnabled: false },
      models: ['model-a']
    },
    {
      name: 'the user closed the route',
      signedIn: true,
      seed: { nexusEnabled: true, nexusMetadata: { [USER_DISABLED_KEY]: true } },
      models: ['model-a']
    },
    {
      name: 'the pack offers no model',
      signedIn: true,
      seed: { nexusEnabled: true },
      models: [] as string[]
    }
  ])('writes nothing when $name', ({ signedIn, seed, models }) => {
    authMocks.session.isSignedIn = signedIn
    seedStoredConfig(seed)

    ensureNexusAsrRoute(models)

    expect(storageMocks.saveMainConfig).not.toHaveBeenCalled()
  })

  it('writes once for repeated syncs of the same pack', () => {
    seedStoredConfig({ asrProviders: [] })

    ensureNexusAsrRoute(['model-a', 'model-b'])
    expect(storageMocks.saveMainConfig).toHaveBeenCalledTimes(1)

    ensureNexusAsrRoute(['model-a', 'model-b'])
    expect(storageMocks.saveMainConfig).toHaveBeenCalledTimes(1)
  })

  it('records the user switching the route off and keeps later syncs out', () => {
    setupConfigUpdateListener()
    seedStoredConfig({ asrProviders: [] })

    ensureNexusAsrRoute(['model-a'])
    expect(nexusAsrBinding(singleSavedConfig())?.enabled).toBe(true)
    storageMocks.saveMainConfig.mockClear()

    // The channels page switches the route off out-of-band: the disabled binding it writes is the
    // only thing the module can observe from a config notification.
    const liveConfig = storageMocks.storedConfig as TestConfig
    nexusAsrBinding(liveConfig)!.enabled = false
    storageMocks.emitConfigChanged()

    const saved = singleSavedConfig()
    expect(
      saved.providers.find((provider) => provider.id === NEXUS_PROVIDER_ID)?.metadata?.[
        USER_DISABLED_KEY
      ]
    ).toBe(true)
    expect(nexusAsrBinding(saved)?.enabled).toBe(false)

    storageMocks.saveMainConfig.mockClear()
    ensureNexusAsrRoute(['model-a'])
    expect(storageMocks.saveMainConfig).not.toHaveBeenCalled()
    expect(nexusAsrBinding(storageMocks.storedConfig as TestConfig)?.enabled).toBe(false)
  })
})
