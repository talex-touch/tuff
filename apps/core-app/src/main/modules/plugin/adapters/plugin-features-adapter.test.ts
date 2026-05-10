import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import { describe, expect, it, vi } from 'vitest'
import { PluginFeaturesAdapter } from './plugin-features-adapter'

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
})
