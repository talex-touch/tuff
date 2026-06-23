import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { pluginModuleMock } = vi.hoisted(() => ({
  pluginModuleMock: {
    filePath: '',
    pluginManager: {
      loadPlugin: vi.fn(),
      unloadPlugin: vi.fn()
    }
  }
}))

vi.mock('./plugin-module', () => ({
  pluginModule: pluginModuleMock
}))

import { installDevPluginFromPath } from './dev-plugin-installer'

const tempDirs: string[] = []

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

describe('installDevPluginFromPath', () => {
  beforeEach(() => {
    pluginModuleMock.filePath = ''
    pluginModuleMock.pluginManager.loadPlugin.mockReset()
    pluginModuleMock.pluginManager.unloadPlugin.mockReset()
  })

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
  })

  it('preserves dev source mode when installing a dev plugin', async () => {
    const sourceDir = await createTempDir('dev-plugin-source-')
    const installRoot = await createTempDir('dev-plugin-install-')
    pluginModuleMock.filePath = installRoot

    await fs.writeFile(
      path.join(sourceDir, 'manifest.json'),
      JSON.stringify(
        {
          name: 'touch-intelligence',
          version: '1.0.0',
          description: 'test',
          dev: {
            enable: true,
            source: true,
            address: 'http://127.0.0.1:5174/'
          }
        },
        null,
        2
      ),
      'utf-8'
    )

    const result = await installDevPluginFromPath(sourceDir)

    expect(result.status).toBe('success')
    expect(pluginModuleMock.pluginManager.loadPlugin).toHaveBeenCalledWith('touch-intelligence')

    const installedManifest = JSON.parse(
      await fs.readFile(path.join(installRoot, 'touch-intelligence', 'manifest.json'), 'utf-8')
    ) as { dev?: { enable?: boolean; source?: boolean; address?: string } }

    expect(installedManifest.dev).toEqual({
      enable: true,
      source: true,
      address: 'http://127.0.0.1:5174/'
    })
  })
})
