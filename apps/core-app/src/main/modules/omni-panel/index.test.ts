import { afterEach, describe, expect, it, vi } from 'vitest'
import { omniPanelFeatureToggleEvent } from '../../../shared/events/omni-panel'

const { getTuffTransportMainMock, loggerWarnMock } = vi.hoisted(() => ({
  getTuffTransportMainMock: vi.fn(() => ({
    on: vi.fn(() => () => {}),
    broadcast: vi.fn(),
    sendTo: vi.fn(),
    sendToWindow: vi.fn()
  })),
  loggerWarnMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: { isPackaged: false },
  clipboard: {
    writeText: vi.fn(),
    readText: vi.fn(() => ''),
    availableFormats: vi.fn(() => []),
    readBuffer: vi.fn(() => Buffer.from('')),
    clear: vi.fn(),
    writeBuffer: vi.fn()
  },
  screen: {
    getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })),
    getDisplayNearestPoint: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1280, height: 720 }
    }))
  },
  shell: {
    openExternal: vi.fn()
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
}))

vi.mock('../../core', () => ({
  genTouchApp: () => ({
    channel: {}
  })
}))

vi.mock('../../core/touch-window', () => ({
  TouchWindow: class TouchWindow {
    window = {
      on: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      isDestroyed: () => false,
      close: vi.fn(),
      getBounds: () => ({ width: 460, height: 420 }),
      setPosition: vi.fn(),
      webContents: {}
    }

    async loadFile(): Promise<void> {}

    async loadURL(): Promise<void> {}
  }
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: getTuffTransportMainMock
}))

vi.mock('../global-shortcon', () => ({
  shortcutModule: {
    registerMainShortcut: vi.fn(),
    registerMainTrigger: vi.fn(),
    unregisterMainShortcut: vi.fn(),
    unregisterMainTrigger: vi.fn()
  }
}))

vi.mock('../plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: null
  }
}))

vi.mock('../storage', () => ({
  getMainConfig: vi.fn(() => ({})),
  saveMainConfig: vi.fn()
}))

vi.mock('../box-tool/core-box/window', () => ({
  getCoreBoxWindow: vi.fn(() => null)
}))

vi.mock('../../core/eventbus/touch-event', async (importOriginal) => {
  const original = (await importOriginal()) as object
  return {
    ...original,
    touchEventBus: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn()
    }
  }
})

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    warn: loggerWarnMock,
    child: vi.fn(),
    time: vi.fn(() => ({
      end: vi.fn(),
      split: vi.fn()
    }))
  }))
}))

import type { IFeatureOmniTransfer, IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import { OmniPanelModule } from './index'

afterEach(() => {
  vi.clearAllMocks()
})

describe('OmniPanelModule registry initialization', () => {
  it('initializes builtin feature registry when empty', () => {
    const module = new OmniPanelModule() as unknown as {
      initializeFeatureRegistry: (items: unknown[]) => {
        items: Array<{ id: string }>
        changed: boolean
      }
    }

    const result = module.initializeFeatureRegistry([])

    expect(result.changed).toBe(true)
    expect(result.items.map((item) => item.id)).toEqual([
      'builtin.translate',
      'builtin.search',
      'builtin.corebox-search',
      'builtin.copy'
    ])
  })
})

describe('OmniPanelModule execute dispatch', () => {
  it('dispatches builtin/corebox/plugin/system routes correctly', async () => {
    const module = new OmniPanelModule() as unknown as {
      featureRegistry: Array<{
        id: string
        source: 'builtin' | 'plugin'
        target: 'corebox' | 'plugin' | 'system'
      }>
      executeFeature: (payload: { id: string }) => Promise<{ success: boolean; code?: string }>
      resolveFeatureItemPayload: (...args: unknown[]) => unknown
      executeBuiltinFeature: (...args: unknown[]) => Promise<{ success: boolean }>
      executeCoreBoxTransfer: (...args: unknown[]) => Promise<{ success: boolean }>
      executePluginFeature: (...args: unknown[]) => Promise<{ success: boolean }>
      hide: () => void
      lastContext: { text: string; source: 'manual' }
    }

    module.featureRegistry = [
      { id: 'builtin.search', source: 'builtin', target: 'system' },
      { id: 'plugin:demo:corebox', source: 'plugin', target: 'corebox' },
      { id: 'plugin:demo:system', source: 'plugin', target: 'system' },
      { id: 'plugin:demo:run', source: 'plugin', target: 'plugin' }
    ]
    module.lastContext = { text: 'query', source: 'manual' }

    const hideMock = vi.fn()
    const builtinMock = vi.fn().mockResolvedValue({ success: true })
    const coreboxMock = vi.fn().mockResolvedValue({ success: true })
    const pluginMock = vi.fn().mockResolvedValue({ success: true })
    const resolveMock = vi.fn(
      (item: {
        id: string
        source: 'builtin' | 'plugin'
        target: 'corebox' | 'plugin' | 'system'
      }) => ({
        ...item,
        unavailable: false
      })
    )

    module.hide = hideMock
    module.executeBuiltinFeature = builtinMock
    module.executeCoreBoxTransfer = coreboxMock
    module.executePluginFeature = pluginMock
    module.resolveFeatureItemPayload = resolveMock as (...args: unknown[]) => unknown

    await module.executeFeature({ id: 'builtin.search' })
    await module.executeFeature({ id: 'plugin:demo:corebox' })
    const systemResult = await module.executeFeature({ id: 'plugin:demo:system' })
    await module.executeFeature({ id: 'plugin:demo:run' })

    expect(builtinMock).toHaveBeenCalledTimes(1)
    expect(coreboxMock).toHaveBeenCalledTimes(1)
    expect(pluginMock).toHaveBeenCalledTimes(1)
    expect(systemResult.success).toBe(false)
    expect(systemResult.code).toBe('SYSTEM_TARGET_NOT_IMPLEMENTED')
    expect(hideMock).toHaveBeenCalledTimes(3)
  })
})

describe('OmniPanelModule auto-mount', () => {
  it('prioritizes declared omniTransfer features and dedupes repeated install events', async () => {
    const module = new OmniPanelModule() as unknown as {
      featureRegistry: Array<Record<string, unknown>>
      getSettingsSnapshot: () => { autoMountFirstFeatureOnPluginInstall: boolean }
      getPluginInstance: (pluginName?: string) => ITouchPlugin | undefined
      isFeatureExecutable: (plugin: ITouchPlugin, feature: IPluginFeature) => boolean
      resolveDeclaredTransfer: (
        plugin: ITouchPlugin,
        feature: IPluginFeature
      ) => IFeatureOmniTransfer | null
      autoMountFeatureForPlugin: (pluginName: string) => Promise<void>
      persistFeatureRegistry: () => void
      notifyFeatureRefresh: (reason: string) => void
    }

    const declaredFeature = {
      id: 'declared',
      name: 'Declared Feature',
      desc: 'declared',
      commands: ['run'],
      omniTransfer: {
        enabled: true,
        target: 'corebox',
        title: 'Declared Title',
        subtitle: 'Declared Subtitle'
      }
    } as unknown as IPluginFeature

    const fallbackFeature = {
      id: 'fallback',
      name: 'Fallback Feature',
      desc: 'fallback',
      commands: ['run']
    } as unknown as IPluginFeature

    const plugin = {
      name: 'demo-plugin',
      sdkapi: 251212,
      getFeature: vi.fn((id: string) => {
        if (id === 'declared') return declaredFeature
        if (id === 'fallback') return fallbackFeature
        return null
      }),
      getFeatures: vi.fn(() => [fallbackFeature, declaredFeature])
    } as unknown as ITouchPlugin

    module.featureRegistry = []
    module.getSettingsSnapshot = () => ({ autoMountFirstFeatureOnPluginInstall: true })
    module.getPluginInstance = vi.fn(() => plugin)
    module.isFeatureExecutable = vi.fn(() => true)
    module.resolveDeclaredTransfer = vi.fn((_plugin, feature) =>
      feature.id === 'declared' ? (feature.omniTransfer as IFeatureOmniTransfer) : null
    )
    module.persistFeatureRegistry = vi.fn()
    module.notifyFeatureRefresh = vi.fn()

    await Promise.all([
      module.autoMountFeatureForPlugin('demo-plugin'),
      module.autoMountFeatureForPlugin('demo-plugin')
    ])

    expect(module.featureRegistry).toHaveLength(1)
    expect(module.featureRegistry[0].id).toBe('plugin:demo-plugin:declared')
    expect(module.featureRegistry[0].declarationMode).toBe('declared')
    expect(module.featureRegistry[0].target).toBe('corebox')
  })
})

describe('OmniPanelModule legacy transport', () => {
  it('legacy feature toggle warns once and keeps bridging to toggleFeature', async () => {
    const handlers = new Map<string, (payload: unknown) => Promise<unknown>>()
    getTuffTransportMainMock.mockReturnValue({
      on: vi.fn(
        (event: { toEventName: () => string }, handler: (payload: unknown) => Promise<unknown>) => {
          handlers.set(event.toEventName(), handler)
          return vi.fn()
        }
      ),
      broadcast: vi.fn(),
      sendTo: vi.fn(),
      sendToWindow: vi.fn()
    } as never)

    const module = new OmniPanelModule() as unknown as {
      onInit: (ctx: unknown) => Promise<void>
      toggleFeature: ReturnType<typeof vi.fn>
      legacyUsageCounts: Map<string, number>
    }
    module.toggleFeature = vi.fn()

    await module.onInit({} as never)

    const handler = handlers.get(omniPanelFeatureToggleEvent.toEventName())
    expect(handler).toBeTypeOf('function')

    await handler?.({ id: 'demo', enabled: true })
    await handler?.({ id: 'demo', enabled: false })

    expect(module.toggleFeature).toHaveBeenCalledTimes(2)
    expect(module.toggleFeature).toHaveBeenNthCalledWith(
      1,
      { id: 'demo', enabled: true },
      'legacy-toggle'
    )
    expect(module.toggleFeature).toHaveBeenNthCalledWith(
      2,
      { id: 'demo', enabled: false },
      'legacy-toggle'
    )
    expect(loggerWarnMock).toHaveBeenCalledTimes(1)
    expect(module.legacyUsageCounts.get(omniPanelFeatureToggleEvent.toEventName())).toBe(2)
  })
})

describe('OmniPanel smoke', () => {
  it('supports show -> execute builtin -> hide flow', async () => {
    const module = new OmniPanelModule() as unknown as {
      show: (options?: { captureSelection?: boolean; source?: string }) => Promise<void>
      executeFeature: (payload: {
        id: string
        contextText: string
        source: string
      }) => Promise<{ success: boolean }>
      featureRegistry: Array<Record<string, unknown>>
      ensureWindow: () => Promise<{
        window: { showInactive: () => void; isDestroyed: () => boolean }
      }>
      positionWindowNearCursor: () => void
      pushContext: (text: string, source: string) => Promise<void>
      notifyFeatureRefresh: (reason: string) => void
      captureSelectionText: () => Promise<string>
      resolveFeatureItemPayload: (...args: unknown[]) => unknown
      executeBuiltinFeature: (...args: unknown[]) => Promise<{ success: boolean }>
      hide: () => void
      transport: null | { sendTo: () => Promise<void> }
    }

    const showInactiveMock = vi.fn()
    const hideMock = vi.fn()

    module.transport = null
    module.featureRegistry = [
      {
        id: 'builtin.copy',
        source: 'builtin',
        target: 'system'
      }
    ]
    module.ensureWindow = vi.fn(async () => ({
      window: {
        showInactive: showInactiveMock,
        isDestroyed: () => false
      }
    }))
    module.positionWindowNearCursor = vi.fn()
    module.pushContext = vi.fn(async () => {})
    module.notifyFeatureRefresh = vi.fn()
    module.captureSelectionText = vi.fn(async () => 'copied-text')
    module.resolveFeatureItemPayload = vi.fn(
      (item: { id: string; source: string; target: string }) => ({
        ...item,
        unavailable: false
      })
    ) as (...args: unknown[]) => unknown
    module.executeBuiltinFeature = vi.fn(async () => ({ success: true }))
    module.hide = hideMock

    await module.show({ captureSelection: true, source: 'shortcut' })
    const result = await module.executeFeature({
      id: 'builtin.copy',
      contextText: 'copied-text',
      source: 'shortcut'
    })

    expect(showInactiveMock).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(true)
    expect(hideMock).toHaveBeenCalledTimes(1)
  })
})

describe('OmniPanel execute failure paths', () => {
  it('returns FEATURE_UNAVAILABLE when resolved feature is unavailable', async () => {
    const module = new OmniPanelModule() as unknown as {
      featureRegistry: Array<Record<string, unknown>>
      executeFeature: (payload: {
        id: string
      }) => Promise<{ success: boolean; code?: string; error?: string }>
      resolveFeatureItemPayload: (...args: unknown[]) => unknown
      executeBuiltinFeature: (...args: unknown[]) => Promise<{ success: boolean }>
      executeCoreBoxTransfer: (...args: unknown[]) => Promise<{ success: boolean }>
      executePluginFeature: (...args: unknown[]) => Promise<{ success: boolean }>
    }

    module.featureRegistry = [{ id: 'plugin:demo:run', source: 'plugin', target: 'plugin' }]
    module.resolveFeatureItemPayload = vi.fn(() => ({
      id: 'plugin:demo:run',
      source: 'plugin',
      target: 'plugin',
      unavailable: true,
      unavailableReason: {
        code: 'PLUGIN_UNAVAILABLE',
        message: 'plugin temporarily unavailable'
      }
    })) as (...args: unknown[]) => unknown

    module.executeBuiltinFeature = vi.fn(async () => ({ success: true }))
    module.executeCoreBoxTransfer = vi.fn(async () => ({ success: true }))
    module.executePluginFeature = vi.fn(async () => ({ success: true }))

    const result = await module.executeFeature({ id: 'plugin:demo:run' })

    expect(result.success).toBe(false)
    expect(result.code).toBe('FEATURE_UNAVAILABLE')
    expect(result.error).toContain('unavailable')
  })

  it('returns SELECTION_REQUIRED when builtin system actions have empty context', async () => {
    const module = new OmniPanelModule() as unknown as {
      executeBuiltinFeature: (
        featureId: string,
        contextText: string,
        source: 'manual'
      ) => Promise<{ success: boolean; code?: string }>
    }

    await expect(module.executeBuiltinFeature('builtin.copy', '', 'manual')).resolves.toMatchObject(
      {
        success: false,
        code: 'SELECTION_REQUIRED'
      }
    )
    await expect(
      module.executeBuiltinFeature('builtin.search', '   ', 'manual')
    ).resolves.toMatchObject({
      success: false,
      code: 'SELECTION_REQUIRED'
    })
    await expect(
      module.executeBuiltinFeature('builtin.translate', '', 'manual')
    ).resolves.toMatchObject({
      success: false,
      code: 'SELECTION_REQUIRED'
    })
  })

  it('returns PLUGIN_NOT_FOUND when plugin feature target plugin is missing', async () => {
    const module = new OmniPanelModule() as unknown as {
      executePluginFeature: (
        item: {
          pluginName?: string
          featureId?: string
          acceptedInputTypes?: string[]
          id: string
          source: 'plugin'
          target: 'plugin'
          title: string
          subtitle: string
          icon: null
          enabled: boolean
          order: number
          createdAt: number
          updatedAt: number
        },
        contextText: string,
        source: 'manual'
      ) => Promise<{ success: boolean; code?: string }>
      getPluginInstance: (pluginName?: string) => unknown
    }

    module.getPluginInstance = vi.fn(() => undefined)
    const result = await module.executePluginFeature(
      {
        id: 'plugin:demo:run',
        source: 'plugin',
        target: 'plugin',
        pluginName: 'demo-plugin',
        featureId: 'run',
        title: 'run',
        subtitle: '',
        icon: null,
        enabled: true,
        order: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      'hello',
      'manual'
    )

    expect(result.success).toBe(false)
    expect(result.code).toBe('PLUGIN_NOT_FOUND')
  })
})

describe('OmniPanel shortcut and input-hook guards', () => {
  it('falls back to toggle immediately when shortcut key map is unavailable', () => {
    const module = new OmniPanelModule() as unknown as {
      shortcutHoldEnabled: boolean
      inputHookKeys: null
      handleShortcutPressed: () => void
      toggle: (options: { captureSelection: boolean; source: string }) => void
    }

    const toggleMock = vi.fn()
    module.shortcutHoldEnabled = true
    module.inputHookKeys = null
    module.toggle = toggleMock as unknown as (options: {
      captureSelection: boolean
      source: string
    }) => void

    module.handleShortcutPressed()
    expect(toggleMock).toHaveBeenCalledWith({ captureSelection: true, source: 'shortcut' })
  })

  it('re-arms and triggers shortcut when combo already active long enough', () => {
    const module = new OmniPanelModule() as unknown as {
      shortcutHoldEnabled: boolean
      inputHookKeys: { P: number }
      shortcutComboActive: boolean
      shortcutComboStartedAt: number | null
      shortcutTriggerArmed: boolean
      handleShortcutPressed: () => void
      triggerArmedShortcut: () => void
    }

    const triggerMock = vi.fn()
    module.shortcutHoldEnabled = true
    module.inputHookKeys = { P: 25 }
    module.shortcutComboActive = true
    module.shortcutComboStartedAt = Date.now() - 500
    module.shortcutTriggerArmed = false
    module.triggerArmedShortcut = triggerMock as unknown as () => void

    module.handleShortcutPressed()

    expect(module.shortcutTriggerArmed).toBe(true)
    expect(triggerMock).toHaveBeenCalledTimes(1)
  })

  it('cleans up input hook when both mouse long press and shortcut hold are disabled', () => {
    const module = new OmniPanelModule() as unknown as {
      mouseLongPressEnabled: boolean
      shortcutHoldEnabled: boolean
      syncInputHookState: () => void
      clearLongPressTimer: () => void
      clearShortcutHoldTimer: () => void
      clearShortcutArmExpiryTimer: () => void
      resetShortcutHoldState: () => void
      cleanupInputHook: () => void
    }

    const clearLongPressTimer = vi.fn()
    const clearShortcutHoldTimer = vi.fn()
    const clearShortcutArmExpiryTimer = vi.fn()
    const resetShortcutHoldState = vi.fn()
    const cleanupInputHook = vi.fn()

    module.mouseLongPressEnabled = false
    module.shortcutHoldEnabled = false
    module.clearLongPressTimer = clearLongPressTimer
    module.clearShortcutHoldTimer = clearShortcutHoldTimer
    module.clearShortcutArmExpiryTimer = clearShortcutArmExpiryTimer
    module.resetShortcutHoldState = resetShortcutHoldState
    module.cleanupInputHook = cleanupInputHook

    module.syncInputHookState()

    expect(clearLongPressTimer).toHaveBeenCalledTimes(1)
    expect(clearShortcutHoldTimer).toHaveBeenCalledTimes(1)
    expect(clearShortcutArmExpiryTimer).toHaveBeenCalledTimes(1)
    expect(resetShortcutHoldState).toHaveBeenCalledTimes(1)
    expect(cleanupInputHook).toHaveBeenCalledTimes(1)
  })

  it('does not re-enable input hook after module enters destroying state', () => {
    const module = new OmniPanelModule() as unknown as {
      destroying: boolean
      mouseLongPressEnabled: boolean
      shortcutHoldEnabled: boolean
      syncInputHookState: () => void
      setupInputHook: () => void
      cleanupInputHook: () => void
    }

    const setupInputHook = vi.fn()
    const cleanupInputHook = vi.fn()
    module.destroying = true
    module.mouseLongPressEnabled = true
    module.shortcutHoldEnabled = true
    module.setupInputHook = setupInputHook
    module.cleanupInputHook = cleanupInputHook

    module.syncInputHookState()

    expect(cleanupInputHook).toHaveBeenCalledTimes(1)
    expect(setupInputHook).not.toHaveBeenCalled()
  })
})
