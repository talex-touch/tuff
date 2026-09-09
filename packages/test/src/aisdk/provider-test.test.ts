import type {
  IntelligenceProviderAdapter,
  IntelligenceProviderConfig,
  IntelligenceProviderManagerAdapter,
} from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { describe, expect, it, vi } from 'vitest'
import { setIntelligenceProviderManager, tuffIntelligence } from '../../../../apps/core-app/src/main/modules/ai/intelligence-sdk'

// This file's subject is the intelligence SDK, but importing it pulls in the
// main-process bootstrap, which touches a wide slice of electron at module scope.
// The stub that `electron` is aliased to throws by name on any unmocked surface,
// which is the right default for a suite that means to assert electron behaviour
// and the wrong one here: the boot path would have to be enumerated call by call,
// and every future addition to it would break this file for no reason related to
// what it tests.
//
// So the app-boot surfaces get a permissive auto-stub -- unknown members are
// no-op functions -- while the handful of values the bootstrap actually reads are
// given real answers. importOriginal is spread underneath so the surfaces nothing
// here touches stay throwers rather than becoming undefined, which vitest rejects
// outright when a factory omits an export.
function autoStub(overrides: Record<string, unknown> = {}): any {
  return new Proxy(overrides, {
    get: (target, key) => key in target ? (target as any)[key] : () => undefined,
  })
}

vi.mock('electron', async importOriginal => ({
  ...(await importOriginal<typeof import('electron')>()),
  app: autoStub({
    isPackaged: false,
    getPath: (name: string) => `/tmp/tuff-test/${name}`,
    getLocale: () => 'en-US',
    getVersion: () => '0.0.0-test',
    getName: () => 'tuff-test',
    requestSingleInstanceLock: () => true,
    whenReady: async () => {},
    commandLine: autoStub({ hasSwitch: () => false }),
  }),
  ipcMain: autoStub(),
  crashReporter: autoStub(),
  powerMonitor: autoStub(),
  protocol: autoStub(),
  nativeTheme: autoStub({ shouldUseDarkColors: false }),
  session: autoStub({ defaultSession: autoStub({ webRequest: autoStub() }) }),
  BrowserWindow: autoStub({ getAllWindows: () => [] }),
}))

vi.mock('@sentry/electron/main', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  setUser: vi.fn(),
  withScope: vi.fn((fn: (scope: unknown) => void) =>
    fn({ setTag: vi.fn(), setContext: vi.fn(), setUser: vi.fn() }),
  ),
  getCurrentScope: vi.fn(() => ({ setTag: vi.fn(), setContext: vi.fn(), setUser: vi.fn() })),
  flush: vi.fn(async () => true),
}))

const SYNTHETIC_TEST_MODEL = 'synthetic-test-model'
const unexpectedChatProbe: IntelligenceProviderAdapter['chat'] = async () => {
  throw new Error('chat probe must not be dispatched')
}

function setMockProviderManager(chatImpl: IntelligenceProviderAdapter['chat']) {
  const chat = vi.fn(chatImpl)
  // The test surface only invokes chat; the adapter has no smaller public probe type.
  const provider = { chat } as unknown as IntelligenceProviderAdapter
  const manager: IntelligenceProviderManagerAdapter = {
    clear: () => {},
    registerFromConfig: () => provider,
    getEnabled: () => [],
    get: () => provider,
    createProviderInstance: () => provider,
  }
  setIntelligenceProviderManager(manager)
  return chat
}

describe('tuffIntelligence Provider Testing Service', () => {
  it('rejects a disabled provider without dispatching a chat probe', async () => {
    const chat = setMockProviderManager(unexpectedChatProbe)
    const disabledProvider: IntelligenceProviderConfig = {
      id: 'test-disabled',
      type: IntelligenceProviderType.OPENAI,
      name: 'Test Disabled',
      enabled: false,
      apiKey: 'test-key',
    }

    const result = await tuffIntelligence.testProvider(disabledProvider)

    expect(result.success).toBe(false)
    expect(chat).not.toHaveBeenCalled()
  })

  it('rejects a credential-less non-local provider without dispatching a chat probe', async () => {
    const chat = setMockProviderManager(unexpectedChatProbe)
    const providerWithoutKey: IntelligenceProviderConfig = {
      id: 'test-no-key',
      type: IntelligenceProviderType.OPENAI,
      name: 'Test No Key',
      enabled: true,
    }

    const result = await tuffIntelligence.testProvider(providerWithoutKey)

    expect(result.success).toBe(false)
    expect(chat).not.toHaveBeenCalled()
  })

  it('fails a pending configured-provider probe at its timeout deadline', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    try {
      const { promise } = Promise.withResolvers<never>()
      const chat = setMockProviderManager(async () => promise)
      const timeout = 10
      const timeoutProvider: IntelligenceProviderConfig = {
        id: 'test-timeout',
        type: IntelligenceProviderType.OPENAI,
        name: 'Test Timeout',
        enabled: true,
        apiKey: 'test-key',
        models: [SYNTHETIC_TEST_MODEL],
        timeout,
      }

      const pendingResult = tuffIntelligence.testProvider(timeoutProvider)
      let completed = false
      void pendingResult.then(() => {
        completed = true
      })

      expect(chat).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(timeout - 1)
      expect(completed).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      const result = await pendingResult

      expect(result.success).toBe(false)
      expect(result.latency).toBe(timeout)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('reports elapsed latency when a configured provider fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    try {
      const delay = 10
      const { promise, resolve } = Promise.withResolvers<void>()
      const chat = setMockProviderManager(async () => {
        setTimeout(resolve, delay)
        await promise
        throw new Error('network error')
      })
      const provider: IntelligenceProviderConfig = {
        id: 'test-latency',
        type: IntelligenceProviderType.OPENAI,
        name: 'Test Latency',
        enabled: true,
        apiKey: 'invalid-key',
        models: [SYNTHETIC_TEST_MODEL],
        timeout: 5000,
      }

      const pendingResult = tuffIntelligence.testProvider(provider)
      expect(chat).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(delay)
      const result = await pendingResult

      expect(result).toMatchObject({ success: false, latency: delay })
    }
    finally {
      vi.useRealTimers()
    }
  })
})
