import { StorageList, type AppSetting } from '@talex-touch/utils'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type {
  NativeScreenshotCaptureResult,
  NativeScreenshotDisplay
} from '@talex-touch/utils/transport/events/types'
import type { CoreBoxImageTranslateResponse } from '../../../shared/events/corebox-scenes'
import type { AssistantModule } from './module'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { AppEvents, CoreBoxEvents } from '@talex-touch/utils/transport/events'

type AssistantHandler = (payload: unknown, context: HandlerContext) => unknown | Promise<unknown>

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, AssistantHandler>(),
  copyFile: vi.fn(() => Promise.resolve()),
  showSaveDialog: vi.fn<() => Promise<{ canceled: boolean; filePath?: string }>>(() =>
    Promise.resolve({
      canceled: false,
      filePath: '/tmp/tuff-screenshot.png'
    })
  ),
  createEnabledSetting: (overrides: Partial<AppSetting> = {}): AppSetting =>
    ({
      assistant: {
        enabled: true,
        name: '阿洛 aler',
        identifier: 'aler'
      },
      floatingBall: {
        enabled: true,
        size: 56,
        opacity: 1,
        edgePadding: 24,
        position: {
          x: -1,
          y: -1
        }
      },
      voiceWake: {
        enabled: false,
        wakeWords: ['阿洛', 'aler'],
        language: 'zh-CN',
        continuous: true,
        cooldownMs: 2200,
        openPanelOnWake: true
      },
      setup: {
        microphone: false
      },
      ...overrides
    }) as AppSetting,
  createCaptureResult: (
    overrides: Partial<NativeScreenshotCaptureResult> = {}
  ): NativeScreenshotCaptureResult => ({
    dataUrl: 'data:image/png;base64,c2NyZWVuc2hvdC1pbWFnZQ==',
    mimeType: 'image/png',
    width: 12,
    height: 8,
    displayId: 'display-1',
    displayName: 'Display',
    x: 0,
    y: 0,
    scaleFactor: 2,
    durationMs: 7,
    sizeBytes: 16,
    wroteClipboard: false,
    ...overrides
  }),
  createTranslateSuccess: (): CoreBoxImageTranslateResponse => ({
    success: true,
    translatedImageBase64: 'dHJhbnNsYXRlZA==',
    sourceText: 'hello',
    targetText: '你好'
  }),
  getMainConfig: vi.fn<() => AppSetting>(),
  saveMainConfig: vi.fn(),
  persistMainConfig: vi.fn(() => Promise.resolve()),
  subscribeMainConfig: vi.fn(() => vi.fn()),
  capture: vi.fn<() => Promise<NativeScreenshotCaptureResult>>(),
  listDisplays: vi.fn<() => NativeScreenshotDisplay[]>(),
  getSupport: vi.fn(),
  touchWindows: [] as Array<{
    options: Record<string, unknown>
    window: {
      id: number
      webContents: { id: number }
      destroy: () => void
      hide: () => void
      show: () => void
      focus: () => void
    }
  }>,
  translateImageBase64: vi.fn<() => Promise<CoreBoxImageTranslateResponse>>(),
  translateClipboardImage: vi.fn(),
  ocr: vi.fn(),
  textTranslate: vi.fn(),
  sendTo: vi.fn<
    (target: unknown, event: { toEventName: () => string }, payload: unknown) => Promise<void>
  >(() => Promise.resolve()),
  coreBoxTrigger: vi.fn(),
  updateCoreBoxPosition: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
    child: vi.fn(),
    time: vi.fn(() => ({ end: vi.fn(), split: vi.fn() }))
  }
}))

vi.mock('node:fs/promises', () => ({
  default: {
    copyFile: mocks.copyFile
  }
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    on: vi.fn((event, handler) => {
      mocks.handlers.set(event.toEventName(), handler)
      return vi.fn()
    }),
    broadcastToWindow: vi.fn(),
    sendTo: mocks.sendTo
  }))
}))

vi.mock('electron', () => ({
  dialog: {
    showSaveDialog: mocks.showSaveDialog
  },
  screen: {
    getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })),
    getDisplayNearestPoint: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1440, height: 900 }
    }))
  }
}))

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn(() => mocks.logger)
}))

vi.mock('../../core/runtime-accessor', () => ({
  resolveMainRuntime: vi.fn((ctx) => ({
    app: ctx.app,
    window: ctx.runtime?.window,
    channel: ctx.runtime?.channel,
    transport: null
  }))
}))

vi.mock('../../core/touch-window', () => ({
  TouchWindow: vi.fn((options) => {
    const index = mocks.touchWindows.length
    const touchWindow = {
      options,
      window: {
        id: index + 1,
        webContents: { id: index + 100 },
        setAlwaysOnTop: vi.fn(),
        setVisibleOnAllWorkspaces: vi.fn(),
        setFullScreenable: vi.fn(),
        setSkipTaskbar: vi.fn(),
        setBounds: vi.fn(),
        setOpacity: vi.fn(),
        setPosition: vi.fn(),
        getBounds: vi.fn(() => ({ x: 0, y: 0, width: 56, height: 56 })),
        isVisible: vi.fn(() => false),
        isDestroyed: vi.fn(() => false),
        showInactive: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
        hide: vi.fn(),
        destroy: vi.fn(),
        on: vi.fn()
      },
      loadURL: vi.fn(),
      loadFile: vi.fn()
    }
    mocks.touchWindows.push(touchWindow)
    return touchWindow
  })
}))

vi.mock('../../config/default', () => ({
  AssistantFloatingBallWindowOption: {},
  AssistantRegionSelectorWindowOption: {},
  AssistantVoicePanelWindowOption: {}
}))

vi.mock('../../utils/renderer-url', () => ({
  getCoreBoxRendererPath: vi.fn(() => '/tmp/index.html'),
  getCoreBoxRendererUrl: vi.fn(() => 'http://localhost:5173'),
  isDevMode: vi.fn(() => true)
}))

vi.mock('../storage', () => ({
  getMainConfig: mocks.getMainConfig,
  persistMainConfig: mocks.persistMainConfig,
  saveMainConfig: mocks.saveMainConfig,
  subscribeMainConfig: mocks.subscribeMainConfig
}))

vi.mock('../box-tool/core-box/manager', () => ({
  coreBoxManager: {
    trigger: mocks.coreBoxTrigger
  }
}))

vi.mock('../box-tool/core-box/window', () => ({
  windowManager: {
    getCurScreen: vi.fn(() => ({ id: 'display-1' })),
    current: {
      window: {
        isDestroyed: vi.fn(() => false),
        webContents: { id: 1 }
      }
    },
    updatePosition: mocks.updateCoreBoxPosition
  }
}))

vi.mock('../box-tool/core-box/image-translate', () => {
  const normalizeImageBase64Payload = (value: string): string | null => {
    const trimmed = value.trim()
    if (!trimmed) return null
    const commaIndex = trimmed.indexOf(',')
    const payload =
      trimmed.startsWith('data:image/') && commaIndex >= 0 ? trimmed.slice(commaIndex + 1) : trimmed
    return payload.trim() || null
  }

  return {
    normalizeImageBase64Payload,
    translateClipboardImage: mocks.translateClipboardImage,
    translateImageBase64: mocks.translateImageBase64
  }
})

vi.mock('../ai/intelligence-sdk', () => ({
  tuffIntelligence: {
    vision: {
      ocr: mocks.ocr
    },
    text: {
      translate: mocks.textTranslate
    }
  }
}))

vi.mock('../native-capabilities/screenshot-service', () => ({
  getNativeScreenshotService: vi.fn(() => ({
    capture: mocks.capture,
    getSupport: mocks.getSupport,
    listDisplays: mocks.listDisplays
  }))
}))

async function createInitializedModule(): Promise<{
  handler: AssistantHandler
  module: AssistantModule
}> {
  const { AssistantModule } = await import('./module')
  const module = new AssistantModule()
  await module.onInit({
    app: { channel: {} },
    runtime: { channel: {} },
    file: { dirPath: '/tmp/assistant' }
  } as unknown as Parameters<typeof module.onInit>[0])

  const handler = mocks.handlers.get(AssistantEvents.voice.translateScreenshot.toEventName())
  if (!handler) {
    throw new Error('translateScreenshot handler was not registered')
  }
  return { handler, module }
}

async function createInitializedModuleWithHandler(
  eventName: string,
  mainWindow?: Record<string, unknown>
): Promise<{
  handler: AssistantHandler
  module: AssistantModule
}> {
  const { AssistantModule } = await import('./module')
  const module = new AssistantModule()
  await module.onInit({
    app: { channel: {} },
    runtime: {
      channel: {},
      ...(mainWindow ? { window: { window: mainWindow } } : {})
    },
    file: { dirPath: '/tmp/assistant' }
  } as unknown as Parameters<typeof module.onInit>[0])

  const handler = mocks.handlers.get(eventName)
  if (!handler) {
    throw new Error(`${eventName} handler was not registered`)
  }
  return { handler, module }
}

describe('AssistantModule screenshot translation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mocks.handlers.clear()
    mocks.copyFile.mockClear()
    mocks.showSaveDialog.mockClear()
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/tmp/tuff-screenshot.png'
    })
    mocks.getMainConfig.mockImplementation(() => mocks.createEnabledSetting())
    mocks.persistMainConfig.mockResolvedValue(undefined)
    mocks.capture.mockResolvedValue(mocks.createCaptureResult())
    mocks.listDisplays.mockReturnValue([])
    mocks.getSupport.mockReturnValue({ supported: true, platform: 'darwin' })
    mocks.touchWindows.length = 0
    mocks.ocr.mockReset()
    mocks.textTranslate.mockReset()
    mocks.translateImageBase64.mockResolvedValue(mocks.createTranslateSuccess())
    mocks.sendTo.mockResolvedValue(undefined)
  })

  it('dispatches voice text with an isolated Assistant light-context policy', async () => {
    vi.useFakeTimers()
    const { handler, module } = await createInitializedModuleWithHandler(
      AssistantEvents.voice.submitText.toEventName()
    )

    const result = await handler(
      { text: 'Explain the current task', source: 'voice' },
      {} as HandlerContext
    )
    await vi.advanceTimersByTimeAsync(120)

    expect(result).toEqual({ accepted: true })
    expect(mocks.coreBoxTrigger).toHaveBeenCalledWith(true)
    expect(mocks.sendTo).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({ toEventName: expect.any(Function) }),
      {
        value: 'ai Explain the current task',
        context: {
          entrypoint: {
            id: 'assistant.voice',
            source: 'voice',
            execution: {
              mode: 'new',
              owner: 'assistant',
              scope: 'light',
              objective: 'Assistant voice request',
              isolated: true
            }
          }
        }
      }
    )
    expect(mocks.sendTo.mock.calls[0]?.[1]?.toEventName()).toBe(
      CoreBoxEvents.input.setQuery.toEventName()
    )

    await module.onDestroy({} as never)
    vi.useRealTimers()
  })

  it('opens provider channels from the registered Voice Panel recovery event', async () => {
    const mainWindow = {
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      webContents: { id: 501 }
    }
    const { handler, module } = await createInitializedModuleWithHandler(
      AssistantEvents.voice.openIntelligenceSettings.toEventName(),
      mainWindow
    )
    const openVoicePanel = mocks.handlers.get(
      AssistantEvents.floatingBall.openVoicePanel.toEventName()
    )
    if (!openVoicePanel) {
      throw new Error('openVoicePanel handler was not registered')
    }
    await openVoicePanel({ source: 'provider-recovery' }, {} as HandlerContext)
    const voicePanel = mocks.touchWindows[mocks.touchWindows.length - 1]
    if (!voicePanel) {
      throw new Error('Voice Panel was not opened')
    }

    const result = await handler(undefined, {} as HandlerContext)

    expect(result).toBe(true)
    expect(mainWindow.restore).toHaveBeenCalledTimes(1)
    expect(mainWindow.show).toHaveBeenCalledTimes(1)
    expect(mainWindow.focus).toHaveBeenCalledTimes(1)
    expect(mocks.sendTo).toHaveBeenCalledWith(
      mainWindow.webContents,
      expect.objectContaining({ toEventName: expect.any(Function) }),
      { path: '/intelligence/channels' }
    )
    expect(mocks.sendTo.mock.calls[0]?.[1]?.toEventName()).toBe(
      AppEvents.window.navigate.toEventName()
    )
    expect(voicePanel.window.hide).toHaveBeenCalledTimes(1)

    await module.onDestroy({} as never)
  })

  it('keeps the Voice Panel available when Intelligence navigation delivery fails', async () => {
    mocks.sendTo.mockRejectedValueOnce(new Error('renderer transport unavailable'))
    const mainWindow = {
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => false),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      webContents: { id: 502 }
    }
    const { handler, module } = await createInitializedModuleWithHandler(
      AssistantEvents.voice.openIntelligenceSettings.toEventName(),
      mainWindow
    )
    const openVoicePanel = mocks.handlers.get(
      AssistantEvents.floatingBall.openVoicePanel.toEventName()
    )
    if (!openVoicePanel) {
      throw new Error('openVoicePanel handler was not registered')
    }
    await openVoicePanel({ source: 'provider-recovery' }, {} as HandlerContext)
    const voicePanel = mocks.touchWindows[mocks.touchWindows.length - 1]
    if (!voicePanel) {
      throw new Error('Voice Panel was not opened')
    }

    const result = await handler(undefined, {} as HandlerContext)

    expect(result).toBe(false)
    expect(voicePanel.window.hide).not.toHaveBeenCalled()

    await module.onDestroy({} as never)
  })

  it('returns native screenshot display metadata through the Assistant transport handler', async () => {
    const nativeDisplays: NativeScreenshotDisplay[] = [
      {
        id: 'display-external',
        name: 'External Display',
        friendlyName: 'Studio Display',
        x: 1440,
        y: 0,
        width: 2560,
        height: 1440,
        scaleFactor: 2,
        rotation: 0,
        isPrimary: false
      }
    ]
    mocks.listDisplays.mockReturnValue(nativeDisplays)
    const { handler, module } = await createInitializedModuleWithHandler(
      AssistantEvents.voice.listScreenshotDisplays.toEventName()
    )

    const result = await handler(undefined, {} as HandlerContext)

    expect(result).toEqual(nativeDisplays)
    expect(mocks.listDisplays).toHaveBeenCalledTimes(1)

    await module.onDestroy({} as never)
  })

  it('forwards scene route metadata with a successful translated screenshot response', async () => {
    mocks.translateImageBase64.mockResolvedValue({
      ...mocks.createTranslateSuccess(),
      metadata: {
        runId: 'run-image-translation',
        sceneId: 'corebox.screenshot.translate',
        durationMs: 147,
        stages: [
          {
            capability: 'vision.ocr',
            providerId: 'provider-1',
            providerName: 'Nexus Vision',
            model: 'vision-ocr-v2',
            latencyMs: 17
          }
        ]
      }
    })
    const { handler, module } = await createInitializedModule()

    const result = await handler({ targetLang: 'ja' }, {} as HandlerContext)

    expect(result).toEqual({
      success: true,
      mode: 'translated-image',
      translatedImageBase64: 'dHJhbnNsYXRlZA==',
      sourceText: 'hello',
      targetText: '你好',
      metadata: {
        runId: 'run-image-translation',
        sceneId: 'corebox.screenshot.translate',
        durationMs: 147,
        stages: [
          {
            capability: 'vision.ocr',
            providerId: 'provider-1',
            providerName: 'Nexus Vision',
            model: 'vision-ocr-v2',
            latencyMs: 17
          }
        ]
      }
    })
    expect(mocks.capture).toHaveBeenCalledWith({
      target: 'cursor-display',
      output: 'data-url',
      writeClipboard: false
    })
    expect(mocks.translateImageBase64).toHaveBeenCalledWith('c2NyZWVuc2hvdC1pbWFnZQ==', 'ja', {
      openPinWindow: true
    })
    expect(mocks.ocr).not.toHaveBeenCalled()
    expect(mocks.textTranslate).not.toHaveBeenCalled()

    await module.onDestroy({} as never)
  })

  it('fails closed when the assistant floating ball is disabled', async () => {
    mocks.getMainConfig.mockReturnValue(
      mocks.createEnabledSetting({
        floatingBall: {
          enabled: false,
          size: 56,
          opacity: 1,
          edgePadding: 24,
          position: {
            x: -1,
            y: -1
          }
        }
      })
    )
    const { handler, module } = await createInitializedModule()

    const result = await handler({ targetLang: 'zh' }, {} as HandlerContext)

    expect(result).toMatchObject({
      success: false,
      code: 'ASSISTANT_DISABLED'
    })
    expect(mocks.capture).not.toHaveBeenCalled()
    expect(mocks.translateImageBase64).not.toHaveBeenCalled()

    await module.onDestroy({} as never)
  })

  it('maps native screenshot permission failures to SCREENSHOT_PERMISSION_DENIED', async () => {
    mocks.capture.mockRejectedValue(new Error('Screen recording permission denied'))
    const { handler, module } = await createInitializedModule()

    const result = await handler({ targetLang: 'zh' }, {} as HandlerContext)

    expect(result).toMatchObject({
      success: false,
      code: 'SCREENSHOT_PERMISSION_DENIED',
      error: 'Screen recording permission denied'
    })
    expect(mocks.translateImageBase64).not.toHaveBeenCalled()

    await module.onDestroy({} as never)
  })

  it('maps missing screenshot image payload to SCREENSHOT_UNAVAILABLE', async () => {
    mocks.capture.mockResolvedValue(mocks.createCaptureResult({ dataUrl: undefined }))
    const { handler, module } = await createInitializedModule()

    const result = await handler(undefined, {} as HandlerContext)

    expect(result).toMatchObject({
      success: false,
      code: 'SCREENSHOT_UNAVAILABLE'
    })
    expect(mocks.translateImageBase64).not.toHaveBeenCalled()

    await module.onDestroy({} as never)
  })

  it('preserves semantic scene failures through the Assistant clipboard translation handler', async () => {
    mocks.translateClipboardImage.mockResolvedValue({
      success: false,
      code: 'NEXUS_AUTH_REQUIRED',
      error: 'Nexus provider requires a signed-in account.',
      reason: 'Nexus provider requires a signed-in account.',
      recovery: 'Sign in to Nexus or switch to another enabled provider.'
    })
    const { handler, module } = await createInitializedModuleWithHandler(
      AssistantEvents.voice.translateClipboardImage.toEventName()
    )

    const result = await handler({ targetLang: 'zh' }, {} as HandlerContext)

    expect(result).toEqual({
      success: false,
      code: 'NEXUS_AUTH_REQUIRED',
      error: 'Nexus provider requires a signed-in account.',
      reason: 'Nexus provider requires a signed-in account.',
      recovery: 'Sign in to Nexus or switch to another enabled provider.'
    })

    await module.onDestroy({} as never)
  })

  it('falls back from an unavailable image scene to OCR and text translation with trace metadata', async () => {
    mocks.translateImageBase64.mockResolvedValue({
      success: false,
      code: 'SCENE_UNAVAILABLE',
      error: 'Scene unavailable'
    })
    mocks.ocr.mockResolvedValue({
      result: {
        text: 'Invoice total',
        language: 'en',
        engine: 'cloud'
      },
      provider: 'ocr-provider',
      model: 'ocr-model',
      traceId: 'ocr-trace',
      latency: 17
    })
    mocks.textTranslate.mockResolvedValue({
      result: '合计金额',
      provider: 'translation-provider',
      model: 'translation-model',
      traceId: 'translation-trace',
      latency: 23
    })
    const { handler, module } = await createInitializedModule()

    const result = await handler({ targetLang: 'ja' }, {} as HandlerContext)

    expect(mocks.ocr).toHaveBeenCalledWith(
      {
        source: {
          type: 'data-url',
          dataUrl: 'data:image/png;base64,c2NyZWVuc2hvdC1pbWFnZQ=='
        },
        includeLayout: false,
        includeKeywords: false
      },
      {
        metadata: {
          caller: 'core.assistant.screenshot-translate',
          source: 'assistant-screenshot-ocr-fallback'
        }
      }
    )
    expect(mocks.textTranslate).toHaveBeenCalledWith(
      {
        text: 'Invoice total',
        sourceLang: 'en',
        targetLang: 'ja'
      },
      {
        metadata: {
          caller: 'core.assistant.screenshot-translate',
          source: 'assistant-screenshot-ocr-fallback'
        }
      }
    )
    expect(result).toEqual({
      success: true,
      mode: 'ocr-text',
      sourceText: 'Invoice total',
      targetText: '合计金额',
      fallback: {
        degradedReason: 'IMAGE_TRANSLATE_SCENE_UNAVAILABLE',
        ocr: {
          provider: 'ocr-provider',
          model: 'ocr-model',
          traceId: 'ocr-trace',
          latencyMs: 17,
          engine: 'cloud'
        },
        translation: {
          provider: 'translation-provider',
          model: 'translation-model',
          traceId: 'translation-trace',
          latencyMs: 23
        }
      }
    })

    await module.onDestroy({} as never)
  })

  it('falls back through OCR and text translation after a semantic image scene failure', async () => {
    mocks.translateImageBase64.mockResolvedValue({
      success: false,
      code: 'NEXUS_AUTH_REQUIRED',
      error: 'Nexus provider requires a signed-in account.',
      reason: 'Nexus provider requires a signed-in account.',
      recovery: 'Sign in to Nexus or switch to another enabled provider.'
    })
    mocks.ocr.mockResolvedValue({ result: { text: 'Invoice total', language: 'en' } })
    mocks.textTranslate.mockResolvedValue({ result: '合計金額' })
    const { handler, module } = await createInitializedModule()

    const result = await handler({ targetLang: 'ja' }, {} as HandlerContext)

    expect(result).toMatchObject({
      success: true,
      mode: 'ocr-text',
      sourceText: 'Invoice total',
      targetText: '合計金額',
      fallback: {
        degradedReason: 'IMAGE_TRANSLATE_NEXUS_AUTH_REQUIRED'
      }
    })
    expect(mocks.ocr).toHaveBeenCalledTimes(1)
    expect(mocks.textTranslate).toHaveBeenCalledTimes(1)

    await module.onDestroy({} as never)
  })

  it('returns OCR_UNAVAILABLE without text translation when OCR throws', async () => {
    mocks.translateImageBase64.mockResolvedValue({
      success: false,
      code: 'SCENE_UNAVAILABLE',
      error: 'Scene unavailable'
    })
    mocks.ocr.mockRejectedValue(new Error('OCR provider offline'))
    const { handler, module } = await createInitializedModule()

    const result = await handler({ targetLang: 'zh' }, {} as HandlerContext)

    expect(result).toEqual({
      success: false,
      code: 'OCR_UNAVAILABLE',
      error: 'Screenshot OCR fallback is unavailable.'
    })
    expect(mocks.textTranslate).not.toHaveBeenCalled()

    await module.onDestroy({} as never)
  })

  it('returns semantic Nexus authentication recovery without text translation when OCR fails', async () => {
    mocks.translateImageBase64.mockResolvedValue({
      success: false,
      code: 'SCENE_UNAVAILABLE',
      error: 'Scene unavailable'
    })
    mocks.ocr.mockRejectedValue(new Error('NEXUS_AUTH_REQUIRED'))
    const { handler, module } = await createInitializedModule()

    const result = await handler({ targetLang: 'zh' }, {} as HandlerContext)

    expect(result).toEqual({
      success: false,
      code: 'NEXUS_AUTH_REQUIRED',
      error: 'Nexus provider requires a signed-in account.',
      reason: 'Nexus provider requires a signed-in account.',
      recovery: 'Sign in to Nexus or switch to another enabled provider.'
    })
    expect(mocks.textTranslate).not.toHaveBeenCalled()

    await module.onDestroy({} as never)
  })

  it('returns OCR_UNAVAILABLE without text translation when OCR detects no text', async () => {
    mocks.translateImageBase64.mockResolvedValue({
      success: false,
      code: 'SCENE_UNAVAILABLE',
      error: 'Scene unavailable'
    })
    mocks.ocr.mockResolvedValue({ result: { text: '   ' } })
    const { handler, module } = await createInitializedModule()

    const result = await handler({ targetLang: 'zh' }, {} as HandlerContext)

    expect(result).toEqual({
      success: false,
      code: 'OCR_UNAVAILABLE',
      error: 'Screenshot OCR did not detect translatable text.'
    })
    expect(mocks.textTranslate).not.toHaveBeenCalled()

    await module.onDestroy({} as never)
  })

  it('returns TEXT_TRANSLATE_UNAVAILABLE when text translation throws', async () => {
    mocks.translateImageBase64.mockResolvedValue({
      success: false,
      code: 'SCENE_UNAVAILABLE',
      error: 'Scene unavailable'
    })
    mocks.ocr.mockResolvedValue({ result: { text: 'Detected text' } })
    mocks.textTranslate.mockRejectedValue(new Error('Text provider offline'))
    const { handler, module } = await createInitializedModule()

    const result = await handler({ targetLang: 'zh' }, {} as HandlerContext)

    expect(result).toEqual({
      success: false,
      code: 'TEXT_TRANSLATE_UNAVAILABLE',
      error: 'Screenshot text translation fallback is unavailable.'
    })

    await module.onDestroy({} as never)
  })

  it('returns semantic quota recovery when fallback text translation fails', async () => {
    mocks.translateImageBase64.mockResolvedValue({
      success: false,
      code: 'SCENE_UNAVAILABLE',
      error: 'Scene unavailable'
    })
    mocks.ocr.mockResolvedValue({ result: { text: 'Detected text' } })
    mocks.textTranslate.mockRejectedValue(
      Object.assign(new Error('quota cache read failed'), { code: 'QUOTA_CHECK_UNAVAILABLE' })
    )
    const { handler, module } = await createInitializedModule()

    const result = await handler({ targetLang: 'zh' }, {} as HandlerContext)

    expect(result).toEqual({
      success: false,
      code: 'QUOTA_CHECK_UNAVAILABLE',
      error: 'Quota verification is unavailable, so the request was blocked.',
      reason: 'Quota verification is unavailable, so the request was blocked.',
      recovery: 'Retry after quota storage recovers or inspect Intelligence quota configuration.'
    })

    await module.onDestroy({} as never)
  })

  it('returns TEXT_TRANSLATE_UNAVAILABLE when text translation is empty', async () => {
    mocks.translateImageBase64.mockResolvedValue({
      success: false,
      code: 'SCENE_UNAVAILABLE',
      error: 'Scene unavailable'
    })
    mocks.ocr.mockResolvedValue({ result: { text: 'Detected text' } })
    mocks.textTranslate.mockResolvedValue({ result: '   ' })
    const { handler, module } = await createInitializedModule()

    const result = await handler({ targetLang: 'zh' }, {} as HandlerContext)

    expect(result).toEqual({
      success: false,
      code: 'TEXT_TRANSLATE_UNAVAILABLE',
      error: 'Screenshot text translation returned an empty result.'
    })

    await module.onDestroy({} as never)
  })

  it('captures the cursor display when screenshot selection is omitted', async () => {
    const { handler, module } = await createInitializedModuleWithHandler(
      AssistantEvents.voice.captureScreenshot.toEventName()
    )

    const result = await handler(undefined, {} as HandlerContext)

    expect(result).toEqual({
      success: true,
      dataUrl: 'data:image/png;base64,c2NyZWVuc2hvdC1pbWFnZQ==',
      mimeType: 'image/png',
      width: 12,
      height: 8,
      displayName: 'Display',
      wroteClipboard: false
    })
    expect(mocks.capture).toHaveBeenCalledWith({
      target: 'cursor-display',
      output: 'data-url',
      writeClipboard: true
    })
    expect(mocks.translateImageBase64).not.toHaveBeenCalled()

    await module.onDestroy({} as never)
  })
  it('forwards a selected display to native screenshot capture', async () => {
    const { handler, module } = await createInitializedModuleWithHandler(
      AssistantEvents.voice.captureScreenshot.toEventName()
    )

    await handler({ target: 'display', displayId: 'display-external' }, {} as HandlerContext)

    expect(mocks.capture).toHaveBeenCalledWith({
      target: 'display',
      displayId: 'display-external',
      output: 'data-url',
      writeClipboard: true
    })

    await module.onDestroy({} as never)
  })

  it('maps screenshot capture permission failures to SCREENSHOT_PERMISSION_DENIED', async () => {
    mocks.capture.mockRejectedValue(new Error('Screen recording permission denied'))
    const { handler, module } = await createInitializedModuleWithHandler(
      AssistantEvents.voice.captureScreenshot.toEventName()
    )

    const result = await handler(undefined, {} as HandlerContext)

    expect(result).toMatchObject({
      success: false,
      code: 'SCREENSHOT_PERMISSION_DENIED',
      error: 'Screen recording permission denied'
    })
    expect(mocks.translateImageBase64).not.toHaveBeenCalled()

    await module.onDestroy({} as never)
  })

  it('saves a screenshot through the system save dialog without invoking image translate', async () => {
    mocks.capture.mockResolvedValue(
      mocks.createCaptureResult({
        path: '/tmp/source-screenshot.png',
        dataUrl: undefined,
        sizeBytes: 128
      })
    )
    const { handler, module } = await createInitializedModuleWithHandler(
      AssistantEvents.voice.saveScreenshot.toEventName()
    )

    const result = await handler({ target: 'cursor-display' }, {} as HandlerContext)

    expect(result).toMatchObject({
      success: true,
      path: '/tmp/tuff-screenshot.png',
      mimeType: 'image/png',
      width: 12,
      height: 8,
      displayName: 'Display',
      sizeBytes: 128
    })
    expect(mocks.capture).toHaveBeenCalledWith({
      target: 'cursor-display',
      output: 'tfile',
      writeClipboard: false
    })
    expect(mocks.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Save Screenshot',
        filters: [{ name: 'PNG Image', extensions: ['png'] }]
      })
    )
    expect(mocks.copyFile).toHaveBeenCalledWith(
      '/tmp/source-screenshot.png',
      '/tmp/tuff-screenshot.png'
    )
    expect(mocks.translateImageBase64).not.toHaveBeenCalled()

    await module.onDestroy({} as never)
  })

  it('returns a canceled screenshot save without copying the temporary file', async () => {
    mocks.capture.mockResolvedValue(
      mocks.createCaptureResult({
        path: '/tmp/source-screenshot.png',
        dataUrl: undefined
      })
    )
    mocks.showSaveDialog.mockResolvedValue({
      canceled: true
    })
    const { handler, module } = await createInitializedModuleWithHandler(
      AssistantEvents.voice.saveScreenshot.toEventName()
    )

    const result = await handler(undefined, {} as HandlerContext)

    expect(result).toEqual({
      success: false,
      canceled: true
    })
    expect(mocks.copyFile).not.toHaveBeenCalled()

    await module.onDestroy({} as never)
  })

  it('maps screenshot save capture permission failures to SCREENSHOT_PERMISSION_DENIED', async () => {
    mocks.capture.mockRejectedValue(new Error('Screen recording permission denied'))
    const { handler, module } = await createInitializedModuleWithHandler(
      AssistantEvents.voice.saveScreenshot.toEventName()
    )

    const result = await handler(undefined, {} as HandlerContext)

    expect(result).toMatchObject({
      success: false,
      code: 'SCREENSHOT_PERMISSION_DENIED',
      error: 'Screen recording permission denied'
    })
    expect(mocks.showSaveDialog).not.toHaveBeenCalled()
    expect(mocks.copyFile).not.toHaveBeenCalled()

    await module.onDestroy({} as never)
  })

  it('maps native screenshot unsupported failures to SCREENSHOT_UNSUPPORTED', async () => {
    const error = new Error('disabled-by-env') as Error & { code?: string }
    error.code = 'ERR_NATIVE_SCREENSHOT_UNSUPPORTED'
    mocks.capture.mockRejectedValue(error)
    const { handler, module } = await createInitializedModuleWithHandler(
      AssistantEvents.voice.captureScreenshot.toEventName()
    )

    const result = await handler(undefined, {} as HandlerContext)

    expect(result).toMatchObject({
      success: false,
      code: 'SCREENSHOT_UNSUPPORTED',
      error: 'disabled-by-env'
    })

    await module.onDestroy({} as never)
  })

  it('accepts only the selector sender, maps a clamped local region to global DIP coordinates, and captures it natively', async () => {
    const display: NativeScreenshotDisplay = {
      id: 'display-external',
      name: 'External Display',
      friendlyName: 'Studio Display',
      x: 1400,
      y: -120,
      width: 800,
      height: 600,
      scaleFactor: 2,
      rotation: 0,
      isPrimary: false
    }
    mocks.listDisplays.mockReturnValue([display])
    const { module } = await createInitializedModule()
    const selectHandler = mocks.handlers.get(
      AssistantEvents.voice.selectScreenshotRegion.toEventName()
    )
    const submitHandler = mocks.handlers.get(AssistantEvents.regionSelection.submit.toEventName())
    const captureHandler = mocks.handlers.get(AssistantEvents.voice.captureScreenshot.toEventName())
    if (!selectHandler || !submitHandler || !captureHandler) {
      throw new Error('Screenshot region transport handlers were not registered')
    }

    const selectionPromise = Promise.resolve(
      selectHandler({ target: 'display', displayId: display.id }, {} as HandlerContext)
    )
    await Promise.resolve()
    const selectorWindow = mocks.touchWindows[mocks.touchWindows.length - 1]
    if (!selectorWindow) {
      throw new Error('Screenshot region selector window was not opened')
    }

    expect(selectorWindow.options).toMatchObject({
      x: display.x,
      y: display.y,
      width: display.width,
      height: display.height
    })

    const localRegion = { x: -20, y: 570, width: 900, height: 100 }
    expect(
      await submitHandler(localRegion, { sender: { id: -1 } } as unknown as HandlerContext)
    ).toEqual({ accepted: false })
    expect(
      await submitHandler(localRegion, {
        sender: { id: selectorWindow.window.webContents.id }
      } as unknown as HandlerContext)
    ).toEqual({ accepted: true })

    const selection = await selectionPromise
    expect(selection).toEqual({
      success: true,
      displayId: display.id,
      displayName: 'Studio Display',
      region: { x: 1400, y: 450, width: 800, height: 30 }
    })
    expect(selectorWindow.window.destroy).toHaveBeenCalledTimes(1)

    await captureHandler(
      {
        target: 'region',
        displayId: display.id,
        region: { x: 1400, y: 450, width: 800, height: 30 }
      },
      {} as HandlerContext
    )

    expect(mocks.capture).toHaveBeenLastCalledWith({
      target: 'region',
      displayId: display.id,
      region: { x: 1400, y: 450, width: 800, height: 30 },
      output: 'data-url',
      writeClipboard: true
    })

    await module.onDestroy({} as never)
  })

  it('cancels and tears down pending selections without leaving selector windows alive', async () => {
    const display: NativeScreenshotDisplay = {
      id: 'display-primary',
      name: 'Primary Display',
      x: 0,
      y: 0,
      width: 1440,
      height: 900,
      scaleFactor: 2,
      rotation: 0,
      isPrimary: true
    }
    mocks.listDisplays.mockReturnValue([display])
    const { module } = await createInitializedModule()
    const selectHandler = mocks.handlers.get(
      AssistantEvents.voice.selectScreenshotRegion.toEventName()
    )
    const cancelHandler = mocks.handlers.get(AssistantEvents.regionSelection.cancel.toEventName())
    if (!selectHandler || !cancelHandler) {
      throw new Error('Screenshot region cancellation handlers were not registered')
    }

    const canceledSelection = Promise.resolve(selectHandler(undefined, {} as HandlerContext))
    await Promise.resolve()
    const canceledWindow = mocks.touchWindows[mocks.touchWindows.length - 1]
    if (!canceledWindow) {
      throw new Error('Screenshot region selector window was not opened')
    }

    expect(
      await cancelHandler(undefined, {
        sender: { id: canceledWindow.window.webContents.id }
      } as unknown as HandlerContext)
    ).toEqual({ accepted: true })
    expect(await canceledSelection).toEqual({ success: false, canceled: true })
    expect(canceledWindow.window.destroy).toHaveBeenCalledTimes(1)

    const destroyedSelection = Promise.resolve(selectHandler(undefined, {} as HandlerContext))
    await Promise.resolve()
    const destroyedWindow = mocks.touchWindows[mocks.touchWindows.length - 1]
    if (!destroyedWindow) {
      throw new Error('Screenshot region selector window was not reopened')
    }

    await module.onDestroy({} as never)

    expect(await destroyedSelection).toEqual({ success: false, canceled: true })
    expect(destroyedWindow.window.destroy).toHaveBeenCalledTimes(1)
  })

  it('persists floating ball drag position immediately after the debounce window', async () => {
    vi.useFakeTimers()
    const setting = mocks.createEnabledSetting()
    mocks.getMainConfig.mockImplementation(() => setting)
    const { module } = await createInitializedModule()
    const handler = mocks.handlers.get(AssistantEvents.floatingBall.updatePosition.toEventName())
    if (!handler) {
      throw new Error('updatePosition handler was not registered')
    }

    await handler({ x: 316.2, y: 292.8 }, {} as HandlerContext)
    await vi.advanceTimersByTimeAsync(220)

    expect(setting.floatingBall.position).toEqual({ x: 316, y: 293 })
    expect(mocks.saveMainConfig).toHaveBeenLastCalledWith(StorageList.APP_SETTING, setting, {
      force: true
    })
    expect(mocks.persistMainConfig).toHaveBeenCalledWith(StorageList.APP_SETTING)

    await module.onDestroy({} as never)
    vi.useRealTimers()
  })
})
