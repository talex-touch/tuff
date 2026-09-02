import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { verifyPackagedEverythingNative, verifyPackagedOfficialPluginSeeds } =
  require('./after-pack.js') as {
    verifyPackagedEverythingNative: (context: {
      appOutDir: string
      electronPlatformName: string
    }) => void
    verifyPackagedOfficialPluginSeeds: (context: {
      appOutDir: string
      packager: { projectDir: string }
    }) => void
  }
const { OFFICIAL_PLUGIN_BUILD_TARGETS } = require('../lib/touch-translation-runtime-sync.js') as {
  OFFICIAL_PLUGIN_BUILD_TARGETS: readonly Array<{
    packageName: string
    pluginName: string
  }>
}

const officialPlugins = OFFICIAL_PLUGIN_BUILD_TARGETS.map(({ packageName, pluginName }, index) => ({
  packageName,
  pluginName,
  version: `1.0.${index + 1}`
}))
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

  for (const { packageName, pluginName, version } of officialPlugins) {
    const canonicalRoot = path.join(workspaceRoot, 'plugins', pluginName)
    const packagedSeedRoot = path.join(resourcesDir, 'bundled-plugins', pluginName)
    await fs.mkdir(canonicalRoot, { recursive: true })
    await fs.mkdir(packagedSeedRoot, { recursive: true })
    await fs.writeFile(
      path.join(canonicalRoot, 'package.json'),
      JSON.stringify({ name: packageName, version })
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

type PackagedEverythingFixture = {
  appOutDir: string
  resourcesDir: string
}

async function createPackagedEverythingFixture(): Promise<PackagedEverythingFixture> {
  const workspaceRoot = await fs.mkdtemp(path.join(tmpdir(), 'after-pack-everything-native-'))
  fixtureRoots.push(workspaceRoot)

  const appOutDir = path.join(workspaceRoot, 'packaged-app')
  const resourcesDir = path.join(appOutDir, 'Tuff.app', 'Contents', 'Resources')
  const nativePackageRoot = path.join(resourcesDir, 'node_modules', '@talex-touch', 'tuff-native')
  await fs.mkdir(path.join(nativePackageRoot, 'build', 'Release'), { recursive: true })
  await Promise.all([
    fs.writeFile(path.join(resourcesDir, 'app.asar'), 'fixture'),
    fs.writeFile(
      path.join(nativePackageRoot, 'package.json'),
      '{"name":"@talex-touch/tuff-native"}'
    ),
    fs.writeFile(path.join(nativePackageRoot, 'everything.js'), 'module.exports = {}\n'),
    fs.writeFile(path.join(nativePackageRoot, 'everything-resources.js'), 'module.exports = {}\n'),
    fs.writeFile(path.join(nativePackageRoot, 'native-loader.js'), 'module.exports = {}\n'),
    fs.writeFile(
      path.join(nativePackageRoot, 'build', 'Release', 'tuff_native_everything.node'),
      'fixture'
    )
  ])

  return { appOutDir, resourcesDir }
}

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true }))
  )
})

describe('verifyPackagedOfficialPluginSeeds', () => {
  it('accepts every canonical official plugin seed in packaged Resources', async () => {
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

  it('rejects a new official package whose Resources seed is missing', async () => {
    const { context, resourcesDir } = await createPackagedSeedFixture()
    const plugin = officialPlugins.find(({ pluginName }) => pluginName === 'touch-orca')!
    await fs.rm(path.join(resourcesDir, 'bundled-plugins', plugin.pluginName, 'manifest.json'))

    expect(() => verifyPackagedOfficialPluginSeeds(context)).toThrow(
      `Missing packaged official plugin seed: ${plugin.pluginName}`
    )
  })

  it('rejects a new official seed whose manifest version differs from its canonical package', async () => {
    const { context, workspaceRoot } = await createPackagedSeedFixture()
    const plugin = officialPlugins.find(({ pluginName }) => pluginName === 'touch-ai-sessions')!
    await fs.writeFile(
      path.join(workspaceRoot, 'plugins', plugin.pluginName, 'package.json'),
      JSON.stringify({ name: plugin.packageName, version: '2.0.0' })
    )

    expect(() => verifyPackagedOfficialPluginSeeds(context)).toThrow(
      `Official plugin seed mismatch for ${plugin.pluginName}`
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

describe('verifyPackagedEverythingNative', () => {
  it('accepts Win32 packaged Resources containing the Everything wrapper and native binary', async () => {
    const { appOutDir } = await createPackagedEverythingFixture()

    expect(() =>
      verifyPackagedEverythingNative({ appOutDir, electronPlatformName: 'win32' })
    ).not.toThrow()
  })

  it('rejects a Win32 package whose Everything wrapper is missing', async () => {
    const { appOutDir, resourcesDir } = await createPackagedEverythingFixture()
    await fs.rm(
      path.join(resourcesDir, 'node_modules', '@talex-touch', 'tuff-native', 'everything.js')
    )

    expect(() =>
      verifyPackagedEverythingNative({ appOutDir, electronPlatformName: 'win32' })
    ).toThrow(/Packaged Everything runtime is incomplete: .*everything\.js/)
  })

  it('rejects a Win32 package whose Everything resource module is missing', async () => {
    const { appOutDir, resourcesDir } = await createPackagedEverythingFixture()
    await fs.rm(
      path.join(
        resourcesDir,
        'node_modules',
        '@talex-touch',
        'tuff-native',
        'everything-resources.js'
      )
    )

    expect(() =>
      verifyPackagedEverythingNative({ appOutDir, electronPlatformName: 'win32' })
    ).toThrow(/Packaged Everything runtime is incomplete: .*everything-resources\.js/)
  })

  it('rejects a Win32 package whose Everything native binary is missing', async () => {
    const { appOutDir, resourcesDir } = await createPackagedEverythingFixture()
    await fs.rm(
      path.join(
        resourcesDir,
        'node_modules',
        '@talex-touch',
        'tuff-native',
        'build',
        'Release',
        'tuff_native_everything.node'
      )
    )

    expect(() =>
      verifyPackagedEverythingNative({ appOutDir, electronPlatformName: 'win32' })
    ).toThrow(/Packaged Everything runtime is incomplete: .*tuff_native_everything\.node/)
  })
})
