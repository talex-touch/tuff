import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
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

function setMockProviderManager(chatImpl: () => Promise<unknown>) {
  const provider = { chat: chatImpl } as any
  setIntelligenceProviderManager({
    clear: () => {},
    registerFromConfig: () => provider,
    getEnabled: () => [],
    get: () => provider,
    createProviderInstance: () => provider,
  } as any)
}

describe('tuffIntelligence Provider Testing Service', () => {
  it('should return error when provider is disabled', async () => {
    const disabledProvider: IntelligenceProviderConfig = {
      id: 'test-disabled',
      type: IntelligenceProviderType.OPENAI,
      name: 'Test Disabled',
      enabled: false,
      apiKey: 'test-key',
    }

    const result = await tuffIntelligence.testProvider(disabledProvider)

    expect(result.success).toBe(false)
    expect(result.message).toBe('Provider is disabled')
    expect(result.timestamp).toBeDefined()
  })

  it('should return error when API key is missing for non-local provider', async () => {
    const providerWithoutKey: IntelligenceProviderConfig = {
      id: 'test-no-key',
      type: IntelligenceProviderType.OPENAI,
      name: 'Test No Key',
      enabled: true,
    }

    const result = await tuffIntelligence.testProvider(providerWithoutKey)

    expect(result.success).toBe(false)
    expect(result.message).toBe('API key is required')
    expect(result.timestamp).toBeDefined()
  })

  it('should handle network errors gracefully', async () => {
    setMockProviderManager(async () => {
      throw new Error('network error')
    })

    const invalidProvider: IntelligenceProviderConfig = {
      id: 'test-invalid',
      type: IntelligenceProviderType.OPENAI,
      name: 'Test Invalid',
      enabled: true,
      apiKey: 'invalid-key',
      baseUrl: 'https://invalid-url-that-does-not-exist.example.com',
      timeout: 5000,
    }

    const result = await tuffIntelligence.testProvider(invalidProvider)

    expect(result.success).toBe(false)
    expect(result.message).toBeDefined()
    expect(result.latency).toBeDefined()
    expect(result.timestamp).toBeDefined()
  })

  it('should handle timeout errors', async () => {
    setMockProviderManager(async () => new Promise(() => {}))

    const timeoutProvider: IntelligenceProviderConfig = {
      id: 'test-timeout',
      type: IntelligenceProviderType.OPENAI,
      name: 'Test Timeout',
      enabled: true,
      apiKey: 'test-key',
      timeout: 10, // Very short timeout to trigger timeout error
    }

    const result = await tuffIntelligence.testProvider(timeoutProvider)

    expect(result.success).toBe(false)
    expect(result.message.toLowerCase()).toContain('timeout')
    expect(result.timestamp).toBeDefined()
  })

  it('should return latency information on failure', async () => {
    setMockProviderManager(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      throw new Error('network error')
    })

    const provider: IntelligenceProviderConfig = {
      id: 'test-latency',
      type: IntelligenceProviderType.OPENAI,
      name: 'Test Latency',
      enabled: true,
      apiKey: 'invalid-key',
      timeout: 5000,
    }

    const result = await tuffIntelligence.testProvider(provider)

    expect(result.latency).toBeDefined()
    expect(typeof result.latency).toBe('number')
    expect(result.latency).toBeGreaterThan(0)
  })
})
