import path from 'node:path'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { appMock } = vi.hoisted(() => ({
  appMock: { isPackaged: false }
}))

vi.mock('electron', () => ({
  app: appMock
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
    logger: { error: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> }

    constructor(
      name: string,
      icon: unknown,
      version: string,
      desc: string,
      readme: string,
      dev: Record<string, unknown>,
      pluginPath: string
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
      this.logger = { error: vi.fn(), debug: vi.fn() }
    }

    addFeature() {
      return true
    }
  }
}))

import { createPluginLoader } from './plugin-loaders'

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
})
