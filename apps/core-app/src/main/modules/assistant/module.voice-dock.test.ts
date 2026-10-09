import type { AppSetting } from '@talex-touch/utils'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { AssistantModule } from './module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'

type AssistantHandler = (payload: unknown, context: HandlerContext) => unknown | Promise<unknown>
type ScreenPoint = { x: number; y: number }
type ScreenTopologyEvent = 'display-added' | 'display-removed' | 'display-metrics-changed'
type ScreenTopologyListener = () => void | Promise<void>

type WorkAreaDisplay = {
  workArea: { x: number; y: number; width: number; height: number }
  /** Present only where a test needs the screen behind the work area. */
  bounds?: { x: number; y: number; width: number; height: number }
}
function eventName(event: unknown): string {
  if (
    !event ||
    typeof event !== 'object' ||
    !('toEventName' in event) ||
    typeof event.toEventName !== 'function'
  ) {
    return ''
  }
  return event.toEventName()
}

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, AssistantHandler>(),
  screenListeners: new Map<ScreenTopologyEvent, ScreenTopologyListener>(),
  screenOn: vi.fn((event: ScreenTopologyEvent, listener: ScreenTopologyListener): void => {
    mocks.screenListeners.set(event, listener)
  }),
  screenOff: vi.fn((event: ScreenTopologyEvent, listener: ScreenTopologyListener): void => {
    if (mocks.screenListeners.get(event) === listener) {
      mocks.screenListeners.delete(event)
    }
  }),
  loadDockRenderer: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  createEnabledSetting: (overrides: Partial<AppSetting> = {}): AppSetting =>
    ({
      voiceWake: {
        enabled: false,
        wakeWords: ['阿洛', 'aler'],
        language: 'zh-CN',
        continuous: true,
        cooldownMs: 2200,
        openPanelOnWake: true
      },
      voiceInput: {
        enabled: true,
        language: 'zh-CN',
        polishEnabled: true,
        polishStrength: 'deep'
      },
      setup: {
        microphone: false
      },
      ...overrides
    }) as AppSetting,
  getMainConfig: vi.fn<() => AppSetting>(),
  saveMainConfig: vi.fn(),
  appSettingListener: undefined as ((setting: AppSetting) => void) | undefined,
  subscribeMainConfig: vi.fn((_key: unknown, listener: (setting: AppSetting) => void) => {
    mocks.appSettingListener = listener
    return vi.fn()
  }),
  getDisplayNearestPoint: vi.fn<(point: ScreenPoint) => WorkAreaDisplay>(() => ({
    workArea: { x: 0, y: 0, width: 1440, height: 900 }
  })),
  touchWindows: [] as Array<{
    options: Record<string, unknown>
    window: {
      id: number
      webContents: { id: number }
      destroy: () => void
      hide: () => void
      showInactive: () => void
      show: () => void
      focus: () => void
      setAlwaysOnTop: (flag: boolean, level?: string) => void
      setBounds: (bounds: { x: number; y: number; width: number; height: number }) => void
      getBounds: () => { x: number; y: number; width: number; height: number }
      isVisible: () => boolean
      isDestroyed: () => boolean
      on: (event: string, listener: () => void) => void
    }
  }>,
  resolveCapabilityStatus: vi.fn(),
  navigateOpen: vi.fn(),
  broadcastToWindow: vi.fn(),
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
    broadcastToWindow: mocks.broadcastToWindow
  }))
}))
vi.mock('../voice/command-gesture', () => ({
  setPlatformVoiceEscapeCapture: vi.fn()
}))

vi.mock('../app-destination/app-destination-navigation', () => ({
  getAppDestinationNavigationService: vi.fn(() => ({ open: mocks.navigateOpen }))
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn(() => '/tmp/tuff-core-app'),
    getPath: vi.fn((name: string) => {
      const roots: Record<string, string> = {
        home: '/tmp/tuff-home',
        userData: '/tmp/tuff-user-data',
        temp: '/tmp/tuff-temp',
        cache: '/tmp/tuff-cache'
      }
      const resolved = roots[name]
      if (!resolved) throw new Error(`Unexpected Electron app path: ${name}`)
      return resolved
    })
  },
  screen: {
    getDisplayNearestPoint: mocks.getDisplayNearestPoint,
    on: mocks.screenOn,
    off: mocks.screenOff,
    removeListener: mocks.screenOff
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
        getBounds: vi.fn(() => ({ x: 0, y: 0, width: 360, height: 148 })),
        isVisible: vi.fn(() => false),
        isDestroyed: vi.fn(() => false),
        showInactive: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
        hide: vi.fn(),
        destroy: vi.fn(),
        on: vi.fn()
      },
      loadURL: mocks.loadDockRenderer,
      loadFile: mocks.loadDockRenderer
    }
    mocks.touchWindows.push(touchWindow)
    return touchWindow
  })
}))

vi.mock('../../config/default', () => ({
  APP_FOLDER_NAME: 'tuff',
  AssistantVoiceDockWindowOption: {}
}))

vi.mock('../../utils/renderer-url', () => ({
  getCoreBoxRendererPath: vi.fn(() => '/tmp/index.html'),
  getCoreBoxRendererUrl: vi.fn(() => 'http://localhost:5173'),
  isDevMode: vi.fn(() => true)
}))

vi.mock('../storage', () => ({
  getMainConfig: mocks.getMainConfig,
  isMainStorageReady: vi.fn(() => true),
  saveMainConfig: mocks.saveMainConfig,
  subscribeMainConfig: mocks.subscribeMainConfig
}))

vi.mock('../ai/intelligence-capability-status', () => ({
  resolveCapabilityStatus: mocks.resolveCapabilityStatus
}))

async function createInitializedModule(): Promise<{ module: AssistantModule }> {
  const { AssistantModule } = await import('./module')
  const module = new AssistantModule()
  await module.onInit({
    app: { channel: {} },
    runtime: { channel: {} },
    file: { dirPath: '/tmp/assistant' }
  } as unknown as Parameters<typeof module.onInit>[0])
  return { module }
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

describe('AssistantModule voice dock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mocks.handlers.clear()
    mocks.appSettingListener = undefined
    mocks.screenListeners.clear()
    mocks.getMainConfig.mockImplementation(() => mocks.createEnabledSetting())
    mocks.loadDockRenderer.mockReset()
    mocks.loadDockRenderer.mockResolvedValue(undefined)
    mocks.touchWindows.length = 0
    mocks.getDisplayNearestPoint.mockReset()
    mocks.getDisplayNearestPoint.mockReturnValue({
      workArea: { x: 0, y: 0, width: 1440, height: 900 }
    })
    mocks.resolveCapabilityStatus.mockReturnValue({
      capabilityId: 'text.chat',
      available: true,
      providerIds: ['chat-provider']
    })
    mocks.navigateOpen.mockReset()
    mocks.navigateOpen.mockReturnValue({ status: 'opened', destinationId: 'settings-channels' })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('opens the panel without a duplicate command when collapsed, then forwards active commands', async () => {
    const { module } = await createInitializedModule()
    mocks.broadcastToWindow.mockClear()

    const start = { action: 'start', mode: 'toggle', source: 'command' } as const
    const stop = { action: 'stop', mode: 'toggle', source: 'command' } as const

    await module.handleVoiceCommandGesture(start)

    expect(mocks.broadcastToWindow).toHaveBeenCalledTimes(1)
    const collapsedCall = mocks.broadcastToWindow.mock.calls[0]
    expect(collapsedCall?.[1]).toEqual(
      expect.objectContaining({ toEventName: expect.any(Function) })
    )
    expect(eventName(collapsedCall?.[1])).toBe(AssistantEvents.voice.panelOpened.toEventName())
    expect(collapsedCall?.[2]).toEqual({ source: 'command' })
    expect(mocks.broadcastToWindow.mock.calls.map(([, event]) => eventName(event))).not.toContain(
      AssistantEvents.voice.command.toEventName()
    )
    mocks.broadcastToWindow.mockClear()
    await module.handleVoiceCommandGesture(start)
    expect(mocks.broadcastToWindow).toHaveBeenCalledTimes(1)
    const expandedStartCall = mocks.broadcastToWindow.mock.calls[0]
    expect(expandedStartCall?.[1]).toEqual(
      expect.objectContaining({ toEventName: expect.any(Function) })
    )
    expect(eventName(expandedStartCall?.[1])).toBe(AssistantEvents.voice.command.toEventName())
    expect(expandedStartCall?.[2]).toEqual(start)
    mocks.broadcastToWindow.mockClear()
    await module.handleVoiceCommandGesture(stop)
    expect(mocks.broadcastToWindow).toHaveBeenCalledTimes(1)
    const expandedStopCall = mocks.broadcastToWindow.mock.calls[0]
    expect(expandedStopCall?.[1]).toEqual(
      expect.objectContaining({ toEventName: expect.any(Function) })
    )
    expect(eventName(expandedStopCall?.[1])).toBe(AssistantEvents.voice.command.toEventName())
    expect(expandedStopCall?.[2]).toEqual(stop)

    await module.onDestroy({} as Parameters<typeof module.onDestroy>[0])
  })

  it('reports explicit voice input disablement despite enabled legacy settings', async () => {
    const setting = mocks.createEnabledSetting({
      voiceWake: {
        enabled: true,
        wakeWords: ['Alo'],
        language: 'fr-FR',
        continuous: true,
        cooldownMs: 2200,
        openPanelOnWake: true
      },
      voiceInput: {
        enabled: false,
        language: 'fr-FR',
        polishEnabled: true,
        polishStrength: 'natural',
        noiseSuppression: false,
        historyEnabled: true,
        source: 'hybrid'
      }
    })
    mocks.getMainConfig.mockReturnValue(setting)
    const { handler, module } = await createInitializedModuleWithHandler(
      AssistantEvents.voice.getRuntimeConfig.toEventName()
    )

    expect(await handler(undefined, {} as HandlerContext)).toEqual({
      enabled: false,
      language: 'fr-FR',
      polishEnabled: true,
      polishAvailable: true,
      polishStrength: 'natural'
    })

    await module.onDestroy({} as Parameters<typeof module.onDestroy>[0])
  })
  it('projects an unavailable text chat runtime as polish unavailable', async () => {
    mocks.resolveCapabilityStatus.mockImplementation((capabilityId: string) => ({
      capabilityId,
      available: capabilityId !== 'text.chat',
      providerIds: capabilityId === 'text.chat' ? [] : ['unrelated-provider']
    }))
    const { handler, module } = await createInitializedModuleWithHandler(
      AssistantEvents.voice.getRuntimeConfig.toEventName()
    )

    expect(handler(undefined, {} as HandlerContext)).toMatchObject({
      enabled: true,
      polishEnabled: true,
      polishAvailable: false
    })

    await module.onDestroy({} as Parameters<typeof module.onDestroy>[0])
  })

  it('opens a command HUD and hides it when the session closes', async () => {
    mocks.getMainConfig.mockReturnValue(
      mocks.createEnabledSetting({
        voiceWake: {
          enabled: false,
          wakeWords: ['Alo'],
          language: 'fr-FR',
          continuous: true,
          cooldownMs: 2200,
          openPanelOnWake: true
        },
        voiceInput: {
          enabled: true,
          language: 'fr-FR',
          polishEnabled: true,
          polishStrength: 'deep',
          noiseSuppression: false,
          historyEnabled: true,
          source: 'hybrid'
        }
      })
    )
    const { module } = await createInitializedModule()
    const start = { action: 'start', mode: 'toggle', source: 'command' } as const

    await module.handleVoiceCommandGesture(start)

    const dock = mocks.touchWindows.at(-1)
    if (!dock) throw new Error('Voice HUD was not created')
    expect(mocks.broadcastToWindow.mock.calls.map(([, event]) => eventName(event))).toContain(
      AssistantEvents.voice.panelOpened.toEventName()
    )
    vi.mocked(dock.window.hide).mockClear()
    vi.mocked(dock.window.showInactive).mockClear()
    const closePanel = mocks.handlers.get(AssistantEvents.voice.closePanel.toEventName())
    if (!closePanel) throw new Error('closePanel handler was not registered')

    await closePanel(undefined, {} as HandlerContext)

    expect(dock.window.hide).toHaveBeenCalled()
    expect(dock.window.showInactive).not.toHaveBeenCalled()
    await module.onDestroy({} as Parameters<typeof module.onDestroy>[0])
  })
  it('opens no resting window, even for a profile saved with the floating ball turned on', async () => {
    // Storage drops this key when it loads a profile; one that reaches the module is still unread.
    const setting = {
      ...mocks.createEnabledSetting(),
      floatingBall: {
        enabled: true,
        size: 56,
        opacity: 1,
        edgePadding: 24,
        position: { x: -1, y: -1 }
      }
    } as unknown as AppSetting
    mocks.getMainConfig.mockReturnValue(setting)
    const { module } = await createInitializedModule()
    if (!mocks.appSettingListener) throw new Error('App setting observer was not active')

    mocks.appSettingListener(setting)

    expect(mocks.touchWindows).toHaveLength(0)
    await module.onDestroy({} as Parameters<typeof module.onDestroy>[0])
  })
  it('stops an active temporary HUD when voice input is disabled', async () => {
    const setting = mocks.createEnabledSetting({
      voiceInput: {
        enabled: true,
        language: 'fr-FR',
        polishEnabled: true,
        polishStrength: 'deep',
        noiseSuppression: false,
        historyEnabled: true,
        source: 'hybrid'
      }
    })
    mocks.getMainConfig.mockReturnValue(setting)
    const { module } = await createInitializedModule()

    await module.handleVoiceCommandGesture({ action: 'start', mode: 'toggle', source: 'command' })
    const dock = mocks.touchWindows.at(-1)
    if (!dock || !mocks.appSettingListener)
      throw new Error('Voice HUD settings observer was not active')
    mocks.broadcastToWindow.mockClear()
    vi.mocked(dock.window.hide).mockClear()
    vi.mocked(dock.window.showInactive).mockClear()
    setting.voiceInput.enabled = false

    mocks.appSettingListener(setting)
    await Promise.resolve()

    expect(
      mocks.broadcastToWindow.mock.calls.map(([, event, payload]) => ({
        event: eventName(event),
        payload
      }))
    ).toEqual([
      {
        event: AssistantEvents.voice.command.toEventName(),
        payload: { action: 'stop', mode: 'toggle', source: 'command' }
      },
      { event: AssistantEvents.voice.panelClosed.toEventName(), payload: undefined }
    ])
    expect(dock.window.hide).toHaveBeenCalled()
    expect(dock.window.showInactive).not.toHaveBeenCalled()
    await module.onDestroy({} as Parameters<typeof module.onDestroy>[0])
  })

  it('forwards only a pending STOP after the first VoiceDock window has loaded', async () => {
    mocks.getMainConfig.mockReturnValue(mocks.createEnabledSetting())
    // `vi.resetModules()` gives every Electron fixture a fresh Assistant singleton, so this
    // intentional dynamic import starts with no dock window before the delayed HUD load.
    const { AssistantModule } = await import('./module')
    const module = new AssistantModule()
    await module.onInit({
      app: { channel: {} },
      runtime: { channel: {} },
      file: { dirPath: '/tmp/assistant' }
    } as unknown as Parameters<typeof module.onInit>[0])

    mocks.getMainConfig.mockReturnValue(mocks.createEnabledSetting())
    const renderer = Promise.withResolvers<void>()
    mocks.loadDockRenderer.mockReturnValueOnce(renderer.promise)
    const start = { action: 'start', mode: 'toggle', source: 'command' } as const
    const stop = { action: 'stop', mode: 'toggle', source: 'command' } as const

    const opening = module.handleVoiceCommandGesture(start)
    await Promise.resolve()
    await module.handleVoiceCommandGesture(stop)
    renderer.resolve()
    await opening

    expect(
      mocks.broadcastToWindow.mock.calls.map(([, event, payload]) => ({
        event: eventName(event),
        payload
      }))
    ).toEqual([
      { event: AssistantEvents.voice.panelOpened.toEventName(), payload: { source: 'command' } },
      { event: AssistantEvents.voice.command.toEventName(), payload: stop }
    ])

    await module.onDestroy({} as Parameters<typeof module.onDestroy>[0])
  })
  it('does not carry a released Escape hold into a VoiceDock still being created', async () => {
    mocks.getMainConfig.mockReturnValue(mocks.createEnabledSetting())
    const { AssistantModule } = await import('./module')
    const module = new AssistantModule()
    await module.onInit({
      app: { channel: {} },
      runtime: { channel: {} },
      file: { dirPath: '/tmp/assistant' }
    } as unknown as Parameters<typeof module.onInit>[0])

    mocks.getMainConfig.mockReturnValue(mocks.createEnabledSetting())
    const renderer = Promise.withResolvers<void>()
    mocks.loadDockRenderer.mockReturnValueOnce(renderer.promise)
    const opening = module.handleVoiceCommandGesture({
      action: 'start',
      mode: 'toggle',
      source: 'command'
    })
    await Promise.resolve()
    await module.handleVoiceCommandGesture({ action: 'cancel', state: 'start', source: 'command' })
    await module.handleVoiceCommandGesture({ action: 'cancel', state: 'reset', source: 'command' })
    renderer.resolve()
    await opening

    const delivered = mocks.broadcastToWindow.mock.calls.map(([, event, payload]) => ({
      event: eventName(event),
      payload
    }))
    expect(delivered).toContainEqual({
      event: AssistantEvents.voice.panelOpened.toEventName(),
      payload: { source: 'command' }
    })
    expect(delivered).not.toContainEqual({
      event: AssistantEvents.voice.cancelHold.toEventName(),
      payload: { state: 'commit' }
    })
    expect(delivered).not.toContainEqual({
      event: AssistantEvents.voice.command.toEventName(),
      payload: { action: 'stop', mode: 'toggle', source: 'command' }
    })
    await module.onDestroy({} as Parameters<typeof module.onDestroy>[0])
  })
  it('cancels an unfocused active HUD only after the global Escape hold reaches 600ms', async () => {
    vi.useFakeTimers()
    const { module } = await createInitializedModule()
    await module.handleVoiceCommandGesture({ action: 'start', mode: 'toggle', source: 'command' })
    mocks.broadcastToWindow.mockClear()

    await module.handleVoiceCommandGesture({ action: 'cancel', state: 'start', source: 'command' })
    expect(
      mocks.broadcastToWindow.mock.calls.map(([, event, payload]) => ({
        event: eventName(event),
        payload
      }))
    ).toEqual([
      { event: AssistantEvents.voice.cancelHold.toEventName(), payload: { state: 'start' } }
    ])

    vi.advanceTimersByTime(599)
    expect(
      mocks.broadcastToWindow.mock.calls.map(([, event, payload]) => ({
        event: eventName(event),
        payload
      }))
    ).toEqual([
      { event: AssistantEvents.voice.cancelHold.toEventName(), payload: { state: 'start' } }
    ])

    vi.advanceTimersByTime(1)
    expect(
      mocks.broadcastToWindow.mock.calls.map(([, event, payload]) => ({
        event: eventName(event),
        payload
      }))
    ).toEqual([
      { event: AssistantEvents.voice.cancelHold.toEventName(), payload: { state: 'start' } },
      { event: AssistantEvents.voice.cancelHold.toEventName(), payload: { state: 'commit' } }
    ])
    expect(mocks.broadcastToWindow.mock.calls.map(([, event]) => eventName(event))).not.toContain(
      AssistantEvents.voice.command.toEventName()
    )
    await module.onDestroy({} as Parameters<typeof module.onDestroy>[0])
  })

  it('resets a released global Escape hold without cancelling the active HUD', async () => {
    vi.useFakeTimers()
    const { module } = await createInitializedModule()
    await module.handleVoiceCommandGesture({ action: 'start', mode: 'toggle', source: 'command' })
    mocks.broadcastToWindow.mockClear()

    await module.handleVoiceCommandGesture({ action: 'cancel', state: 'start', source: 'command' })
    vi.advanceTimersByTime(599)
    await module.handleVoiceCommandGesture({ action: 'cancel', state: 'reset', source: 'command' })
    vi.advanceTimersByTime(600)

    expect(
      mocks.broadcastToWindow.mock.calls.map(([, event, payload]) => ({
        event: eventName(event),
        payload
      }))
    ).toEqual([
      { event: AssistantEvents.voice.cancelHold.toEventName(), payload: { state: 'start' } },
      { event: AssistantEvents.voice.cancelHold.toEventName(), payload: { state: 'reset' } }
    ])
    await module.onDestroy({} as Parameters<typeof module.onDestroy>[0])
  })

  it('does not let a destroyed Escape timer cancel a newly opened HUD', async () => {
    vi.useFakeTimers()
    const { module: closingModule } = await createInitializedModule()
    await closingModule.handleVoiceCommandGesture({
      action: 'start',
      mode: 'toggle',
      source: 'command'
    })
    await closingModule.handleVoiceCommandGesture({
      action: 'cancel',
      state: 'start',
      source: 'command'
    })
    await closingModule.onDestroy({} as Parameters<typeof closingModule.onDestroy>[0])

    const { module: reopenedModule } = await createInitializedModule()
    await reopenedModule.handleVoiceCommandGesture({
      action: 'start',
      mode: 'toggle',
      source: 'command'
    })
    mocks.broadcastToWindow.mockClear()
    vi.advanceTimersByTime(600)

    expect(mocks.broadcastToWindow).not.toHaveBeenCalled()
    await reopenedModule.onDestroy({} as Parameters<typeof reopenedModule.onDestroy>[0])
  })
  it('leaves an expanded VoiceDock alone when it loses focus', async () => {
    const { module } = await createInitializedModule()
    await module.handleVoiceCommandGesture({ action: 'start', mode: 'toggle', source: 'command' })
    const dock = mocks.touchWindows.at(-1)
    if (!dock) throw new Error('Voice HUD was not created')

    expect(vi.mocked(dock.window.on)).not.toHaveBeenCalledWith('blur', expect.any(Function))
    expect(mocks.broadcastToWindow.mock.calls.map(([, event]) => eventName(event))).not.toContain(
      AssistantEvents.voice.panelClosed.toEventName()
    )
    expect(dock.window.hide).not.toHaveBeenCalled()
    await module.onDestroy({} as Parameters<typeof module.onDestroy>[0])
  })

  it('opens command-origin voice panels without focusing the active application target', async () => {
    const { module } = await createInitializedModule()

    await module.handleVoiceCommandGesture({
      action: 'start',
      mode: 'toggle',
      source: 'command'
    })

    const dock = mocks.touchWindows[0]
    if (!dock) throw new Error('VoiceDock was not created')
    expect(dock.window.showInactive).toHaveBeenCalledTimes(1)
    expect(dock.window.focus).not.toHaveBeenCalled()

    await module.onDestroy({} as Parameters<typeof module.onDestroy>[0])
  })

  it('registers one topology listener for every display event and removes it on teardown', async () => {
    const { module } = await createInitializedModule()
    const events: ScreenTopologyEvent[] = [
      'display-added',
      'display-removed',
      'display-metrics-changed'
    ]
    const listeners = events.map((event) => {
      const listener = mocks.screenListeners.get(event)
      if (!listener) {
        throw new Error(`${event} listener was not registered`)
      }
      return listener
    })

    expect(mocks.screenOn).toHaveBeenCalledTimes(3)
    expect(new Set(listeners).size).toBe(1)

    await module.onDestroy({} as never)

    expect(mocks.screenOff).toHaveBeenCalledTimes(3)
    for (const event of events) {
      expect(mocks.screenOff).toHaveBeenCalledWith(event, listeners[0])
    }
    expect(mocks.screenListeners.size).toBe(0)
  })

  /**
   * The Dock is at kCGDockWindowLevel (20) and `floating` is NSFloatingWindowLevel (3), so the
   * HUD used to be covered by a bar sliding in underneath it. Above the Dock it does not have
   * to dodge one, which is why the bottom gap is a plain edge gap and not a bar's height.
   */
  it('floats the VoiceDock above the Dock rather than reserving room below it', async () => {
    mocks.getMainConfig.mockReturnValue(mocks.createEnabledSetting())
    mocks.getDisplayNearestPoint.mockReturnValue({
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      workArea: { x: 0, y: 24, width: 800, height: 576 }
    })

    const { module } = await createInitializedModule()
    await module.handleVoiceCommandGesture({ action: 'start', mode: 'toggle', source: 'command' })

    const voiceDock = mocks.touchWindows[0]
    if (!voiceDock) throw new Error('VoiceDock window was not created')
    expect(voiceDock.window.setAlwaysOnTop).toHaveBeenCalledWith(true, 'status')

    // 24 + 576 - 148 - 9: the window's own gap, with nothing held back for a hidden bar. What
    // the user sees is this plus the canvas slack below the pill.
    const bounds = vi
      .mocked(voiceDock.window.setBounds)
      .mock.calls.map(([value]) => value)
      .pop()
    expect(bounds?.y).toBe(443)
    expect(bounds?.height).toBe(148)

    await module.onDestroy({} as never)
  })

  it('reanchors the expanded VoiceDock after topology recovery without reopening it and leaves it hidden otherwise', async () => {
    mocks.getDisplayNearestPoint.mockReturnValue({
      workArea: { x: 1440, y: 100, width: 600, height: 400 }
    })

    const { module } = await createInitializedModule()
    await module.handleVoiceCommandGesture({ action: 'start', mode: 'toggle', source: 'command' })

    const voiceDock = mocks.touchWindows[0]
    const listener = mocks.screenListeners.get('display-metrics-changed')
    if (!voiceDock || !listener) {
      throw new Error('Visible VoiceDock topology recovery prerequisites were not initialized')
    }

    vi.mocked(voiceDock.window.getBounds).mockReturnValue({
      x: 1560,
      y: 343,
      width: 360,
      height: 148
    })
    vi.mocked(voiceDock.window.isVisible).mockReturnValue(true)
    vi.mocked(voiceDock.window.setBounds).mockClear()
    vi.mocked(voiceDock.window.show).mockClear()
    vi.mocked(voiceDock.window.focus).mockClear()
    mocks.broadcastToWindow.mockClear()
    mocks.getDisplayNearestPoint.mockReturnValue({
      workArea: { x: 0, y: 0, width: 800, height: 500 }
    })

    await listener()

    expect(mocks.touchWindows).toHaveLength(1)
    const recoveredBounds = vi.mocked(voiceDock.window.setBounds).mock.calls[0]?.[0]
    if (!recoveredBounds) {
      throw new Error('Visible VoiceDock was not reanchored after display recovery')
    }
    expect(recoveredBounds.x).toBeGreaterThanOrEqual(0)
    expect(recoveredBounds.y).toBeGreaterThanOrEqual(0)
    expect(recoveredBounds.x + recoveredBounds.width).toBeLessThanOrEqual(800)
    expect(recoveredBounds.y + recoveredBounds.height).toBeLessThanOrEqual(500)
    expect(recoveredBounds.x + recoveredBounds.width / 2).toBe(400)
    // The window's bottom edge sits VOICE_DOCK_EDGE_GAP above the work area's: 500 - 9.
    expect(recoveredBounds.y + recoveredBounds.height).toBe(491)
    expect(voiceDock.window.show).not.toHaveBeenCalled()
    expect(voiceDock.window.focus).not.toHaveBeenCalled()
    expect(mocks.broadcastToWindow).not.toHaveBeenCalled()

    vi.mocked(voiceDock.window.setBounds).mockClear()
    vi.mocked(voiceDock.window.isVisible).mockReturnValue(false)

    await listener()

    expect(mocks.touchWindows).toHaveLength(1)
    expect(voiceDock.window.setBounds).not.toHaveBeenCalled()
    expect(voiceDock.window.show).not.toHaveBeenCalled()
    expect(voiceDock.window.focus).not.toHaveBeenCalled()
    expect(mocks.broadcastToWindow).not.toHaveBeenCalled()

    await module.onDestroy({} as never)
  })

  it('opens provider channels from the registered VoiceDock recovery event', async () => {
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
    await module.handleVoiceCommandGesture({ action: 'start', mode: 'toggle', source: 'command' })
    const voiceDock = mocks.touchWindows[mocks.touchWindows.length - 1]
    if (!voiceDock) {
      throw new Error('VoiceDock was not opened')
    }
    expect(mocks.touchWindows).toHaveLength(1)

    vi.mocked(voiceDock.window.hide).mockClear()
    vi.mocked(voiceDock.window.setBounds).mockClear()

    const result = await handler(undefined, {} as HandlerContext)

    expect(result).toBe(true)
    expect(mocks.navigateOpen).toHaveBeenCalledExactlyOnceWith('settings-channels')
    // The shared destination service owns restore/show/focus; the Assistant must not duplicate it.
    expect(mainWindow.restore).not.toHaveBeenCalled()
    expect(mainWindow.show).not.toHaveBeenCalled()
    expect(mainWindow.focus).not.toHaveBeenCalled()
    // The settings page takes over, so the HUD goes away rather than waiting on top of it.
    expect(voiceDock.window.hide).toHaveBeenCalled()
    expect(voiceDock.window.setBounds).not.toHaveBeenCalled()

    await module.onDestroy({} as never)
  })
  it('keeps the VoiceDock available when Intelligence navigation delivery fails', async () => {
    mocks.navigateOpen.mockReturnValueOnce({
      status: 'unavailable',
      destinationId: 'settings-channels',
      reason: 'window-unavailable'
    })
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
    await module.handleVoiceCommandGesture({ action: 'start', mode: 'toggle', source: 'command' })
    const voiceDock = mocks.touchWindows[mocks.touchWindows.length - 1]
    if (!voiceDock) {
      throw new Error('VoiceDock was not opened')
    }
    expect(mocks.touchWindows).toHaveLength(1)

    const result = await handler(undefined, {} as HandlerContext)

    expect(result).toBe(false)
    expect(mocks.navigateOpen).toHaveBeenCalledExactlyOnceWith('settings-channels')
    expect(voiceDock.window.hide).not.toHaveBeenCalled()

    await module.onDestroy({} as never)
  })
})
