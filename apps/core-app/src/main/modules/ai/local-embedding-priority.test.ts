import {
  IntelligenceCapabilityType,
  IntelligenceProviderType
} from '@talex-touch/tuff-intelligence'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import { TuffIntelligenceSDK } from './intelligence-sdk'
import { LOCAL_EMBEDDING_MODEL_KEY } from './local-embedding-model'
import { currentEmbeddingPriority, runWithEmbeddingPriority } from './local-embedding-queue'
import { getLocalEmbeddingRuntime } from './local-embedding-runtime'

const { appMock } = vi.hoisted(() => ({
  appMock: {
    commandLine: { appendSwitch: vi.fn() },
    getAppPath: vi.fn(() => '/tmp/app'),
    getPath: vi.fn(() => '/tmp'),
    on: vi.fn(),
    once: vi.fn(),
    setAppLogsPath: vi.fn(),
    setPath: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn(),
    isPackaged: false
  }
}))

vi.mock('electron', () => {
  const electronMock = {
    __esModule: true as const,
    app: appMock,
    BrowserWindow: class BrowserWindow {},
    crashReporter: { start: vi.fn() },
    Tray: class Tray {},
    MessageChannelMain: class MessageChannelMain {
      port1 = { on: vi.fn(), postMessage: vi.fn(), start: vi.fn(), close: vi.fn() }
      port2 = { on: vi.fn(), postMessage: vi.fn(), start: vi.fn(), close: vi.fn() }
    },
    Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
    nativeImage: { createFromPath: vi.fn() },
    ipcMain: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn() }
  }
  return { ...electronMock, default: electronMock }
})

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
  flush: vi.fn(async () => true)
}))

vi.mock('./agents', () => ({
  agentManager: { isInitialized: vi.fn(() => false), executeTaskImmediate: vi.fn() }
}))

afterEach(() => {
  vi.restoreAllMocks()
  intelligenceCapabilityRegistry.clear()
})

describe('embedding priority through the intelligence SDK', () => {
  const image = { path: '/Downloads/IMG_2048.png', mtime: 1_000, size: 68 }

  function sdk(): TuffIntelligenceSDK {
    intelligenceCapabilityRegistry.register({
      id: 'embedding.generate',
      type: IntelligenceCapabilityType.EMBEDDING,
      name: 'Embedding',
      description: 'Priority transport',
      supportedProviders: [IntelligenceProviderType.LOCAL]
    })
    return new TuffIntelligenceSDK({ enableAudit: false, enableQuota: false, enableCache: false })
  }

  it('hands the caller’s priority scope to the local text and image runtime', async () => {
    const seen: string[] = []
    const generation = { vector: [1, 0, 0], modelKey: LOCAL_EMBEDDING_MODEL_KEY }
    const runtime = getLocalEmbeddingRuntime()
    vi.spyOn(runtime, 'generate').mockImplementation(async () => {
      seen.push(`text:${currentEmbeddingPriority()}`)
      return generation
    })
    vi.spyOn(runtime, 'generateImage').mockImplementation(async () => {
      seen.push(`image:${currentEmbeddingPriority()}`)
      return generation
    })
    const embeddings = sdk()
    const text = (): Promise<unknown> =>
      embeddings.embedding.generate(
        { text: '猫' },
        { signal: new AbortController().signal, metadata: { localEmbeddingRuntime: 'llama.cpp' } }
      )

    await runWithEmbeddingPriority('interactive', text)
    await text()
    await runWithEmbeddingPriority('interactive', () =>
      embeddings.embedding.generateLocalImage(image, { signal: new AbortController().signal })
    )
    await embeddings.embedding.generateLocalImage(image, { signal: new AbortController().signal })

    expect(seen).toEqual([
      'text:interactive',
      'text:background',
      'image:interactive',
      'image:background'
    ])
  })
})
