import type { IProviderActivate } from '@talex-touch/utils'
import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import type { CoreBoxInputChangeRequest } from '@talex-touch/utils/transport/events/types'
import { describe, expect, it, vi } from 'vitest'
import { PluginStatus } from '@talex-touch/utils/plugin'
import { PluginFeaturesAdapter } from './plugin-features-adapter'
import searchEngineCore from '../../box-tool/search-engine/search-core'
import { pluginModule } from '../plugin-module'
import { PluginViewLoader } from '../view/plugin-view-loader'

vi.mock('../../box-tool/search-engine/search-core', () => ({
  default: {
    getActivationState: vi.fn(() => null),
    activateProviders: vi.fn(),
    deactivateProvider: vi.fn()
  }
}))

vi.mock('../plugin-module', () => ({
  pluginModule: {
    pluginManager: {
      plugins: new Map()
    }
  }
}))

vi.mock('../view/plugin-view-loader', () => ({
  PluginViewLoader: {
    loadPluginView: vi.fn()
  }
}))

vi.mock('../../../core/runtime-accessor', () => ({
  getRegisteredMainRuntime: vi.fn(() => ({
    transport: {
      broadcastPlugin: vi.fn()
    }
  }))
}))

vi.mock('../../box-tool/search-engine/utils/resolve-clipboard-inputs', () => ({
  resolveClipboardInputs: vi.fn(async () => ({ resolvedCount: 0, clipboardIds: [] }))
}))

function createPlugin(): ITouchPlugin {
  return {
    name: 'test-plugin',
    icon: { type: 'emoji', value: 'T' }
  } as ITouchPlugin
}

function createFeature(): IPluginFeature {
  return {
    id: 'ai-chat',
    name: 'AI Chat',
    desc: 'Open a model chat provider',
    icon: { type: 'emoji', value: 'C' },
    commands: [],
    platform: ['darwin', 'win32', 'linux'],
    push: false,
    priority: 0
  } as IPluginFeature
}

describe('plugin-features-adapter', () => {
  it('preserves feature match source metadata for cross-provider sorting', () => {
    const adapter = new PluginFeaturesAdapter()
    const item = adapter.createTuffItem(
      createPlugin(),
      createFeature(),
      [{ start: 0, end: 7 }],
      'token'
    )

    expect(item.meta?.extension?.source).toBe('token')
    expect(item.meta?.extension?.matchResult).toEqual([{ start: 0, end: 7 }])
  })

  it('does not force footer hints hidden for plugin feature items by default', () => {
    const adapter = new PluginFeaturesAdapter()
    const item = adapter.createTuffItem(createPlugin(), createFeature())

    expect(item.meta?.footerHints).toBeUndefined()
  })

  it('preserves explicit color and colorful feature icons for CoreBox rendering', () => {
    const adapter = new PluginFeaturesAdapter()
    const item = adapter.createTuffItem(createPlugin(), {
      ...createFeature(),
      icon: { type: 'file', value: 'assets/logo.svg', color: '#22c55e', colorful: true }
    })

    expect(item.render.basic?.icon).toMatchObject({
      type: 'file',
      value: 'assets/logo.svg',
      color: '#22c55e',
      colorful: true
    })
  })

  it('keeps class feature icons in the themed icon branch', () => {
    const adapter = new PluginFeaturesAdapter()
    const item = adapter.createTuffItem(createPlugin(), {
      ...createFeature(),
      icon: { type: 'class', value: 'i-ri-clipboard-line' }
    })

    expect(item.render.basic?.icon).toMatchObject({
      type: 'class',
      value: 'i-ri-clipboard-line'
    })
  })

  it('normalizes legacy remixicon values to UnoCSS icon classes', () => {
    const adapter = new PluginFeaturesAdapter()
    const dashItem = adapter.createTuffItem(createPlugin(), {
      ...createFeature(),
      icon: { type: 'remixicon' as never, value: 'ri-clipboard-line' }
    })
    const colonItem = adapter.createTuffItem(createPlugin(), {
      ...createFeature(),
      icon: { type: 'remixicon' as never, value: 'ri:json-line' }
    })

    expect(dashItem.render.basic?.icon).toMatchObject({
      type: 'class',
      value: 'i-ri-clipboard-line'
    })
    expect(colonItem.render.basic?.icon).toMatchObject({
      type: 'class',
      value: 'i-ri-json-line'
    })
  })

  it('honors explicit plugin feature footer hint declarations', () => {
    const adapter = new PluginFeaturesAdapter()
    const item = adapter.createTuffItem(createPlugin(), {
      ...createFeature(),
      footerHints: {
        primary: {
          visible: true,
          label: 'Run'
        },
        secondary: {
          visible: true,
          label: 'More'
        }
      }
    })

    expect(item.meta?.footerHints?.primary).toMatchObject({
      visible: true,
      label: 'Run'
    })
    expect(item.meta?.footerHints?.secondary).toMatchObject({
      visible: true,
      label: 'More'
    })
  })

  it('does not repopulate feature items for active push features with empty query', async () => {
    const adapter = new PluginFeaturesAdapter()
    const pushFeature = { ...createFeature(), push: true }
    const plugin = {
      ...createPlugin(),
      status: PluginStatus.ACTIVE,
      getFeature: vi.fn(() => pushFeature),
      getFeatures: vi.fn(() => [pushFeature])
    } as unknown as ITouchPlugin
    ;(pluginModule.pluginManager!.plugins as Map<string, ITouchPlugin>).set('test-plugin', plugin)
    vi.mocked(searchEngineCore.getActivationState).mockReturnValue([
      {
        id: 'plugin-features',
        meta: {
          pluginName: 'test-plugin',
          featureId: pushFeature.id
        }
      }
    ] as IProviderActivate[])

    const result = await adapter.onSearch({ text: '', inputs: [] }, new AbortController().signal)

    expect(result.items).toEqual([])
    expect(result.activate).toHaveLength(1)
    expect(plugin.getFeatures).not.toHaveBeenCalled()
    ;(pluginModule.pluginManager!.plugins as Map<string, ITouchPlugin>).clear()
    vi.mocked(searchEngineCore.getActivationState).mockReturnValue(null)
  })

  it('forwards empty input to active push features', async () => {
    const adapter = new PluginFeaturesAdapter()
    const pushFeature = { ...createFeature(), push: true }
    const triggerFeature = vi.fn(async () => true)
    const triggerInputChanged = vi.fn()
    const plugin = {
      ...createPlugin(),
      status: PluginStatus.ACTIVE,
      getFeature: vi.fn(() => pushFeature),
      triggerFeature,
      triggerInputChanged
    } as unknown as ITouchPlugin
    ;(pluginModule.pluginManager!.plugins as Map<string, ITouchPlugin>).set('test-plugin', plugin)
    vi.mocked(searchEngineCore.getActivationState).mockReturnValue([
      {
        id: 'plugin-features',
        meta: {
          pluginName: 'test-plugin',
          featureId: pushFeature.id
        }
      }
    ] as IProviderActivate[])

    const query = { text: '', inputs: [] }
    const result = await adapter.handleActiveFeatureInput({
      input: '',
      query,
      source: 'renderer'
    } satisfies CoreBoxInputChangeRequest)

    expect(result).toBe(true)
    expect(triggerFeature).toHaveBeenCalledWith(pushFeature, query)
    expect(triggerInputChanged).toHaveBeenCalledWith(pushFeature, query)
    ;(pluginModule.pluginManager!.plugins as Map<string, ITouchPlugin>).clear()
    vi.mocked(searchEngineCore.getActivationState).mockReturnValue(null)
  })

  it('honors explicit hidden input for webcontent features with accepted inputs', async () => {
    const adapter = new PluginFeaturesAdapter()
    const feature = {
      ...createFeature(),
      acceptedInputTypes: ['text'],
      interaction: {
        type: 'webcontent',
        path: '/manager',
        showInput: false,
        allowInput: false,
        forceMax: true
      }
    } as IPluginFeature
    const plugin = {
      ...createPlugin(),
      status: PluginStatus.ACTIVE,
      issues: [],
      getFeature: vi.fn(() => feature)
    } as unknown as ITouchPlugin
    ;(pluginModule.pluginManager!.plugins as Map<string, ITouchPlugin>).set('test-plugin', plugin)
    vi.mocked(PluginViewLoader.loadPluginView).mockResolvedValue(undefined)

    const activation = await adapter.onExecute({
      item: {
        id: 'test-plugin/manager',
        source: { type: 'plugin', id: 'plugin-features', name: 'Plugin Features' },
        kind: 'feature',
        meta: {
          pluginName: 'test-plugin',
          featureId: feature.id
        }
      },
      searchResult: {
        query: { text: 'clipboard' },
        items: []
      }
    } as never)

    expect(activation?.showInput).toBe(false)
    expect(activation?.forceMax).toBe(true)
    expect(searchEngineCore.activateProviders).toHaveBeenCalledWith([
      expect.objectContaining({ showInput: false, forceMax: true })
    ])
    ;(pluginModule.pluginManager!.plugins as Map<string, ITouchPlugin>).clear()
  })

  it('keeps push widget feature activations at normal height by default', async () => {
    const adapter = new PluginFeaturesAdapter()
    const feature = {
      ...createFeature(),
      push: true,
      interaction: {
        type: 'widget',
        path: 'panel',
        showInput: true,
        allowInput: true
      }
    } as IPluginFeature
    const triggerFeature = vi.fn(async () => true)
    const plugin = {
      ...createPlugin(),
      status: PluginStatus.ACTIVE,
      getFeature: vi.fn(() => feature),
      triggerFeature
    } as unknown as ITouchPlugin
    ;(pluginModule.pluginManager!.plugins as Map<string, ITouchPlugin>).set('test-plugin', plugin)

    const activation = await adapter.onExecute({
      item: {
        id: 'test-plugin/widget',
        source: { type: 'plugin', id: 'plugin-features', name: 'Plugin Features' },
        kind: 'feature',
        meta: {
          pluginName: 'test-plugin',
          featureId: feature.id
        }
      },
      searchResult: {
        query: { text: 'hello' },
        items: []
      }
    } as never)

    expect(activation?.forceMax).toBe(false)
    expect(searchEngineCore.activateProviders).toHaveBeenCalledWith([
      expect.objectContaining({ forceMax: false, hideResults: false, showInput: true })
    ])
    ;(pluginModule.pluginManager!.plugins as Map<string, ITouchPlugin>).clear()
  })

  it('propagates forceMax for push widget feature activations', async () => {
    const adapter = new PluginFeaturesAdapter()
    const feature = {
      ...createFeature(),
      push: true,
      interaction: {
        type: 'widget',
        path: 'panel',
        showInput: true,
        allowInput: true,
        forceMax: true
      }
    } as IPluginFeature
    const triggerFeature = vi.fn(async () => true)
    const plugin = {
      ...createPlugin(),
      status: PluginStatus.ACTIVE,
      getFeature: vi.fn(() => feature),
      triggerFeature
    } as unknown as ITouchPlugin
    ;(pluginModule.pluginManager!.plugins as Map<string, ITouchPlugin>).set('test-plugin', plugin)

    const activation = await adapter.onExecute({
      item: {
        id: 'test-plugin/widget',
        source: { type: 'plugin', id: 'plugin-features', name: 'Plugin Features' },
        kind: 'feature',
        meta: {
          pluginName: 'test-plugin',
          featureId: feature.id
        }
      },
      searchResult: {
        query: { text: 'hello' },
        items: []
      }
    } as never)

    expect(activation?.forceMax).toBe(true)
    expect(searchEngineCore.activateProviders).toHaveBeenCalledWith([
      expect.objectContaining({ forceMax: true, hideResults: false, showInput: true })
    ])
    ;(pluginModule.pluginManager!.plugins as Map<string, ITouchPlugin>).clear()
  })
})
