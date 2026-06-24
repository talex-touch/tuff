import { StorageList, type AppSetting } from '@talex-touch/utils'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { NativeScreenshotCaptureResult } from '@talex-touch/utils/transport/events/types'
import type { CoreBoxImageTranslateResponse } from '../../../shared/events/corebox-scenes'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'

type AssistantHandler = (payload: unknown, context: HandlerContext) => unknown | Promise<unknown>

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, AssistantHandler>(),
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
  translateImageBase64: vi.fn<() => Promise<CoreBoxImageTranslateResponse>>(),
  translateClipboardImage: vi.fn(),
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

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    on: vi.fn((event, handler) => {
      mocks.handlers.set(event.toEventName(), handler)
      return vi.fn()
    }),
    broadcastToWindow: vi.fn(),
    sendTo: vi.fn()
  }))
}))

vi.mock('electron', () => ({
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
  TouchWindow: vi.fn(() => ({
    window: {
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
      on: vi.fn(),
      webContents: {}
    },
    loadURL: vi.fn(),
    loadFile: vi.fn()
  }))
}))

vi.mock('../../config/default', () => ({
  AssistantFloatingBallWindowOption: {},
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
    trigger: vi.fn()
  }
}))

vi.mock('../box-tool/core-box/window', () => ({
  windowManager: {
    getCurScreen: vi.fn(),
    current: null,
    updatePosition: vi.fn()
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

vi.mock('../native-capabilities/screenshot-service', () => ({
  getNativeScreenshotService: vi.fn(() => ({
    capture: mocks.capture
  }))
}))

async function createInitializedModule(): Promise<{
  handler: AssistantHandler
  module: InstanceType<typeof import('./module').AssistantModule>
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

async function createInitializedModuleWithHandler(eventName: string): Promise<{
  handler: AssistantHandler
  module: InstanceType<typeof import('./module').AssistantModule>
}> {
  const { AssistantModule } = await import('./module')
  const module = new AssistantModule()
  await module.onInit({
    app: { channel: {} },
    runtime: { channel: {} },
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
    mocks.getMainConfig.mockImplementation(() => mocks.createEnabledSetting())
    mocks.persistMainConfig.mockResolvedValue(undefined)
    mocks.capture.mockResolvedValue(mocks.createCaptureResult())
    mocks.translateImageBase64.mockResolvedValue(mocks.createTranslateSuccess())
  })

  it('captures the cursor display and translates the screenshot image into a pin window', async () => {
    const { handler, module } = await createInitializedModule()

    const result = await handler({ targetLang: 'ja' }, {} as HandlerContext)

    expect(result).toEqual({
      success: true,
      translatedImageBase64: 'dHJhbnNsYXRlZA==',
      sourceText: 'hello',
      targetText: '你好'
    })
    expect(mocks.capture).toHaveBeenCalledWith({
      target: 'cursor-display',
      output: 'data-url',
      writeClipboard: false
    })
    expect(mocks.translateImageBase64).toHaveBeenCalledWith('c2NyZWVuc2hvdC1pbWFnZQ==', 'ja', {
      openPinWindow: true
    })

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

  it('maps native screenshot failures to SCREENSHOT_UNAVAILABLE', async () => {
    mocks.capture.mockRejectedValue(new Error('Screen recording permission denied'))
    const { handler, module } = await createInitializedModule()

    const result = await handler({ targetLang: 'zh' }, {} as HandlerContext)

    expect(result).toMatchObject({
      success: false,
      code: 'SCREENSHOT_UNAVAILABLE',
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

  it('maps image translation scene failures to SCENE_UNAVAILABLE', async () => {
    mocks.translateImageBase64.mockResolvedValue({
      success: false,
      code: 'SCENE_UNAVAILABLE',
      error: 'Scene unavailable'
    })
    const { handler, module } = await createInitializedModule()

    const result = await handler({ targetLang: 'zh' }, {} as HandlerContext)

    expect(result).toMatchObject({
      success: false,
      code: 'SCENE_UNAVAILABLE',
      error: 'Scene unavailable'
    })

    await module.onDestroy({} as never)
  })

  it('captures a screenshot preview and writes it to clipboard without invoking image translate', async () => {
    const { handler, module } = await createInitializedModuleWithHandler(
      AssistantEvents.voice.captureScreenshot.toEventName()
    )

    const result = await handler({ target: 'cursor-display' }, {} as HandlerContext)

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

  it('maps screenshot capture failures to SCREENSHOT_UNAVAILABLE', async () => {
    mocks.capture.mockRejectedValue(new Error('Screen recording permission denied'))
    const { handler, module } = await createInitializedModuleWithHandler(
      AssistantEvents.voice.captureScreenshot.toEventName()
    )

    const result = await handler(undefined, {} as HandlerContext)

    expect(result).toMatchObject({
      success: false,
      code: 'SCREENSHOT_UNAVAILABLE',
      error: 'Screen recording permission denied'
    })
    expect(mocks.translateImageBase64).not.toHaveBeenCalled()

    await module.onDestroy({} as never)
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
