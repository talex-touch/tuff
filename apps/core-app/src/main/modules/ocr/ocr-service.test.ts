import { afterEach, describe, expect, it, vi } from 'vitest'

const { ensureAiConfigLoadedMock, getCapabilityOptionsMock, aiInvokeMock } = vi.hoisted(() => ({
  ensureAiConfigLoadedMock: vi.fn(),
  getCapabilityOptionsMock: vi.fn(),
  aiInvokeMock: vi.fn()
}))

vi.mock('electron', () => {
  const electronMock = {
    app: {
      commandLine: { appendSwitch: vi.fn() },
      getAppPath: vi.fn(() => '/tmp/talex-touch'),
      getPath: vi.fn(() => '/tmp/talex-touch'),
      setPath: vi.fn(),
      getName: vi.fn(() => 'Talex Touch'),
      getVersion: vi.fn(() => '0.0.0-test'),
      whenReady: vi.fn(async () => undefined),
      on: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
      quit: vi.fn(),
      isPackaged: false
    },
    clipboard: {},
    dialog: {},
    shell: {},
    crashReporter: {
      start: vi.fn()
    },
    ipcMain: {
      handle: vi.fn(),
      removeHandler: vi.fn(),
      on: vi.fn()
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
    __esModule: true,
    ...electronMock,
    default: electronMock
  }
})

vi.mock('talex-mica-electron', () => ({
  IS_WINDOWS_11: false,
  WIN10: false,
  MicaBrowserWindow: class MicaBrowserWindow {},
  useMicaElectron: vi.fn()
}))

vi.mock('@sentry/electron/main', () => ({
  __esModule: true,
  init: vi.fn(),
  setContext: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  withScope: (callback: (scope: any) => void) =>
    callback({
      setTag: vi.fn(),
      setLevel: vi.fn(),
      setContext: vi.fn()
    }),
  captureMessage: vi.fn(),
  captureException: vi.fn()
}))

vi.mock('../../core', () => ({
  genTouchApp: () => ({ channel: null })
}))

vi.mock('../box-tool/core-box/window', () => ({
  windowManager: {
    getAttachedPlugin: vi.fn(() => null)
  }
}))

vi.mock('../database', () => ({
  databaseModule: {
    getDb: vi.fn(() => null)
  }
}))

vi.mock('../ai/intelligence-config', () => ({
  INTERNAL_SYSTEM_OCR_PROVIDER_ID: 'local-system-ocr',
  ensureAiConfigLoaded: ensureAiConfigLoadedMock,
  getCapabilityOptions: getCapabilityOptionsMock,
  getCapabilityPrompt: vi.fn()
}))

vi.mock('../ai/intelligence-sdk', () => ({
  ai: {
    invoke: aiInvokeMock
  }
}))

import { ocrService } from './ocr-service'

afterEach(() => {
  vi.restoreAllMocks()
  ensureAiConfigLoadedMock.mockReset()
  getCapabilityOptionsMock.mockReset()
  aiInvokeMock.mockReset()
})

describe('OcrService runAgentJob local-first options', () => {
  it('prepends local system OCR provider and model preference', async () => {
    getCapabilityOptionsMock.mockReturnValue({
      allowedProviderIds: ['openai-default', 'anthropic-default'],
      modelPreference: ['gpt-4o']
    })

    aiInvokeMock.mockResolvedValue({
      result: { text: 'hello' },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: 'system-ocr',
      latency: 5,
      traceId: 'trace-id',
      provider: 'local'
    })

    const service = ocrService as any

    vi.spyOn(service, 'updateClipboardMeta').mockResolvedValue(undefined)
    vi.spyOn(service, 'normalizeSourceForAgent').mockResolvedValue({
      type: 'data-url',
      dataUrl: 'data:image/png;base64,AA=='
    })
    vi.spyOn(service, 'buildAgentPrompt').mockReturnValue('prompt-template')
    vi.spyOn(service, 'persistAgentSuccess').mockResolvedValue(undefined)
    vi.spyOn(service, 'deferJob').mockResolvedValue(undefined)
    vi.spyOn(service, 'failJob').mockResolvedValue(undefined)

    await service.runAgentJob(1, {
      id: 1,
      clipboardId: 123,
      payloadHash: 'hash-1',
      meta: JSON.stringify({
        source: { type: 'clipboard' },
        options: { language: 'eng' }
      })
    })

    expect(aiInvokeMock).toHaveBeenCalledOnce()
    const call = aiInvokeMock.mock.calls[0]
    expect(call[0]).toBe('vision.ocr')
    expect(call[2].allowedProviderIds[0]).toBe('local-system-ocr')
    expect(call[2].modelPreference[0]).toBe('system-ocr')
  })
})
