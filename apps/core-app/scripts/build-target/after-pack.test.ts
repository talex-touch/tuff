import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const {
  verifyPackagedEverythingNative,
  verifyPackagedFdBinary,
  verifyPackagedNativeAddons,
  verifyPackagedOfficialPluginSeeds
} = require('./after-pack.js') as {
  verifyPackagedEverythingNative: (context: {
    appOutDir: string
    electronPlatformName: string
  }) => void
  verifyPackagedFdBinary: (context: {
    appOutDir: string
    electronPlatformName: string
    arch: number
  }) => void
  verifyPackagedNativeAddons: (
    context: { appOutDir: string; electronPlatformName: string },
    options?: { strict?: boolean }
  ) => void
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

type PackagedNativeAddonFixture = {
  appOutDir: string
  releaseDir: string
  resourcesDir: string
}

async function createPackagedNativeAddonFixture(
  addonNames: readonly string[]
): Promise<PackagedNativeAddonFixture> {
  const workspaceRoot = await fs.mkdtemp(path.join(tmpdir(), 'after-pack-native-addons-'))
  fixtureRoots.push(workspaceRoot)

  const appOutDir = path.join(workspaceRoot, 'packaged-app')
  const resourcesDir = path.join(appOutDir, 'Tuff.app', 'Contents', 'Resources')
  const releaseDir = path.join(
    resourcesDir,
    'node_modules',
    '@talex-touch',
    'tuff-native',
    'build',
    'Release'
  )
  await fs.mkdir(releaseDir, { recursive: true })
  await Promise.all([
    fs.writeFile(path.join(resourcesDir, 'app.asar'), 'fixture'),
    ...addonNames.map((addonName) => fs.writeFile(path.join(releaseDir, addonName), 'fixture'))
  ])

  return { appOutDir, releaseDir, resourcesDir }
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

describe('verifyPackagedNativeAddons', () => {
  it('accepts a darwin package whose OCR and audio addons survived packaging', async () => {
    const { appOutDir } = await createPackagedNativeAddonFixture([
      'tuff_native_ocr.node',
      'tuff_native_audio.node'
    ])

    expect(() =>
      verifyPackagedNativeAddons({ appOutDir, electronPlatformName: 'darwin' }, { strict: true })
    ).not.toThrow()
  })

  it('rejects a strict darwin package that lost the audio addon', async () => {
    const { appOutDir, releaseDir } = await createPackagedNativeAddonFixture([
      'tuff_native_ocr.node',
      'tuff_native_audio.node'
    ])
    await fs.rm(path.join(releaseDir, 'tuff_native_audio.node'))

    expect(() =>
      verifyPackagedNativeAddons({ appOutDir, electronPlatformName: 'darwin' }, { strict: true })
    ).toThrow(/Packaged native addons missing from .*: tuff_native_audio\.node\./)
  })

  it('only warns for a non-strict package that lost the audio addon', async () => {
    const { appOutDir, releaseDir } = await createPackagedNativeAddonFixture([
      'tuff_native_ocr.node',
      'tuff_native_audio.node'
    ])
    await fs.rm(path.join(releaseDir, 'tuff_native_audio.node'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      expect(() =>
        verifyPackagedNativeAddons({ appOutDir, electronPlatformName: 'darwin' }, { strict: false })
      ).not.toThrow()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('tuff_native_audio.node'))
    } finally {
      warn.mockRestore()
    }
  })

  it('rejects a Win32 package that lost the Everything addon', async () => {
    const { appOutDir } = await createPackagedNativeAddonFixture([
      'tuff_native_ocr.node',
      'tuff_native_audio.node'
    ])

    expect(() =>
      verifyPackagedNativeAddons({ appOutDir, electronPlatformName: 'win32' }, { strict: true })
    ).toThrow(/Packaged native addons missing from .*: tuff_native_everything\.node\./)
  })
})

type PackagedFdFixture = {
  appOutDir: string
  binaryPath: string
  resourcesDir: string
}

/**
 * The packaged layout electron-builder produces for an unpacked platform binary. `nested` is the
 * pnpm spelling, where the platform package sits under the wrapper package instead of beside it.
 */
const FD_BINARY_LAYOUTS = {
  flat: ['node_modules', '@prebuilt-binary', 'fd-darwin-arm64', 'bin', 'fd'],
  nested: [
    'node_modules',
    '@prebuilt-binary',
    'fd',
    'node_modules',
    '@prebuilt-binary',
    'fd-darwin-arm64',
    'bin',
    'fd'
  ]
} as const

async function createPackagedFdFixture(
  options: {
    layout?: keyof typeof FD_BINARY_LAYOUTS
    licenses?: readonly string[]
  } = {}
): Promise<PackagedFdFixture> {
  const workspaceRoot = await fs.mkdtemp(path.join(tmpdir(), 'after-pack-fd-'))
  fixtureRoots.push(workspaceRoot)

  const appOutDir = path.join(workspaceRoot, 'packaged-app')
  const resourcesDir = path.join(appOutDir, 'Tuff.app', 'Contents', 'Resources')
  const unpackedRoot = path.join(resourcesDir, 'app.asar.unpacked')
  await fs.mkdir(unpackedRoot, { recursive: true })
  await fs.writeFile(path.join(resourcesDir, 'app.asar'), 'fixture')

  for (const licenseName of options.licenses ?? []) {
    const licensePath = path.join(resourcesDir, 'licenses', licenseName)
    await fs.mkdir(path.dirname(licensePath), { recursive: true })
    await fs.writeFile(licensePath, 'fixture license')
  }

  const binaryPath = path.join(unpackedRoot, ...FD_BINARY_LAYOUTS[options.layout ?? 'flat'])
  if (options.layout !== undefined) {
    await fs.mkdir(path.dirname(binaryPath), { recursive: true })
    // 0o644 like a package manager that dropped the executable bit, so the verifier's chmod is
    // the only thing that can make the X_OK probe pass.
    await fs.writeFile(binaryPath, 'fixture fd', { mode: 0o644 })
  }

  return { appOutDir, binaryPath, resourcesDir }
}

const FD_LICENSES = ['fd-LICENSE-MIT.txt', 'fd-LICENSE-APACHE.txt'] as const

describe('verifyPackagedFdBinary', () => {
  it('marks the unpacked fd binary executable and accepts its archived licenses', async () => {
    const { appOutDir, binaryPath } = await createPackagedFdFixture({
      layout: 'flat',
      licenses: FD_LICENSES
    })

    expect(() =>
      verifyPackagedFdBinary({ appOutDir, electronPlatformName: 'darwin', arch: 3 })
    ).not.toThrow()

    // The package that ships must be runnable: spawn() fails on a binary without the exec bit.
    expect(((await fs.stat(binaryPath)).mode & 0o777).toString(8)).toBe('755')
  })

  it('accepts the pnpm-nested platform package layout', async () => {
    const { appOutDir, binaryPath } = await createPackagedFdFixture({
      layout: 'nested',
      licenses: FD_LICENSES
    })

    expect(() =>
      verifyPackagedFdBinary({ appOutDir, electronPlatformName: 'darwin', arch: 3 })
    ).not.toThrow()
    expect(((await fs.stat(binaryPath)).mode & 0o777).toString(8)).toBe('755')
  })

  it('fails the package when the fd binary is missing from every known layout', async () => {
    const { appOutDir } = await createPackagedFdFixture({ licenses: FD_LICENSES })

    expect(() =>
      verifyPackagedFdBinary({ appOutDir, electronPlatformName: 'darwin', arch: 3 })
    ).toThrow(/Packaged fd binary is missing for darwin-arm64/)
  })

  it('fails the package when only one of the two fd license texts was archived', async () => {
    const { appOutDir } = await createPackagedFdFixture({
      layout: 'flat',
      licenses: ['fd-LICENSE-MIT.txt']
    })

    expect(() =>
      verifyPackagedFdBinary({ appOutDir, electronPlatformName: 'darwin', arch: 3 })
    ).toThrow(/Packaged fd license is missing: .*fd-LICENSE-APACHE\.txt/)
  })

  it('skips verification for a target with no bundled fd and leaves the package build intact', async () => {
    // darwin-x64 has no platform package: packaging must succeed and the runtime falls back to
    // the legacy walker rather than failing the build for a binary that does not exist.
    const { appOutDir } = await createPackagedFdFixture()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      expect(() =>
        verifyPackagedFdBinary({ appOutDir, electronPlatformName: 'darwin', arch: 1 })
      ).not.toThrow()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('darwin-x64'))
    } finally {
      warn.mockRestore()
    }
  })
})
