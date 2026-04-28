import path from 'node:path'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { PERMISSION_ENFORCEMENT_MIN_VERSION } from '@talex-touch/utils/plugin'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { appMock } = vi.hoisted(() => ({
  appMock: { isPackaged: false }
}))

const { networkRequestMock } = vi.hoisted(() => ({
  networkRequestMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: appMock
}))

vi.mock('../network', () => ({
  getNetworkService: () => ({
    request: networkRequestMock
  })
}))

vi.mock('../../core/tuff-icon', () => ({
  TuffIconImpl: class {
    status = 'ready'

    constructor() {}

    async init() {}
  }
}))

vi.mock('./plugin', () => ({
  TouchPlugin: class {
    name: string
    icon: unknown
    version: string
    desc: string
    readme: string
    dev: Record<string, unknown>
    pluginPath: string
    issues: Array<Record<string, unknown>>
    features: unknown[]
    loadState: string
    loadError?: { code: string; message: string }
    creationOptions?: { skipDataInit?: boolean }
    logger: {
      error: ReturnType<typeof vi.fn>
      debug: ReturnType<typeof vi.fn>
      warn: ReturnType<typeof vi.fn>
    }

    constructor(
      name: string,
      icon: unknown,
      version: string,
      desc: string,
      readme: string,
      dev: Record<string, unknown>,
      pluginPath: string,
      _platforms?: unknown,
      options?: { skipDataInit?: boolean }
    ) {
      this.name = name
      this.icon = icon
      this.version = version
      this.desc = desc
      this.readme = readme
      this.dev = dev
      this.pluginPath = pluginPath
      this.issues = []
      this.features = []
      this.loadState = 'ready'
      this.creationOptions = options
      this.logger = { error: vi.fn(), debug: vi.fn(), warn: vi.fn() }
    }

    addFeature() {
      return true
    }

    setLoadState(state: string, loadError?: { code: string; message: string }) {
      this.loadState = state
      this.loadError = loadError
    }
  }
}))

import { createPluginLoadShell, createPluginLoader } from './plugin-loaders'

async function createPluginDir(manifest: Record<string, unknown>): Promise<string> {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'plugin-loaders-test-'))
  const pluginPath = path.join(root, 'touch-translation')
  await fs.mkdir(pluginPath, { recursive: true })
  await fs.writeFile(
    path.join(pluginPath, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  )
  return pluginPath
}

describe('createPluginLoader', () => {
  const createdPaths: string[] = []

  beforeEach(() => {
    appMock.isPackaged = false
    networkRequestMock.mockReset()
  })

  afterEach(async () => {
    await Promise.all(
      createdPaths.splice(0).map(async (pluginPath) => {
        await fs.rm(path.dirname(pluginPath), { recursive: true, force: true })
      })
    )
  })

  it('uses DevPluginLoader when dev.source is enabled in unpackaged runtime', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'test',
      icon: { type: 'emoji', value: 'x' },
      dev: { enable: true, source: true, address: 'http://127.0.0.1:3733/' }
    })
    createdPaths.push(pluginPath)

    const loader = createPluginLoader('touch-translation', pluginPath)
    expect(loader.constructor.name).toBe('DevPluginLoader')
  })

  it('falls back to LocalPluginLoader in packaged runtime even when dev.source is enabled', async () => {
    appMock.isPackaged = true
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'test',
      icon: { type: 'emoji', value: 'x' },
      dev: { enable: true, source: true, address: 'http://127.0.0.1:3733/' }
    })
    createdPaths.push(pluginPath)

    const loader = createPluginLoader('touch-translation', pluginPath)
    expect(loader.constructor.name).toBe('LocalPluginLoader')
  })

  it('keeps LocalPluginLoader when dev.source is disabled', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'test',
      icon: { type: 'emoji', value: 'x' },
      dev: { enable: true, source: false, address: 'http://127.0.0.1:3733/' }
    })
    createdPaths.push(pluginPath)

    const loader = createPluginLoader('touch-translation', pluginPath)
    expect(loader.constructor.name).toBe('LocalPluginLoader')
  })

  it('keeps LocalPluginLoader when dev.address protocol is invalid', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'test',
      icon: { type: 'emoji', value: 'x' },
      dev: { enable: true, source: true, address: 'ftp://127.0.0.1:3733/' }
    })
    createdPaths.push(pluginPath)

    const loader = createPluginLoader('touch-translation', pluginPath)
    expect(loader.constructor.name).toBe('LocalPluginLoader')
  })

  it('keeps dev-source behavior when remote manifest fetch succeeds', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'test',
      icon: { type: 'emoji', value: 'x' },
      dev: { enable: true, source: true, address: 'http://127.0.0.1:3733/' }
    })
    createdPaths.push(pluginPath)
    const loader = createPluginLoader('touch-translation', pluginPath)

    networkRequestMock
      .mockResolvedValueOnce({
        data: {
          name: 'touch-translation',
          version: '1.0.0',
          description: 'remote',
          icon: { type: 'emoji', value: 'x' },
          dev: { enable: true, source: true, address: 'http://127.0.0.1:3733/' }
        }
      })
      .mockRejectedValueOnce(new Error('README missing'))

    const plugin = await loader.load()
    const issueCodes = plugin.issues.map((issue) => issue.code)

    expect(issueCodes).toContain('DEV_MODE_ACTIVE')
    expect(issueCodes).not.toContain('DEV_SOURCE_FALLBACK_LOCAL')
    expect(issueCodes).not.toContain('REMOTE_MANIFEST_FAILED')
    expect(plugin.dev).toMatchObject({ enable: true, source: true })
  })

  it('falls back to local assets when remote manifest fetch fails', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'local',
      icon: { type: 'emoji', value: 'x' },
      dev: { enable: true, source: true, address: 'http://127.0.0.1:3733/' }
    })
    createdPaths.push(pluginPath)
    const loader = createPluginLoader('touch-translation', pluginPath)

    networkRequestMock.mockRejectedValueOnce(new Error('connect refused'))

    const plugin = await loader.load()
    const issueCodes = plugin.issues.map((issue) => issue.code)

    expect(issueCodes).toContain('DEV_SOURCE_FALLBACK_LOCAL')
    expect(issueCodes).not.toContain('REMOTE_MANIFEST_FAILED')
    expect(plugin.dev).toMatchObject({ enable: true, source: false })
  })

  it('keeps REMOTE_MANIFEST_FAILED when remote and local manifest both fail', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'local',
      icon: { type: 'emoji', value: 'x' },
      dev: { enable: true, source: true, address: 'http://127.0.0.1:3733/' }
    })
    createdPaths.push(pluginPath)
    const loader = createPluginLoader('touch-translation', pluginPath)

    await fs.writeFile(path.join(pluginPath, 'manifest.json'), '{ invalid-json', 'utf-8')
    networkRequestMock.mockRejectedValueOnce(new Error('connect refused'))

    const plugin = await loader.load()
    const issueCodes = plugin.issues.map((issue) => issue.code)

    expect(issueCodes).toContain('REMOTE_MANIFEST_FAILED')
    expect(issueCodes).not.toContain('DEV_SOURCE_FALLBACK_LOCAL')
  })

  it('marks plugins below the enforced sdkapi floor as blocked load failures', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'legacy sdk plugin',
      icon: { type: 'emoji', value: 'x' },
      sdkapi: PERMISSION_ENFORCEMENT_MIN_VERSION - 1
    })
    createdPaths.push(pluginPath)

    const loader = createPluginLoader('touch-translation', pluginPath)
    const plugin = await loader.load()

    expect(plugin.loadState).toBe('load_failed')
    expect(plugin.loadError).toMatchObject({ code: 'SDKAPI_BLOCKED' })
    expect(plugin.issues.some((issue) => issue.code === 'SDKAPI_BLOCKED')).toBe(true)
    expect(plugin.issues.some((issue) => issue.code === 'SDK_VERSION_OUTDATED')).toBe(false)
  })

  it('marks plugins without sdkapi as blocked load failures', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'missing sdk plugin',
      icon: { type: 'emoji', value: 'x' }
    })
    createdPaths.push(pluginPath)

    const loader = createPluginLoader('touch-translation', pluginPath)
    const plugin = await loader.load()

    expect(plugin.loadState).toBe('load_failed')
    expect(plugin.loadError).toMatchObject({ code: 'SDKAPI_BLOCKED' })
    expect(plugin.issues.some((issue) => issue.code === 'SDKAPI_BLOCKED')).toBe(true)
    expect(plugin.issues.some((issue) => issue.code === 'SDK_VERSION_MISSING')).toBe(false)
  })

  it('blocks plugins with unsupported sdk markers', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'unsupported sdk plugin',
      icon: { type: 'emoji', value: 'x' },
      sdkapi: 260501,
      category: 'utilities'
    })
    createdPaths.push(pluginPath)

    const loader = createPluginLoader('touch-translation', pluginPath)
    const plugin = await loader.load()

    expect(plugin.loadState).toBe('load_failed')
    expect(plugin.loadError).toMatchObject({ code: 'SDKAPI_BLOCKED' })
    expect(plugin.issues.some((issue) => issue.code === 'SDKAPI_BLOCKED')).toBe(true)
    expect(plugin.issues.some((issue) => issue.code === 'SDK_VERSION_COMPAT_WARNING')).toBe(false)
    expect(plugin.issues.some((issue) => issue.code === 'SDK_VERSION_OUTDATED')).toBe(false)
  })

  it('creates loader plugin shells without eager data initialization', async () => {
    const pluginPath = await createPluginDir({
      name: 'touch-translation',
      version: '1.0.0',
      description: 'local',
      icon: { type: 'emoji', value: 'x' }
    })
    createdPaths.push(pluginPath)

    const loader = createPluginLoader('touch-translation', pluginPath)
    const plugin = (await loader.load()) as unknown as {
      creationOptions?: { skipDataInit?: boolean }
    }

    expect(plugin.creationOptions).toMatchObject({ skipDataInit: true })
  })

  it('creates a shared loading shell plugin shape', () => {
    const plugin = createPluginLoadShell('broken-plugin', '/tmp/broken', { skipDataInit: true })

    expect(plugin.name).toBe('broken-plugin')
    expect(plugin.version).toBe('0.0.0')
    expect(plugin.desc).toBe('')
    expect(plugin.dev).toMatchObject({ enable: false, address: '', source: false })
    expect(plugin.loadState).toBe('loading')
  })
})
