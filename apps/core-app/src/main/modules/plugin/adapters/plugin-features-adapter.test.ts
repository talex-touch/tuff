import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import { describe, expect, it, vi } from 'vitest'
import { PluginStatus } from '@talex-touch/utils/plugin'
import { PluginFeaturesAdapter } from './plugin-features-adapter'
import searchEngineCore from '../../box-tool/search-engine/search-core'
import { pluginModule } from '../plugin-module'

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
    channel: {
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
    ] as any)

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
    ] as any)

    const query = { text: '', inputs: [] }
    const result = await adapter.handleActiveFeatureInput({
      input: '',
      query,
      source: 'keyboard'
    } as any)

    expect(result).toBe(true)
    expect(triggerFeature).toHaveBeenCalledWith(pushFeature, query)
    expect(triggerInputChanged).toHaveBeenCalledWith(pushFeature, query)
    ;(pluginModule.pluginManager!.plugins as Map<string, ITouchPlugin>).clear()
    vi.mocked(searchEngineCore.getActivationState).mockReturnValue(null)
  })
})
