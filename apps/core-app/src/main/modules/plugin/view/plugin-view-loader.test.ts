import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const tempDirs: string[] = []

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

async function createTempPluginDir(files: Record<string, string>): Promise<string> {
  const pluginDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-view-loader-'))
  tempDirs.push(pluginDir)

  await Promise.all(
    Object.entries(files).map(async ([fileName, content]) => {
      const filePath = path.join(pluginDir, fileName)
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, content, 'utf-8')
    })
  )

  return pluginDir
}

describe('PluginViewLoader', () => {
  beforeEach(() => {
    appMock.isPackaged = false
    enterUIModeMock.mockClear()
  })

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
  })

  it('loads local route path with hash routing', async () => {
    const plugin = createPlugin()
    const feature = createFeature('/multi-translate')

    await PluginViewLoader.loadPluginView(plugin, feature)

    expect(enterUIModeMock).toHaveBeenCalledTimes(1)
    const viewUrl = enterUIModeMock.mock.calls[0]?.[0] as string
    expect(viewUrl).toBe('file:///tmp/touch-translation/index.html#/multi-translate')
  })

  it('prefers prerendered html files for extensionless local routes', async () => {
    const pluginDir = await createTempPluginDir({
      'index.html': '<html>fallback</html>',
      'clipboard-manager.html': '<html>route</html>'
    })
    const plugin = createPlugin({ name: 'clipboard-history', pluginPath: pluginDir })
    const feature = createFeature('/clipboard-manager')

    await PluginViewLoader.loadPluginView(plugin, feature)

    expect(enterUIModeMock).toHaveBeenCalledTimes(1)
    const viewUrl = enterUIModeMock.mock.calls[0]?.[0] as string
    expect(viewUrl).toBe(pathToFileURL(path.join(pluginDir, 'clipboard-manager.html')).href)
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

  it('blocks invalid remote route with scheme when dev.source is enabled', async () => {
    const plugin = createPlugin({
      dev: { enable: true, source: true, address: 'http://localhost:3733/' }
    })
    const feature = createFeature('javascript:alert(1)')

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

  it('blocks invalid local route that starts with double slash', async () => {
    const plugin = createPlugin()
    const feature = createFeature('//evil.example/path')

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

  it('loads explicit html file path from plugin root', async () => {
    const plugin = createPlugin()
    const feature = createFeature('views/index.html')

    await PluginViewLoader.loadPluginView(plugin, feature)

    expect(enterUIModeMock).toHaveBeenCalledTimes(1)
    const viewUrl = enterUIModeMock.mock.calls[0]?.[0] as string
    expect(viewUrl).toBe('file:///tmp/touch-translation/views/index.html')
  })
})
