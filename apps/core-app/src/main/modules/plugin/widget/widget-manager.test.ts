import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import type { WidgetSource } from './widget-loader'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  broadcastToWindow: vi.fn(),
  compileWidgetSource: vi.fn(),
  loadWidget: vi.fn(),
  mainWindow: {
    id: 11,
    isDestroyed: vi.fn(() => false)
  }
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    broadcastToWindow: mocks.broadcastToWindow
  }))
}))

vi.mock('../../../core/runtime-accessor', () => ({
  getRegisteredMainRuntime: vi.fn(() => ({
    app: {
      window: {
        window: mocks.mainWindow
      }
    },
    channel: {}
  }))
}))

vi.mock('../../box-tool/core-box/window', () => ({
  getCoreBoxWindow: vi.fn(() => null)
}))

vi.mock('./widget-compiler', () => ({
  compileWidgetSource: mocks.compileWidgetSource
}))

vi.mock('./widget-loader', () => ({
  pluginWidgetLoader: {
    loadWidget: mocks.loadWidget
  },
  resolveWidgetFilePath: vi.fn(
    (pluginPath: string, rawPath: string) => `${pluginPath}/widgets/${rawPath}`
  )
}))

import { WidgetManager } from './widget-manager'

function createPlugin(): ITouchPlugin {
  return {
    issues: [],
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn()
    },
    name: 'test-plugin',
    pluginPath: '/plugin'
  } as unknown as ITouchPlugin
}

function createFeature(): IPluginFeature {
  return {
    id: 'test.widget',
    interaction: {
      path: 'panel.ts',
      type: 'widget'
    }
  } as IPluginFeature
}

function createSource(): WidgetSource {
  return {
    featureId: 'test.widget',
    filePath: '/plugin/widgets/panel.ts',
    hash: 'same-source-hash',
    loadedAt: Date.now(),
    pluginName: 'test-plugin',
    source: 'export default {}',
    widgetId: 'test-plugin::test.widget'
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('WidgetManager failure cache', () => {
  it('does not recompile the same widget hash after a short-lived compile failure', async () => {
    const manager = new WidgetManager()
    const plugin = createPlugin()
    const feature = createFeature()
    const binaryError = Object.assign(new Error('spawn ENOTDIR'), { code: 'ENOTDIR' })

    mocks.loadWidget.mockResolvedValue(createSource())
    mocks.compileWidgetSource.mockRejectedValue(binaryError)

    await manager.registerWidget(plugin, feature)
    await manager.registerWidget(plugin, feature)

    expect(mocks.compileWidgetSource).toHaveBeenCalledTimes(1)
    expect(mocks.broadcastToWindow).toHaveBeenCalledTimes(2)
    expect(mocks.broadcastToWindow.mock.calls[0]?.[2]).toMatchObject({
      code: 'WIDGET_COMPILER_BINARY_UNAVAILABLE',
      featureId: 'test.widget',
      hash: 'same-source-hash',
      pluginName: 'test-plugin',
      widgetId: 'test-plugin::test.widget'
    })
    expect(plugin.issues).toHaveLength(1)
    expect(plugin.issues[0]).toMatchObject({
      code: 'WIDGET_COMPILER_BINARY_UNAVAILABLE',
      meta: {
        causeCode: 'ENOTDIR',
        filePath: '/plugin/widgets/panel.ts',
        hash: 'same-source-hash',
        widgetId: 'test-plugin::test.widget'
      }
    })
  })
})
