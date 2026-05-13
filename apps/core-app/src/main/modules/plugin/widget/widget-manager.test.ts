import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import type { WidgetSource } from './widget-loader'
import path from 'node:path'
import fs from 'fs-extra'
import os from 'node:os'
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
    (pluginPath: string, rawPath: string) => {
      const normalized = rawPath.replace(/\\/g, '/')
      const resolvedPath = `${pluginPath}/widgets/${normalized}`
      return /\.[a-z0-9]+$/i.test(resolvedPath) ? resolvedPath : `${resolvedPath}.vue`
    }
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
    pluginPath: '/plugin',
    dev: { enable: true, address: 'http://localhost:3000', source: true }
  } as unknown as ITouchPlugin
}

async function createPackagedPluginRoot() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-widget-precompiled-'))
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

describe('WidgetManager precompiled widgets', () => {
  it('registers packaged precompiled output without runtime compilation', async () => {
    const root = await createPackagedPluginRoot()
    try {
      const manager = new WidgetManager()
      const plugin = {
        ...createPlugin(),
        dev: { enable: false, address: '', source: false },
        pluginPath: root,
        build: {
          widgets: [
            {
              compiledAt: Date.now(),
              compiledPath: 'widgets/.compiled/test-plugin__test.widget.cjs',
              dependencies: ['vue'],
              featureId: 'test.widget',
              hash: 'same-source-hash',
              metaPath: 'widgets/.compiled/test-plugin__test.widget.meta.json',
              sourcePath: 'widgets/panel.ts',
              styles: '.panel{}',
              widgetId: 'test-plugin::test.widget'
            }
          ]
        }
      } as ITouchPlugin
      const feature = createFeature()
      const compiledPath = path.join(root, 'widgets', '.compiled', 'test-plugin__test.widget.cjs')
      const metaPath = path.join(root, 'widgets', '.compiled', 'test-plugin__test.widget.meta.json')

      await fs.ensureDir(path.dirname(compiledPath))
      await fs.writeFile(compiledPath, 'module.exports = {}', 'utf-8')
      await fs.writeJson(metaPath, {
        compiledAt: Date.now(),
        compiledPath: 'widgets/.compiled/test-plugin__test.widget.cjs',
        dependencies: ['vue'],
        featureId: 'test.widget',
        hash: 'same-source-hash',
        sourcePath: 'widgets/panel.ts',
        styles: '.panel{}',
        widgetId: 'test-plugin::test.widget'
      })

      await manager.registerWidget(plugin, feature)

      expect(mocks.loadWidget).not.toHaveBeenCalled()
      expect(mocks.compileWidgetSource).not.toHaveBeenCalled()
      expect(mocks.broadcastToWindow).toHaveBeenCalledWith(
        11,
        expect.anything(),
        expect.objectContaining({
          code: 'module.exports = {}',
          dependencies: ['vue'],
          featureId: 'test.widget',
          hash: 'same-source-hash',
          styles: '.panel{}',
          widgetId: 'test-plugin::test.widget'
        })
      )
    } finally {
      await fs.remove(root)
    }
  })

  it('does not runtime compile packaged widgets without precompiled output', async () => {
    const manager = new WidgetManager()
    const plugin = {
      ...createPlugin(),
      dev: { enable: false, address: '', source: false }
    } as ITouchPlugin
    const feature = createFeature()

    await manager.registerWidget(plugin, feature)

    expect(mocks.loadWidget).not.toHaveBeenCalled()
    expect(mocks.compileWidgetSource).not.toHaveBeenCalled()
    expect(mocks.broadcastToWindow.mock.calls[0]?.[2]).toMatchObject({
      code: 'WIDGET_PRECOMPILED_MISSING',
      featureId: 'test.widget',
      pluginName: 'test-plugin',
      widgetId: 'test-plugin::test.widget'
    })
  })

  it('reports stale packaged precompiled output without runtime compilation', async () => {
    const root = await createPackagedPluginRoot()
    try {
      const manager = new WidgetManager()
      const plugin = {
        ...createPlugin(),
        dev: { enable: false, address: '', source: false },
        pluginPath: root,
        build: {
          widgets: [
            {
              compiledAt: Date.now(),
              compiledPath: 'widgets/.compiled/test-plugin__test.widget.cjs',
              dependencies: ['vue'],
              featureId: 'test.widget',
              hash: 'old-source-hash',
              metaPath: 'widgets/.compiled/test-plugin__test.widget.meta.json',
              sourcePath: 'widgets/panel.ts',
              styles: '.panel{}',
              widgetId: 'test-plugin::test.widget'
            }
          ]
        }
      } as ITouchPlugin
      const feature = createFeature()
      const compiledPath = path.join(root, 'widgets', '.compiled', 'test-plugin__test.widget.cjs')
      const sourcePath = path.join(root, 'widgets', 'panel.ts')
      const tempRoot = path.join(root, 'temp')
      const tempCompiledPath = path.join(tempRoot, 'widgets', 'test-plugin__test.widget.cjs')
      const tempMetaPath = path.join(tempRoot, 'widgets', 'test-plugin__test.widget.meta.json')
      ;(plugin as unknown as { getTempPath: () => string }).getTempPath = () => tempRoot

      await fs.ensureDir(path.dirname(compiledPath))
      await fs.writeFile(compiledPath, 'module.exports = {}', 'utf-8')
      await fs.writeFile(sourcePath, 'export default { name: "Fresh" }', 'utf-8')
      await fs.ensureDir(path.dirname(tempCompiledPath))
      await fs.writeFile(tempCompiledPath, 'module.exports = { cached: true }', 'utf-8')
      await fs.writeJson(tempMetaPath, {
        compiledAt: Date.now(),
        dependencies: ['vue'],
        filePath: sourcePath,
        hash: 'cache-hash',
        styles: '.cached{}'
      })

      await manager.registerWidget(plugin, feature)

      expect(mocks.loadWidget).not.toHaveBeenCalled()
      expect(mocks.compileWidgetSource).not.toHaveBeenCalled()
      expect(mocks.broadcastToWindow.mock.calls[0]?.[2]).toMatchObject({
        code: 'WIDGET_PRECOMPILED_STALE',
        featureId: 'test.widget',
        hash: 'old-source-hash',
        pluginName: 'test-plugin',
        widgetId: 'test-plugin::test.widget'
      })
    } finally {
      await fs.remove(root)
    }
  })

  it('uses temp compiled cache before failing packaged widgets without precompiled output', async () => {
    const root = await createPackagedPluginRoot()
    try {
      const manager = new WidgetManager()
      const tempRoot = path.join(root, 'temp')
      const plugin = {
        ...createPlugin(),
        dev: { enable: false, address: '', source: false },
        pluginPath: root,
        getTempPath: () => tempRoot
      } as unknown as ITouchPlugin
      const feature = createFeature()
      const compiledPath = path.join(tempRoot, 'widgets', 'test-plugin__test.widget.cjs')
      const metaPath = path.join(tempRoot, 'widgets', 'test-plugin__test.widget.meta.json')

      await fs.ensureDir(path.dirname(compiledPath))
      await fs.writeFile(compiledPath, 'module.exports = { cached: true }', 'utf-8')
      await fs.writeJson(metaPath, {
        compiledAt: Date.now(),
        dependencies: ['vue'],
        filePath: path.join(root, 'widgets', 'panel.ts'),
        hash: 'cache-hash',
        styles: '.cached{}'
      })

      await manager.registerWidget(plugin, feature)

      expect(mocks.loadWidget).not.toHaveBeenCalled()
      expect(mocks.compileWidgetSource).not.toHaveBeenCalled()
      expect(mocks.broadcastToWindow).toHaveBeenCalledWith(
        11,
        expect.anything(),
        expect.objectContaining({
          code: 'module.exports = { cached: true }',
          dependencies: ['vue'],
          featureId: 'test.widget',
          hash: 'cache-hash',
          styles: '.cached{}',
          widgetId: 'test-plugin::test.widget'
        })
      )
    } finally {
      await fs.remove(root)
    }
  })
})
