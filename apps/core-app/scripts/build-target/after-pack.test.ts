import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { verifyPackagedOfficialPluginSeeds } = require('./after-pack.js') as {
  verifyPackagedOfficialPluginSeeds: (context: {
    appOutDir: string
    packager: { projectDir: string }
  }) => void
}

const officialPlugins = [
  { pluginName: 'touch-translation', version: '1.0.11' },
  { pluginName: 'touch-intelligence', version: '1.2.0' }
] as const
const fixtureRoots: string[] = []

type PackagedSeedFixture = {
  context: {
    appOutDir: string
    packager: { projectDir: string }
  }
  projectRoot: string
  resourcesDir: string
  workspaceRoot: string
}

async function createPackagedSeedFixture(): Promise<PackagedSeedFixture> {
  const workspaceRoot = await fs.mkdtemp(path.join(tmpdir(), 'after-pack-official-plugin-seeds-'))
  fixtureRoots.push(workspaceRoot)

  const projectRoot = path.join(workspaceRoot, 'apps', 'core-app')
  const appOutDir = path.join(workspaceRoot, 'packaged-app')
  const resourcesDir = path.join(appOutDir, 'Tuff.app', 'Contents', 'Resources')
  await fs.mkdir(resourcesDir, { recursive: true })
  await fs.writeFile(path.join(resourcesDir, 'app.asar'), 'fixture')

  for (const { pluginName, version } of officialPlugins) {
    const canonicalRoot = path.join(workspaceRoot, 'plugins', pluginName)
    const packagedSeedRoot = path.join(resourcesDir, 'bundled-plugins', pluginName)
    await fs.mkdir(canonicalRoot, { recursive: true })
    await fs.mkdir(packagedSeedRoot, { recursive: true })
    await fs.writeFile(
      path.join(canonicalRoot, 'package.json'),
      JSON.stringify({ name: `@talex-touch/${pluginName}-plugin`, version })
    )
    await fs.writeFile(
      path.join(packagedSeedRoot, 'manifest.json'),
      JSON.stringify({ name: pluginName, version })
    )
    await fs.writeFile(path.join(packagedSeedRoot, 'index.js'), `module.exports = '${version}'\n`)
  }

  return {
    context: { appOutDir, packager: { projectDir: projectRoot } },
    projectRoot,
    resourcesDir,
    workspaceRoot
  }
}

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true }))
  )
})

describe('verifyPackagedOfficialPluginSeeds', () => {
  it('accepts both canonical official plugin seeds in packaged Resources', async () => {
    const { context, resourcesDir } = await createPackagedSeedFixture()

    expect(() => verifyPackagedOfficialPluginSeeds(context)).not.toThrow()
    for (const { pluginName, version } of officialPlugins) {
      const manifest = JSON.parse(
        await fs.readFile(
          path.join(resourcesDir, 'bundled-plugins', pluginName, 'manifest.json'),
          'utf8'
        )
      )
      expect(manifest).toMatchObject({ name: pluginName, version })
    }
  })

  it('rejects a package whose Resources seed is missing', async () => {
    const { context, resourcesDir } = await createPackagedSeedFixture()
    await fs.rm(path.join(resourcesDir, 'bundled-plugins', 'touch-intelligence', 'manifest.json'))

    expect(() => verifyPackagedOfficialPluginSeeds(context)).toThrow(
      'Missing packaged official plugin seed: touch-intelligence'
    )
  })

  it('rejects a seed whose manifest version differs from its canonical package', async () => {
    const { context, workspaceRoot } = await createPackagedSeedFixture()
    await fs.writeFile(
      path.join(workspaceRoot, 'plugins', 'touch-translation', 'package.json'),
      JSON.stringify({ name: '@talex-touch/touch-translation-plugin', version: '1.0.12' })
    )

    expect(() => verifyPackagedOfficialPluginSeeds(context)).toThrow(
      'Official plugin seed mismatch for touch-translation'
    )
  })

  it('rejects a packaged seed that contains a nested dist directory', async () => {
    const { context, resourcesDir } = await createPackagedSeedFixture()
    const nestedRuntimeArtifact = path.join(
      resourcesDir,
      'bundled-plugins',
      'touch-intelligence',
      'dist',
      'build',
      'stale.js'
    )
    await fs.mkdir(path.dirname(nestedRuntimeArtifact), { recursive: true })
    await fs.writeFile(nestedRuntimeArtifact, 'stale build output')

    expect(() => verifyPackagedOfficialPluginSeeds(context)).toThrow(
      /Official plugin seed contains generated package artifacts for touch-intelligence: dist/
    )
  })

  it('rejects a packaged seed that contains a generated plugin archive', async () => {
    const { context, resourcesDir } = await createPackagedSeedFixture()
    await fs.writeFile(
      path.join(resourcesDir, 'bundled-plugins', 'touch-translation', 'stale.tpex'),
      'stale archive'
    )

    expect(() => verifyPackagedOfficialPluginSeeds(context)).toThrow(
      /Official plugin seed contains generated package artifacts for touch-translation: stale\.tpex/
    )
  })
})
