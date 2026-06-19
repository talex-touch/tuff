import { vi } from 'vitest'
import {
  IntelligenceProviderType,
  type IntelligenceProviderAdapter,
  type IntelligenceProviderConfig,
  type IntelligenceProviderManagerAdapter
} from '@talex-touch/tuff-intelligence'

const storageMocks = vi.hoisted(() => ({
  storedConfig: undefined as unknown,
  getMainConfig: vi.fn(() => storageMocks.storedConfig),
  saveMainConfig: vi.fn(),
  subscribeMainConfig: vi.fn()
}))

export function getStorageMocks() {
  return storageMocks
}

const electronMock = vi.hoisted(() => ({
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
  ['ipc' + 'Main']: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn() },
  powerMonitor: { on: vi.fn(), removeListener: vi.fn() },
  MessageChannelMain: class MessageChannelMain {}
}))

vi.mock('electron', () => ({
  ...electronMock,
  default: electronMock
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true, macOS: false, windows: false, linux: true }
}))

vi.mock('talex-mica-electron', () => ({
  IS_WINDOWS_11: false,
  WIN10: false,
  MicaBrowserWindow: class MicaBrowserWindow {},
  useMicaElectron: vi.fn()
}))

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

export class FakeProviderManager implements IntelligenceProviderManagerAdapter {
  constructor(private readonly providers: IntelligenceProviderAdapter[]) {}
  registerFactory(): void {}
  clear(): void {}
  registerFromConfig(): IntelligenceProviderAdapter {
    throw new Error('not needed')
  }
  createProviderInstance(): IntelligenceProviderAdapter {
    throw new Error('not needed')
  }
  getEnabled(): IntelligenceProviderAdapter[] {
    return this.providers.filter((provider) => provider.isEnabled())
  }
  get(providerId: string): IntelligenceProviderAdapter | undefined {
    return this.providers.find((provider) => provider.getConfig().id === providerId)
  }
}

export function createChatProvider(
  overrides: Partial<IntelligenceProviderConfig>,
  chat: IntelligenceProviderAdapter['chat']
): IntelligenceProviderAdapter {
  const config: IntelligenceProviderConfig = {
    id: 'local-chat',
    type: IntelligenceProviderType.LOCAL,
    name: 'Local Chat',
    enabled: true,
    ...overrides
  }
  return {
    getConfig: () => config,
    updateConfig: vi.fn(),
    isEnabled: () => config.enabled,
    chat,
    chatStream: vi.fn()
  } as unknown as IntelligenceProviderAdapter
}
