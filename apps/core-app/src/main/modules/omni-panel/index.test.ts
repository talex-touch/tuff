import { describe, expect, it, vi } from 'vitest'

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
  getTuffTransportMain: vi.fn(() => ({
    on: vi.fn(() => () => {}),
    broadcast: vi.fn(),
    sendTo: vi.fn(),
    sendToWindow: vi.fn()
  }))
}))

vi.mock('../global-shortcon', () => ({
  shortcutModule: {
    registerMainShortcut: vi.fn(),
    registerMainTrigger: vi.fn()
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

import type { IFeatureOmniTransfer, IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import { OmniPanelModule } from './index'

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
      resolveFeatureItemPayload: (...args: any[]) => unknown
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
    module.resolveFeatureItemPayload = resolveMock as (...args: any[]) => unknown

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
      resolveFeatureItemPayload: (...args: any[]) => unknown
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
    ) as (...args: any[]) => unknown
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
