import type { IManifest } from '@talex-touch/utils/plugin'
import path from 'node:path'
import { tmpdir } from 'node:os'
import fse from 'fs-extra'
import { CURRENT_SDK_VERSION } from '@talex-touch/utils/plugin'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { pluginModuleMock } = vi.hoisted(() => ({
  pluginModuleMock: {
    filePath: '',
    pluginManager: {
      getPluginByName: vi.fn(() => null),
      loadPlugin: vi.fn(),
      unloadPlugin: vi.fn()
    }
  }
}))

vi.mock('./plugin-module', () => ({
  pluginModule: pluginModuleMock
}))

import { PluginResolver } from './plugin-resolver'

async function createSourcePluginDir(root: string, manifest: IManifest): Promise<string> {
  const sourceDir = path.join(root, 'source-plugin')
  await fse.ensureDir(sourceDir)
  await fse.writeJSON(path.join(sourceDir, 'manifest.json'), manifest, { spaces: 2 })
  await fse.writeFile(path.join(sourceDir, 'index.js'), 'module.exports = {}', 'utf-8')
  return sourceDir
}

describe('PluginResolver', () => {
  const createdRoots: string[] = []

  afterEach(async () => {
    await Promise.all(createdRoots.splice(0).map(async (root) => fse.remove(root)))
    pluginModuleMock.filePath = ''
    vi.clearAllMocks()
  })

  it('removes broken install targets when required webcontent entry files are missing', async () => {
    const root = await fse.mkdtemp(path.join(tmpdir(), 'plugin-resolver-test-'))
    createdRoots.push(root)

    const manifest: IManifest = {
      name: 'clipboard-history',
      version: '1.1.0',
      description: 'clipboard',
      icon: 'logo.svg',
      author: 'Talex',
      main: 'index.js',
      sdkapi: CURRENT_SDK_VERSION,
      features: [
        {
          id: 'clipboard-history',
          name: 'Clipboard History',
          desc: 'clipboard',
          icon: { type: 'emoji', value: '📋' },
          push: false,
          platform: { windows: true, linux: true, darwin: true },
          commands: [],
          interaction: { type: 'webcontent', path: '/clipboard-manager' }
        }
      ] as never
    }

    const sourceDir = await createSourcePluginDir(root, manifest)
    const installRoot = path.join(root, 'installed-plugins')
    await fse.ensureDir(installRoot)
    pluginModuleMock.filePath = installRoot

    const callback = vi.fn()
    await new PluginResolver(sourceDir).install(manifest, callback)

    expect(callback).toHaveBeenCalledWith(
      expect.stringContaining('Missing required webcontent entry files after install: index.html'),
      'error'
    )
    await expect(fse.pathExists(path.join(installRoot, manifest.name))).resolves.toBe(false)
    expect(pluginModuleMock.pluginManager.loadPlugin).not.toHaveBeenCalled()
  })
})
