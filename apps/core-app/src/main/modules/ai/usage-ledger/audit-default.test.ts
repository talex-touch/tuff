/**
 * AC-B6: a new profile starts with audit on; a profile that turned it off keeps it off.
 *
 * Drives the real config loader (`ensureIntelligenceConfigLoaded`) against mocked storage, the
 * same way `intelligence-config.test.ts` does.
 */
import { DEFAULT_GLOBAL_CONFIG } from '@talex-touch/utils/types/intelligence'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureIntelligenceConfigLoaded } from '../intelligence-config'
import { tuffIntelligence } from '../intelligence-sdk'

const storageMocks = vi.hoisted(() => ({
  storedConfig: undefined as unknown,
  getMainConfig: vi.fn(() => storageMocks.storedConfig),
  saveMainConfig: vi.fn()
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
    screen: { getPrimaryDisplay: vi.fn() },
    crashReporter: { start: vi.fn() },
    BrowserWindow: class BrowserWindow {},
    Tray: class Tray {},
    Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
    nativeImage: { createFromPath: vi.fn() },
    ipcMain: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn() },
    MessageChannelMain: class MessageChannelMain {}
  }
  return { ...electronMock, default: electronMock }
})

vi.mock('@sentry/electron/main', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  setUser: vi.fn(),
  withScope: vi.fn(),
  getCurrentScope: vi.fn(() => ({ setTag: vi.fn(), setContext: vi.fn(), setUser: vi.fn() })),
  flush: vi.fn(async () => true)
}))

vi.mock('../../../core/precore', () => ({
  rootPath: '/tmp/tuff-test',
  innerRootPath: '/tmp/tuff-test'
}))

vi.mock('../../storage', () => ({
  getMainConfig: storageMocks.getMainConfig,
  saveMainConfig: storageMocks.saveMainConfig,
  subscribeMainConfig: vi.fn(() => () => undefined),
  isMainStorageReady: vi.fn(() => false)
}))

vi.mock('../intelligence-sdk', () => ({
  tuffIntelligence: { updateConfig: vi.fn() }
}))

vi.mock('../../auth', () => ({
  subscribeAuthState: vi.fn(),
  getSanitizedAuthSessionState: vi.fn(() => ({ isLoaded: true, isSignedIn: false, user: null })),
  getAuthToken: vi.fn(() => null)
}))

interface SavedConfig {
  globalConfig: { enableAudit?: boolean }
}

describe('audit default (AC-B6)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storageMocks.storedConfig = undefined
  })

  it('ships audit on for new installs', () => {
    expect(DEFAULT_GLOBAL_CONFIG.enableAudit).toBe(true)
  })

  it('seeds a fresh profile with audit on and runs the SDK with it', () => {
    ensureIntelligenceConfigLoaded(true)

    const seeded = storageMocks.saveMainConfig.mock.calls[0]?.[1] as SavedConfig | undefined
    expect(seeded?.globalConfig.enableAudit).toBe(true)
    expect(tuffIntelligence.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ enableAudit: true })
    )
  })

  it('keeps an existing profile that turned audit off at off', () => {
    storageMocks.storedConfig = {
      providers: [],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: false,
        enableCache: false,
        enableQuota: true
      },
      capabilities: {},
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }

    ensureIntelligenceConfigLoaded(true)

    expect(tuffIntelligence.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ enableAudit: false })
    )
    for (const [, saved] of storageMocks.saveMainConfig.mock.calls) {
      expect((saved as SavedConfig).globalConfig.enableAudit).toBe(false)
    }
  })
})
