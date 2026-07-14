import { promises as fs } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { installBundledOfficialPluginSeeds } from './official-plugin-seed'

const fixtureRoots: string[] = []

async function createFixture(): Promise<{ runtimePluginRoot: string; seedRoot: string }> {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'official-plugin-seed-'))
  fixtureRoots.push(root)

  return {
    runtimePluginRoot: path.join(root, 'runtime', 'plugins'),
    seedRoot: path.join(root, 'resources', 'bundled-plugins')
  }
}

async function writePlugin(
  root: string,
  pluginName: string,
  options: {
    files?: Record<string, string>
    signature: string
    version: string
  }
): Promise<string> {
  const pluginRoot = path.join(root, pluginName)
  await fs.mkdir(pluginRoot, { recursive: true })
  await fs.writeFile(
    path.join(pluginRoot, 'manifest.json'),
    JSON.stringify({
      name: pluginName,
      version: options.version,
      _signature: options.signature
    })
  )

  for (const [relativePath, contents] of Object.entries(options.files ?? {})) {
    const filePath = path.join(pluginRoot, relativePath)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, contents)
  }

  return pluginRoot
}

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true }))
  )
})

describe('installBundledOfficialPluginSeeds', () => {
  it('installs a missing bundled seed into the runtime plugin root', async () => {
    const { runtimePluginRoot, seedRoot } = await createFixture()
    const seedPluginRoot = await writePlugin(seedRoot, 'touch-translation', {
      files: { 'index.js': 'seed runtime' },
      signature: 'translation-1.0.11',
      version: '1.0.11'
    })

    const installation = installBundledOfficialPluginSeeds({ seedRoot, runtimePluginRoot })
    expect(installation).not.toBeInstanceOf(Promise)
    const [result] = installation
    const targetRoot = path.join(runtimePluginRoot, 'touch-translation')

    expect(result).toMatchObject({
      pluginName: 'touch-translation',
      seedVersion: '1.0.11',
      status: 'installed',
      targetRoot
    })
    await expect(fs.readFile(path.join(targetRoot, 'index.js'), 'utf8')).resolves.toBe(
      'seed runtime'
    )
    await expect(
      fs.readFile(path.join(seedPluginRoot, 'manifest.json'), 'utf8')
    ).resolves.toContain('1.0.11')
  })

  it('upgrades an older runtime cleanly while preserving plugin logs and data', async () => {
    const { runtimePluginRoot, seedRoot } = await createFixture()
    await writePlugin(seedRoot, 'touch-intelligence', {
      files: { 'index.js': 'new runtime', 'views/panel.html': '<main>new</main>' },
      signature: 'intelligence-1.0.3',
      version: '1.0.3'
    })
    const localRoot = await writePlugin(runtimePluginRoot, 'touch-intelligence', {
      files: {
        'data/user-settings.json': '{"theme":"night"}',
        'index.js': 'old runtime',
        'logs/runtime.log': 'kept log',
        'stale-runtime.js': 'remove me'
      },
      signature: 'intelligence-1.0.2',
      version: '1.0.2'
    })

    const [result] = installBundledOfficialPluginSeeds({ seedRoot, runtimePluginRoot })

    expect(result).toMatchObject({
      localVersion: '1.0.2',
      pluginName: 'touch-intelligence',
      seedVersion: '1.0.3',
      status: 'updated',
      targetRoot: localRoot
    })
    await expect(fs.readFile(path.join(localRoot, 'index.js'), 'utf8')).resolves.toBe('new runtime')
    await expect(fs.readFile(path.join(localRoot, 'views', 'panel.html'), 'utf8')).resolves.toBe(
      '<main>new</main>'
    )
    await expect(fs.access(path.join(localRoot, 'stale-runtime.js'))).rejects.toThrow()
    await expect(
      fs.readFile(path.join(localRoot, 'data', 'user-settings.json'), 'utf8')
    ).resolves.toBe('{"theme":"night"}')
    await expect(fs.readFile(path.join(localRoot, 'logs', 'runtime.log'), 'utf8')).resolves.toBe(
      'kept log'
    )
  })

  it('refreshes a same-version runtime whose packaged fingerprint changed', async () => {
    const { runtimePluginRoot, seedRoot } = await createFixture()
    await writePlugin(seedRoot, 'touch-intelligence', {
      files: { 'index.js': 'refreshed runtime' },
      signature: 'intelligence-content-b',
      version: '1.0.3'
    })
    const localRoot = await writePlugin(runtimePluginRoot, 'touch-intelligence', {
      files: { 'index.js': 'stale runtime', 'stale-runtime.js': 'remove me' },
      signature: 'intelligence-content-a',
      version: '1.0.3'
    })

    const [result] = installBundledOfficialPluginSeeds({ seedRoot, runtimePluginRoot })

    expect(result).toMatchObject({
      localVersion: '1.0.3',
      status: 'updated'
    })
    await expect(fs.readFile(path.join(localRoot, 'index.js'), 'utf8')).resolves.toBe(
      'refreshed runtime'
    )
    await expect(fs.access(path.join(localRoot, 'stale-runtime.js'))).rejects.toThrow()
  })

  it('does not downgrade a newer local runtime', async () => {
    const { runtimePluginRoot, seedRoot } = await createFixture()
    await writePlugin(seedRoot, 'touch-translation', {
      files: { 'index.js': 'older seed' },
      signature: 'translation-1.0.11',
      version: '1.0.11'
    })
    const localRoot = await writePlugin(runtimePluginRoot, 'touch-translation', {
      files: { 'index.js': 'newer local runtime' },
      signature: 'translation-1.1.0',
      version: '1.1.0'
    })

    const [result] = installBundledOfficialPluginSeeds({ seedRoot, runtimePluginRoot })

    expect(result).toMatchObject({
      localVersion: '1.1.0',
      seedVersion: '1.0.11',
      status: 'newer-local'
    })
    await expect(fs.readFile(path.join(localRoot, 'index.js'), 'utf8')).resolves.toBe(
      'newer local runtime'
    )
  })

  it('repairs a newer local runtime whose manifest claims a different plugin identity', async () => {
    const { runtimePluginRoot, seedRoot } = await createFixture()
    await writePlugin(seedRoot, 'touch-translation', {
      files: { 'index.js': 'canonical translation runtime' },
      signature: 'translation-1.0.11',
      version: '1.0.11'
    })
    const localRoot = await writePlugin(runtimePluginRoot, 'touch-translation', {
      files: { 'index.js': 'wrong plugin runtime' },
      signature: 'wrong-plugin-1.1.0',
      version: '1.1.0'
    })
    await fs.writeFile(
      path.join(localRoot, 'manifest.json'),
      JSON.stringify({
        name: 'not-touch-translation',
        version: '1.1.0',
        _signature: 'wrong-plugin-1.1.0'
      })
    )

    const [result] = installBundledOfficialPluginSeeds({ seedRoot, runtimePluginRoot })

    expect(result).toMatchObject({
      localVersion: '1.1.0',
      status: 'repaired'
    })
    await expect(fs.readFile(path.join(localRoot, 'index.js'), 'utf8')).resolves.toBe(
      'canonical translation runtime'
    )
  })

  it('rejects an invalid seed set before mutating any runtime plugin', async () => {
    const { runtimePluginRoot, seedRoot } = await createFixture()
    await writePlugin(seedRoot, 'touch-translation', {
      files: { 'index.js': 'would install if validation were incremental' },
      signature: 'translation-1.0.11',
      version: '1.0.11'
    })
    const invalidSeedRoot = await writePlugin(seedRoot, 'touch-intelligence', {
      files: { 'index.js': 'invalid seed' },
      signature: 'intelligence-invalid',
      version: '1.0.3'
    })
    await fs.writeFile(
      path.join(invalidSeedRoot, 'manifest.json'),
      JSON.stringify({ name: 'wrong-plugin', version: '1.0.3', _signature: 'intelligence-invalid' })
    )
    const localRoot = await writePlugin(runtimePluginRoot, 'touch-translation', {
      files: { 'index.js': 'existing local runtime' },
      signature: 'translation-local',
      version: '1.0.0'
    })

    expect(() => installBundledOfficialPluginSeeds({ seedRoot, runtimePluginRoot })).toThrow(
      'Invalid bundled official plugin seed: touch-intelligence'
    )
    await expect(fs.readFile(path.join(localRoot, 'index.js'), 'utf8')).resolves.toBe(
      'existing local runtime'
    )
  })
})
