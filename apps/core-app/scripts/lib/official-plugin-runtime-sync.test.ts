import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import fs from 'fs-extra'
import { afterEach, describe, expect, it } from 'vitest'

interface OfficialPluginBuildTarget {
  packageName: string
  pluginName: string
}

interface OfficialPluginSyncResult {
  bundledPluginRoot?: string
  canonicalVersion?: string
  pluginName: string
  reason?: string
  skipped: boolean
  synced: boolean
}

interface OfficialPluginSyncOptions {
  pluginNames?: string[]
  projectRoot: string
  runtimePluginRoots?: string[]
  workspaceRoot: string
}

const require = createRequire(import.meta.url)
const {
  OFFICIAL_PLUGIN_BUILD_PREREQUISITES,
  OFFICIAL_PLUGIN_BUILD_TARGETS,
  buildOfficialPluginPackages,
  syncOfficialPluginBundledRuntime,
  syncOfficialPluginBundledRuntimes
} = require('./touch-translation-runtime-sync.js') as {
  OFFICIAL_PLUGIN_BUILD_PREREQUISITES: readonly string[]
  OFFICIAL_PLUGIN_BUILD_TARGETS: readonly OfficialPluginBuildTarget[]
  buildOfficialPluginPackages: (options: {
    projectRoot: string
    runPackageBuild: (packageName: string) => void
    workspaceRoot: string
  }) => string[]
  syncOfficialPluginBundledRuntime: (
    pluginName: string,
    options: OfficialPluginSyncOptions
  ) => OfficialPluginSyncResult
  syncOfficialPluginBundledRuntimes: (
    options: OfficialPluginSyncOptions
  ) => OfficialPluginSyncResult[]
}

const fixtureRoots: string[] = []
const pluginVersions: Record<string, string> = {
  'touch-intelligence': '1.2.0',
  'touch-translation': '1.0.11'
}

async function createSyncFixture(): Promise<{
  projectRoot: string
  workspaceRoot: string
}> {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-official-plugin-sync-'))
  fixtureRoots.push(workspaceRoot)
  const projectRoot = path.join(workspaceRoot, 'apps', 'core-app')

  for (const { packageName, pluginName } of OFFICIAL_PLUGIN_BUILD_TARGETS) {
    const version = pluginVersions[pluginName]
    const canonicalRoot = path.join(workspaceRoot, 'plugins', pluginName)
    const canonicalBuildRoot = path.join(canonicalRoot, 'dist', 'build')
    await fs.ensureDir(canonicalBuildRoot)
    await fs.writeJson(path.join(canonicalRoot, 'package.json'), {
      name: packageName,
      private: true,
      version
    })
    await fs.writeJson(path.join(canonicalBuildRoot, 'manifest.json'), {
      name: pluginName,
      version
    })
    await fs.writeFile(path.join(canonicalBuildRoot, 'index.js'), `module.exports = '${version}'\n`)

    const bundledRoot = path.join(projectRoot, 'resources', 'bundled-plugins', pluginName)
    await fs.ensureDir(path.join(bundledRoot, 'dist'))
    await fs.writeJson(path.join(bundledRoot, 'manifest.json'), {
      name: pluginName,
      version: '0.0.0'
    })
    await fs.writeFile(path.join(bundledRoot, 'stale.tpex'), 'stale archive')
    await fs.writeFile(path.join(bundledRoot, 'dist', 'stale.txt'), 'stale dist')
  }

  return { projectRoot, workspaceRoot }
}

afterEach(async () => {
  await Promise.all(fixtureRoots.splice(0).map((root) => fs.remove(root)))
})

describe('official plugin build delivery', () => {
  it('builds the CLI prerequisites before canonical official plugins', () => {
    const observed: string[] = []

    const buildOrder = buildOfficialPluginPackages({
      projectRoot: '/project',
      workspaceRoot: '/workspace',
      runPackageBuild: (packageName) => observed.push(packageName)
    })

    expect(observed).toEqual([
      ...OFFICIAL_PLUGIN_BUILD_PREREQUISITES,
      ...OFFICIAL_PLUGIN_BUILD_TARGETS.map(({ packageName }) => packageName)
    ])
    expect(buildOrder).toEqual(observed)
  })

  it('replaces both stale bundled seeds with canonical build contents', async () => {
    const { projectRoot, workspaceRoot } = await createSyncFixture()

    const results = syncOfficialPluginBundledRuntimes({ projectRoot, workspaceRoot })

    expect(results).toHaveLength(2)
    for (const result of results) {
      const expectedVersion = pluginVersions[result.pluginName]
      const bundledRoot = path.join(projectRoot, 'resources', 'bundled-plugins', result.pluginName)
      const manifest = await fs.readJson(path.join(bundledRoot, 'manifest.json'))
      const packageJson = await fs.readJson(path.join(bundledRoot, 'package.json'))

      expect(result).toMatchObject({
        canonicalVersion: expectedVersion,
        skipped: false,
        synced: true
      })
      expect(manifest.version).toBe(expectedVersion)
      expect(packageJson.version).toBe(expectedVersion)
      await expect(fs.pathExists(path.join(bundledRoot, 'stale.tpex'))).resolves.toBe(false)
      await expect(fs.pathExists(path.join(bundledRoot, 'dist'))).resolves.toBe(false)
      await expect(fs.pathExists(path.join(bundledRoot, 'index.js'))).resolves.toBe(true)
    }
  })

  it('fails before replacing a bundled seed when canonical versions disagree', async () => {
    const { projectRoot, workspaceRoot } = await createSyncFixture()
    const pluginName = 'touch-intelligence'
    const canonicalManifestPath = path.join(
      workspaceRoot,
      'plugins',
      pluginName,
      'dist',
      'build',
      'manifest.json'
    )
    await fs.writeJson(canonicalManifestPath, {
      name: pluginName,
      version: '0.0.0'
    })

    expect(() =>
      syncOfficialPluginBundledRuntime(pluginName, { projectRoot, workspaceRoot })
    ).toThrow(/Canonical build mismatch/)

    const bundledRoot = path.join(projectRoot, 'resources', 'bundled-plugins', pluginName)
    await expect(fs.pathExists(path.join(bundledRoot, 'stale.tpex'))).resolves.toBe(true)
  })
})
