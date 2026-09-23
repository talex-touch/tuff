import {
  DEFAULT_CAPABILITIES,
  DEFAULT_GLOBAL_CONFIG,
  DEFAULT_PROVIDERS
} from '@talex-touch/tuff-intelligence'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const NEXUS_PROVIDER_ID = 'tuff-nexus-default'
const ROUTE_OVERRIDE_KEY = 'nexusRouteUserDisabled'

interface StoredBinding {
  providerId: string
  enabled?: boolean
  priority?: number
  models?: string[]
}

interface StoredProvider {
  id: string
  enabled?: boolean
  capabilities?: string[]
  metadata?: Record<string, unknown>
}

interface StoredConfig {
  providers: StoredProvider[]
  globalConfig: Record<string, unknown>
  capabilities: Record<string, { providers?: StoredBinding[] }>
  promptRegistry: unknown[]
  promptBindings: unknown[]
  version: number
}

/**
 * The storage layer in miniature, faithful to the two behaviours this file turns on:
 *
 * - readers get a detached copy, so the module's edits only reach storage through a save;
 * - `saveConfig` drops unchanged content silently and, on a real change, commits before notifying
 *   subscribers *synchronously* — for the module's own writes exactly as for the user's.
 *
 * Delivering that notification from the layer rather than from the test is the point: the defect
 * this file guards only exists because a save of ours notifies us back.
 */
const storageMocks = vi.hoisted(() => {
  // `vi.hoisted` runs above every module-scope declaration, so this cannot be shared with the
  // fixture helpers further down; both round-trip plain JSON, which is all this file holds.
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

  let snapshot: StoredConfig | undefined
  /** Serialized form of the last content this layer acknowledged, for its write dedup. */
  let acknowledged: string | null = null
  let commits = 0
  const listeners = new Set<() => void>()

  const layer = {
    configListeners: listeners,
    getMainConfig: vi.fn(() => (snapshot === undefined ? undefined : clone(snapshot))),
    saveMainConfig: vi.fn((_key: unknown, value: StoredConfig) => {
      layer.commit(value)
    }),
    subscribeMainConfig: vi.fn((_key: unknown, listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }),
    /** Commits and announces a change the way `StorageModule.saveConfig` does. */
    commit(value: StoredConfig): void {
      const serialized = JSON.stringify(value)
      if (serialized === acknowledged) return
      acknowledged = serialized
      snapshot = clone(value)
      commits += 1
      for (const listener of [...listeners]) listener()
    },
    /** The document a previous launch left behind, without announcing a change. */
    seed(config: StoredConfig): void {
      snapshot = clone(config)
      acknowledged = JSON.stringify(snapshot)
      commits = 0
    },
    /** The user's own write: the channels page persists through this same storage path. */
    writeFromChannelsPage(mutate: (config: StoredConfig) => void): void {
      const next = clone(snapshot)
      mutate(next)
      layer.commit(next)
    },
    persisted(): StoredConfig {
      return clone(snapshot) as StoredConfig
    },
    commitCount(): number {
      return commits
    }
  }
  return layer
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function nexusProvider(config: StoredConfig): StoredProvider | undefined {
  return config.providers.find((provider) => provider.id === NEXUS_PROVIDER_ID)
}

/** Every persisted Nexus binding, with the capability it routes. */
function nexusBindings(config: StoredConfig): Array<{ capabilityId: string; enabled?: boolean }> {
  return Object.entries(config.capabilities).flatMap(([capabilityId, capability]) =>
    (capability.providers ?? [])
      .filter((binding) => binding.providerId === NEXUS_PROVIDER_ID)
      .map((binding) => ({ capabilityId, enabled: binding.enabled }))
  )
}

/** The persisted Nexus binding of one capability, which is what actually routes it. */
function nexusBinding(config: StoredConfig, capabilityId: string): StoredBinding | undefined {
  return config.capabilities[capabilityId]?.providers?.find(
    (binding) => binding.providerId === NEXUS_PROVIDER_ID
  )
}

/** The persisted record that the *user* switched the route off; absent until they do. */
function routeOverridePersisted(config: StoredConfig): boolean {
  return nexusProvider(config)?.metadata?.[ROUTE_OVERRIDE_KEY] === true
}

/** The channels page's own edit: the provider flag and every Nexus binding move together. */
function setStoredRoute(config: StoredConfig, enabled: boolean): void {
  const provider = nexusProvider(config)
  if (provider) provider.enabled = enabled
  for (const capability of Object.values(config.capabilities)) {
    for (const binding of capability.providers ?? []) {
      if (binding.providerId === NEXUS_PROVIDER_ID) binding.enabled = enabled
    }
  }
}

function createStoredConfig(options: { nexusEnabled: boolean; override?: boolean }): StoredConfig {
  const config = {
    providers: clone(DEFAULT_PROVIDERS),
    globalConfig: clone(DEFAULT_GLOBAL_CONFIG),
    capabilities: clone(DEFAULT_CAPABILITIES),
    promptRegistry: [],
    promptBindings: [],
    version: 2
  } as unknown as StoredConfig

  const nexus = nexusProvider(config)
  if (nexus) {
    nexus.enabled = options.nexusEnabled
    if (options.override) {
      nexus.metadata = { ...(nexus.metadata ?? {}), [ROUTE_OVERRIDE_KEY]: true }
    }
  }
  return config
}

/**
 * Re-imports the module under test so each case owns its module-level state — the observed route,
 * the applied auth baseline and the listener teardown — instead of inheriting the previous case's.
 * A static import cannot be reset between cases, so the import is dynamic on purpose.
 */
async function importFreshConfigModule() {
  vi.resetModules()
  return import('./intelligence-config')
}

/**
 * Boots the app on the document a previous launch left behind.
 *
 * The startup pass runs first on a throwaway instance so the stored document already carries the
 * default patching; that way every write a case observes belongs to that case. An open route is
 * one the sign-in mirror opened — provider and every Nexus binding on, no override recorded.
 *
 * The second instance is the one under test: it reads the stored document, which is what sets the
 * baseline the override check compares a later change against, and only then registers the
 * listeners, exactly as the app does.
 */
async function bootApp(options: {
  signedIn: boolean
  route: 'open' | 'closed'
  override?: boolean
}): Promise<void> {
  const startup = await importFreshConfigModule()
  storageMocks.seed(
    createStoredConfig({ nexusEnabled: options.route === 'open', override: options.override })
  )
  startup.ensureIntelligenceConfigLoaded(true)

  const booted = storageMocks.persisted()
  setStoredRoute(booted, options.route === 'open')
  storageMocks.seed(booted)

  authMocks.session.isSignedIn = options.signedIn
  const module = await importFreshConfigModule()
  module.ensureIntelligenceConfigLoaded(true)
  module.setupConfigUpdateListener()
}

describe('Nexus route override ownership', () => {
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
  })

  it('does not record the override when the sign-out mirror is what closes the route', async () => {
    // Auth resolves signed out after the config was already read: the mirror closes the route, and
    // the write it makes comes straight back as a change notification.
    await bootApp({ signedIn: false, route: 'open' })

    const persisted = storageMocks.persisted()
    expect(nexusProvider(persisted)?.enabled).toBe(false)
    expect(routeOverridePersisted(persisted)).toBe(false)
  })

  it('records the override when the channels page closes the route without this module writing it', async () => {
    await bootApp({ signedIn: true, route: 'open' })
    // Nothing to reconcile on an already-open route: the only write below is the user's.
    expect(storageMocks.commitCount()).toBe(0)

    storageMocks.writeFromChannelsPage((stored) => setStoredRoute(stored, false))

    expect(routeOverridePersisted(storageMocks.persisted())).toBe(true)
  })

  it('clears the override when the channels page reopens a route the user had closed', async () => {
    await bootApp({ signedIn: true, route: 'closed', override: true })
    expect(nexusProvider(storageMocks.persisted())?.enabled).toBe(false)

    storageMocks.writeFromChannelsPage((stored) => setStoredRoute(stored, true))

    const persisted = storageMocks.persisted()
    expect(routeOverridePersisted(persisted)).toBe(false)
    expect(nexusProvider(persisted)?.enabled).toBe(true)
  })

  it('opens the provider and its bindings on sign-in when no override is recorded', async () => {
    await bootApp({ signedIn: false, route: 'closed' })

    authMocks.emitSignedIn(true)

    const persisted = storageMocks.persisted()
    expect(nexusProvider(persisted)?.enabled).toBe(true)
    expect(nexusBinding(persisted, 'text.chat')?.enabled).toBe(true)
    expect(nexusBinding(persisted, 'audio.stt')?.enabled).toBe(true)
    expect(nexusBindings(persisted).filter((binding) => binding.enabled !== true)).toEqual([])
    expect(routeOverridePersisted(persisted)).toBe(false)
    expect(storageMocks.commitCount()).toBe(1)
  })

  it('leaves the route closed on sign-in when the override is recorded', async () => {
    await bootApp({ signedIn: false, route: 'closed', override: true })

    authMocks.emitSignedIn(true)

    const persisted = storageMocks.persisted()
    expect(nexusProvider(persisted)?.enabled).toBe(false)
    expect(nexusBindings(persisted).filter((binding) => binding.enabled !== false)).toEqual([])
    expect(routeOverridePersisted(persisted)).toBe(true)
  })
})
