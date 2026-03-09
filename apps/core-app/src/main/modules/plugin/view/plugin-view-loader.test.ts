import { beforeEach, describe, expect, it, vi } from 'vitest'

const { appMock, enterUIModeMock } = vi.hoisted(() => ({
  appMock: { isPackaged: false },
  enterUIModeMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: appMock
}))

vi.mock('../../box-tool/core-box/manager', () => ({
  coreBoxManager: {
    enterUIMode: enterUIModeMock
  }
}))

vi.mock('../../../utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    debug: vi.fn()
  })
}))

import { PluginViewLoader } from './plugin-view-loader'

function createPlugin(overrides?: Record<string, unknown>) {
  return {
    name: 'touch-translation',
    pluginPath: '/tmp/touch-translation',
    dev: {
      enable: false,
      source: false,
      address: ''
    },
    issues: [],
    ...overrides
  } as unknown as Parameters<typeof PluginViewLoader.loadPluginView>[0]
}

function createFeature(path: string) {
  return {
    id: 'multi-source-translate',
    interaction: { path }
  } as unknown as Parameters<typeof PluginViewLoader.loadPluginView>[1]
}

describe('PluginViewLoader', () => {
  beforeEach(() => {
    appMock.isPackaged = false
    enterUIModeMock.mockClear()
  })

  it('loads local route path with hash routing', async () => {
    const plugin = createPlugin()
    const feature = createFeature('/multi-translate')

    await PluginViewLoader.loadPluginView(plugin, feature)

    expect(enterUIModeMock).toHaveBeenCalledTimes(1)
    const viewUrl = enterUIModeMock.mock.calls[0]?.[0] as string
    expect(viewUrl).toBe('file:///tmp/touch-translation/index.html#/multi-translate')
  })

  it('normalizes hash route in local mode', async () => {
    const plugin = createPlugin()
    const feature = createFeature('#/multi-translate')

    await PluginViewLoader.loadPluginView(plugin, feature)

    expect(enterUIModeMock).toHaveBeenCalledTimes(1)
    const viewUrl = enterUIModeMock.mock.calls[0]?.[0] as string
    expect(viewUrl).toBe('file:///tmp/touch-translation/index.html#/multi-translate')
  })

  it('blocks invalid traversal path in local mode', async () => {
    const plugin = createPlugin()
    const feature = createFeature('../secret')

    const result = await PluginViewLoader.loadPluginView(plugin, feature)

    expect(result).toBeNull()
    expect(enterUIModeMock).not.toHaveBeenCalled()
    expect(plugin.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_VIEW_PATH',
          source: 'feature:multi-source-translate'
        })
      ])
    )
  })

  it('blocks remote protocol in packaged runtime', async () => {
    appMock.isPackaged = true
    const plugin = createPlugin({
      dev: { enable: true, source: true, address: 'http://localhost:3733/' }
    })
    const feature = createFeature('/multi-translate')

    const result = await PluginViewLoader.loadPluginView(plugin, feature)

    expect(result).toBeNull()
    expect(enterUIModeMock).not.toHaveBeenCalled()
    expect(plugin.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PROTOCOL_NOT_ALLOWED',
          source: 'feature:multi-source-translate'
        })
      ])
    )
  })

  it('keeps dev.source remote route usable in unpackaged mode', async () => {
    const plugin = createPlugin({
      dev: { enable: true, source: true, address: 'http://localhost:3733/' }
    })
    const feature = createFeature('#/multi-translate')

    await PluginViewLoader.loadPluginView(plugin, feature)

    expect(enterUIModeMock).toHaveBeenCalledTimes(1)
    const viewUrl = enterUIModeMock.mock.calls[0]?.[0] as string
    expect(viewUrl).toBe('http://localhost:3733/multi-translate')
  })
})
