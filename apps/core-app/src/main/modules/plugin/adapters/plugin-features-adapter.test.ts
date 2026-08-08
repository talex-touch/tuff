import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { IProviderActivate } from '@talex-touch/utils'
import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import type { CoreBoxInputChangeRequest } from '@talex-touch/utils/transport/events/types'
import { describe, expect, it, vi } from 'vitest'
import { PluginStatus } from '@talex-touch/utils/plugin'
import { PluginFeaturesAdapter } from './plugin-features-adapter'
import { pluginModule } from '../plugin-module'
import { PluginViewLoader } from '../view/plugin-view-loader'

const searchEngineHost = {
  getActivationState: vi.fn<() => IProviderActivate[] | null>(() => null),
  activateProviders: vi.fn(),
  deactivateProvider: vi.fn()
}

/** Every adapter under test is attached, mirroring what search-core does at registration. */
function createAdapter(): PluginFeaturesAdapter {
  const adapter = new PluginFeaturesAdapter()
  adapter.attach(searchEngineHost)
  return adapter
}

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
    const adapter = createAdapter()
    const item = adapter.createTuffItem(
      createPlugin(),
      createFeature(),
      [{ start: 0, end: 7 }],
      'token'
    )

    expect(item.meta?.extension?.source).toBe('token')
    expect(item.meta?.extension?.matchResult).toEqual([{ start: 0, end: 7 }])
  })

  it('preserves matched alias metadata for visible token highlighting', () => {
    const adapter = createAdapter()
    const item = adapter.createTuffItem(createPlugin(), createFeature(), [], 'token', {
      text: 'Clipboard',
      matchRanges: [{ start: 0, end: 'Clipboard'.length }]
    })

    expect(item.meta?.extension?.matchAlias).toEqual({
      text: 'Clipboard',
      matchResult: [{ start: 0, end: 'Clipboard'.length }]
    })
  })

  it('includes feature id in generated search tokens for alias/id matching', () => {
    const adapter = createAdapter()
    const feature = {
      ...createFeature(),
      id: 'clipboard-history',
      name: '剪贴板历史记录',
      desc: '查看和管理剪贴板历史记录'
    }
    const item = adapter.createTuffItem(createPlugin(), feature)

    expect(item.meta?.extension?.searchTokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'clipboard-history', source: 'id' })
      ])
    )
  })

  it('generates typed pinyin evidence for compound Chinese feature names', () => {
    const adapter = createAdapter()
    const feature = {
      ...createFeature(),
      id: 'wechat-message',
      name: '微信消息',
      desc: '发送微信消息'
    }
    const item = adapter.createTuffItem(createPlugin(), feature)

    expect(item.meta?.extension?.searchTokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 'wxxx',
          source: 'initials',
          segments: [
            { tokenStart: 0, tokenEnd: 1, titleStart: 0, titleEnd: 1 },
            { tokenStart: 1, tokenEnd: 2, titleStart: 1, titleEnd: 2 },
            { tokenStart: 2, tokenEnd: 3, titleStart: 2, titleEnd: 3 },
            { tokenStart: 3, tokenEnd: 4, titleStart: 3, titleEnd: 4 }
          ]
        }),
        expect.objectContaining({ value: 'wechat-message', source: 'id' })
      ])
    )
  })

  it('does not force footer hints hidden for plugin feature items by default', () => {
    const adapter = createAdapter()
    const item = adapter.createTuffItem(createPlugin(), createFeature())

    expect(item.meta?.footerHints).toBeUndefined()
  })

  it('preserves explicit color and colorful feature icons for CoreBox rendering', () => {
    const adapter = createAdapter()
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
    const adapter = createAdapter()
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
    const adapter = createAdapter()
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
    const adapter = createAdapter()
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
    const adapter = createAdapter()
    const pushFeature = { ...createFeature(), push: true }
    const plugin = {
      ...createPlugin(),
      status: PluginStatus.ACTIVE,
      getFeature: vi.fn(() => pushFeature),
      getFeatures: vi.fn(() => [pushFeature])
    } as unknown as ITouchPlugin
    ;(pluginModule.pluginManager!.plugins as Map<string, ITouchPlugin>).set('test-plugin', plugin)
    searchEngineHost.getActivationState.mockReturnValue([
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
    searchEngineHost.getActivationState.mockReturnValue(null)
  })

  it('forwards empty input to active push features', async () => {
    const adapter = createAdapter()
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
    searchEngineHost.getActivationState.mockReturnValue([
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
    searchEngineHost.getActivationState.mockReturnValue(null)
  })

  it('routes pushed item actionId when defaultAction is omitted', async () => {
    const adapter = createAdapter()
    const activation = { id: 'plugin-features', meta: { pluginName: 'test-plugin' } }
    const onItemAction = vi.fn(async () => ({
      externalAction: true,
      shouldActivate: true,
      activation
    }))
    const plugin = {
      ...createPlugin(),
      status: PluginStatus.ACTIVE,
      pluginLifecycle: {
        onItemAction
      }
    } as unknown as ITouchPlugin
    ;(pluginModule.pluginManager!.plugins as Map<string, ITouchPlugin>).set('test-plugin', plugin)

    const result = await adapter.onExecute({
      item: {
        id: 'test-plugin/widget-ready',
        source: { type: 'plugin', id: 'plugin-features', name: 'Plugin Features' },
        kind: 'feature',
        meta: {
          pluginName: 'test-plugin',
          actionId: 'copy-answer',
          payload: {
            answer: 'ready answer'
          }
        }
      }
    } as never)

    expect(result).toEqual(activation)
    expect(onItemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          actionId: 'copy-answer',
          payload: expect.objectContaining({
            answer: 'ready answer'
          })
        })
      }),
      { actionId: undefined }
    )
    ;(pluginModule.pluginManager!.plugins as Map<string, ITouchPlugin>).clear()
  })

  it('honors explicit hidden input for webcontent features with accepted inputs', async () => {
    const adapter = createAdapter()
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
    expect(searchEngineHost.activateProviders).toHaveBeenCalledWith([
      expect.objectContaining({ showInput: false, forceMax: true })
    ])
    ;(pluginModule.pluginManager!.plugins as Map<string, ITouchPlugin>).clear()
  })

  it('keeps push widget feature activations at normal height by default', async () => {
    const adapter = createAdapter()
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
    expect(searchEngineHost.activateProviders).toHaveBeenCalledWith([
      expect.objectContaining({ forceMax: false, hideResults: false, showInput: true })
    ])
    ;(pluginModule.pluginManager!.plugins as Map<string, ITouchPlugin>).clear()
  })

  it('propagates forceMax for push widget feature activations', async () => {
    const adapter = createAdapter()
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
    expect(searchEngineHost.activateProviders).toHaveBeenCalledWith([
      expect.objectContaining({ forceMax: true, hideResults: false, showInput: true })
    ])
    ;(pluginModule.pluginManager!.plugins as Map<string, ITouchPlugin>).clear()
  })
})

describe('search engine coupling (#523)', () => {
  const SOURCE = readFileSync(path.join(__dirname, 'plugin-features-adapter.ts'), 'utf8')

  it('does not import the search engine', () => {
    // Positive control: the read must have produced the real file, or the absence check below
    // would pass over an empty string.
    expect(SOURCE).toContain('export class PluginFeaturesAdapter')
    expect(SOURCE.length).toBeGreaterThan(1000)

    // search-core imports this module to register it, so importing back closes the cycle that
    // makes whichever module evaluates second see a half-built binding.
    const imports = SOURCE.split('\n').filter(
      (line) => /^\s*import\b/.test(line) && !/^\s*import\s+type\b/.test(line)
    )

    // Second control, on the filter rather than the read: it has to actually extract value
    // imports, or the assertion below is checking an empty list.
    expect(imports.some((line) => line.includes('@talex-touch/utils'))).toBe(true)

    expect(imports.filter((line) => line.includes('search-engine/search-core'))).toEqual([])
  })

  it('refuses to run before the engine attaches', async () => {
    // The point of throwing rather than no-oping. Under the old cycle a half-initialized import
    // would have registered undefined and plugin features would have quietly stopped appearing
    // in CoreBox with nothing logged; this makes that state impossible to reach silently.
    const detached = new PluginFeaturesAdapter()

    await expect(
      detached.handleActiveFeatureInput({
        query: { text: '' }
      } as unknown as CoreBoxInputChangeRequest)
    ).rejects.toThrow(/attach\(\) must run/)
  })

  it('is satisfied by the shape search-core passes it', () => {
    // Guards the structural interface from drifting into something the real engine does not
    // implement. attach() is typed, so this is really a compile-time check made visible.
    const adapter = new PluginFeaturesAdapter()
    const host = {
      getActivationState: () => null,
      activateProviders: () => {},
      deactivateProvider: () => {}
    }

    expect(() => adapter.attach(host)).not.toThrow()
  })
})
