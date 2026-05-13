import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import type { WidgetSource } from '../widget-loader'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { transformWidgetSource } from '../widget-transform'
import { WidgetScriptProcessor } from './script-processor'
import { WidgetTsxProcessor } from './tsx-processor'
import { WidgetVueProcessor } from './vue-processor'

vi.mock('../widget-transform', () => ({
  classifyWidgetCompileError: vi.fn(() => 'WIDGET_COMPILE_FAILED'),
  resolveWidgetCompileCauseCode: vi.fn(() => undefined),
  transformWidgetSource: vi.fn(async () => ({
    code: 'module.exports = {}',
    warnings: []
  }))
}))

function createContext() {
  const plugin = {
    issues: [],
    logger: {
      debug: vi.fn(),
      info: vi.fn()
    },
    name: 'test-plugin'
  } as unknown as ITouchPlugin

  const feature = {
    id: 'test.widget'
  } as IPluginFeature

  return { feature, plugin }
}

function createSource(filePath: string, source: string): WidgetSource {
  return {
    featureId: 'test.widget',
    filePath,
    hash: 'hash',
    loadedAt: Date.now(),
    pluginName: 'test-plugin',
    source,
    widgetId: 'test-plugin::test.widget'
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('widget processors transform helper contract', () => {
  it('routes script widgets through the shared transform helper', async () => {
    const processor = new WidgetScriptProcessor()

    await processor.compile(
      createSource('/plugin/widgets/panel.ts', 'export default { name: "Panel" }'),
      createContext()
    )

    expect(transformWidgetSource).toHaveBeenCalledWith(
      'export default { name: "Panel" }',
      expect.objectContaining({
        format: 'cjs',
        loader: 'ts',
        target: 'node18'
      })
    )
  })

  it('keeps precompiled cjs widgets out of esbuild', async () => {
    const processor = new WidgetScriptProcessor()

    await processor.compile(
      createSource('/plugin/widgets/panel.cjs', 'module.exports = {}'),
      createContext()
    )

    expect(transformWidgetSource).not.toHaveBeenCalled()
  })

  it('routes TSX widgets through the shared transform helper', async () => {
    const processor = new WidgetTsxProcessor()

    await processor.compile(
      createSource('/plugin/widgets/panel.tsx', 'export default () => <div />'),
      createContext()
    )

    expect(transformWidgetSource).toHaveBeenCalledWith(
      'export default () => <div />',
      expect.objectContaining({
        format: 'cjs',
        jsxFactory: 'h',
        jsxFragment: 'Fragment',
        loader: 'tsx',
        target: 'node18'
      })
    )
  })

  it('routes Vue widgets through the shared transform helper', async () => {
    const processor = new WidgetVueProcessor()

    await processor.compile(
      createSource(
        '/plugin/widgets/panel.vue',
        '<template><div>{{ title }}</div></template><script setup lang="ts">const title = "ok"</script>'
      ),
      createContext()
    )

    expect(transformWidgetSource).toHaveBeenCalledWith(
      expect.stringContaining('const title = "ok"'),
      expect.objectContaining({
        format: 'cjs',
        loader: 'ts',
        target: 'node18'
      })
    )
  })
})
