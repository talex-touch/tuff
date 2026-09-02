import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { pluginModuleMock } = vi.hoisted(() => ({
  pluginModuleMock: {
    filePath: '',
    pluginManager: {
      plugins: new Map<string, unknown>(),
      loadPlugin: vi.fn(),
      unloadPlugin: vi.fn()
    }
  }
}))

vi.mock('./plugin-module', () => ({
  pluginModule: pluginModuleMock
}))

import { installDevPluginFromPath } from './dev-plugin-installer'
import { PRIVILEGED_PLUGIN_NAMES } from './privileged-plugins'

const tempDirs: string[] = []

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

describe('installDevPluginFromPath', () => {
  beforeEach(() => {
    pluginModuleMock.filePath = ''
    pluginModuleMock.pluginManager.plugins.clear()
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
          name: 'touch-example',
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
    expect(pluginModuleMock.pluginManager.loadPlugin).toHaveBeenCalledWith('touch-example')

    const installedManifest = JSON.parse(
      await fs.readFile(path.join(installRoot, 'touch-example', 'manifest.json'), 'utf-8')
    ) as { dev?: { enable?: boolean; source?: boolean; address?: string } }

    expect(installedManifest.dev).toEqual({
      enable: true,
      source: true,
      address: 'http://127.0.0.1:5174/'
    })
  })

  it('preserves the installed directory when force-update teardown is incomplete', async () => {
    const sourceDir = await createTempDir('dev-plugin-source-')
    const installRoot = await createTempDir('dev-plugin-install-')
    const targetDir = path.join(installRoot, 'touch-example')
    pluginModuleMock.filePath = installRoot
    pluginModuleMock.pluginManager.plugins.set('touch-example', {})
    pluginModuleMock.pluginManager.unloadPlugin.mockResolvedValue(false)
    await fs.mkdir(targetDir)
    await fs.writeFile(path.join(targetDir, 'index.js'), 'old-content', 'utf-8')
    await fs.writeFile(
      path.join(sourceDir, 'manifest.json'),
      JSON.stringify({ name: 'touch-example', version: '2.0.0', description: 'test' }),
      'utf-8'
    )
    await fs.writeFile(path.join(sourceDir, 'index.js'), 'new-content', 'utf-8')

    const result = await installDevPluginFromPath(sourceDir, { forceUpdate: true })

    expect(result).toEqual({
      status: 'error',
      error: 'PLUGIN_RUNTIME_RESOURCE_CLEANUP_FAILED'
    })
    expect(await fs.readFile(path.join(targetDir, 'index.js'), 'utf-8')).toBe('old-content')
    expect(pluginModuleMock.pluginManager.loadPlugin).not.toHaveBeenCalled()
  })

  for (const [mode, options] of [
    ['regular installation', undefined],
    ['force update', { forceUpdate: true }]
  ] as const) {
    it(`rejects every privileged bundled name before ${mode} can copy or replace it`, async () => {
      const sourceDir = await createTempDir('dev-plugin-reserved-source-')
      const installRoot = await createTempDir('dev-plugin-reserved-install-')
      pluginModuleMock.filePath = installRoot

      for (const pluginName of PRIVILEGED_PLUGIN_NAMES) {
        const targetDir = path.join(installRoot, pluginName)
        const originalContents = `bundled ${pluginName} runtime`
        pluginModuleMock.pluginManager.plugins.set(pluginName, {})
        await fs.mkdir(targetDir)
        await fs.writeFile(path.join(targetDir, 'index.js'), originalContents, 'utf-8')
        await fs.writeFile(
          path.join(sourceDir, 'manifest.json'),
          JSON.stringify({
            name: pluginName,
            version: '2.0.0',
            description: 'reserved runtime impersonation'
          }),
          'utf-8'
        )
        await fs.writeFile(
          path.join(sourceDir, 'index.js'),
          `untrusted ${pluginName} runtime`,
          'utf-8'
        )

        const result = await installDevPluginFromPath(sourceDir, options)

        expect(result).toEqual({ status: 'error', error: 'PRIVILEGED_PLUGIN_NAME_RESERVED' })
        await expect(fs.readFile(path.join(targetDir, 'index.js'), 'utf-8')).resolves.toBe(
          originalContents
        )
      }

      expect(pluginModuleMock.pluginManager.unloadPlugin).not.toHaveBeenCalled()
      expect(pluginModuleMock.pluginManager.loadPlugin).not.toHaveBeenCalled()
    })
  }
})
