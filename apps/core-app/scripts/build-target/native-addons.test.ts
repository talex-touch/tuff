import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

type PreservedAddons = { backupDir: string; kept: string[] }

const { nativeAddonReleaseDir, preserveRequiredNativeAddons, restorePreservedNativeAddons } =
  require('./native-addons.js') as {
    nativeAddonReleaseDir: (projectRoot: string) => string
    preserveRequiredNativeAddons: (options: {
      projectRoot: string
      target: string
      tempRoot?: string
    }) => PreservedAddons
    restorePreservedNativeAddons: (options: {
      projectRoot: string
      preserved: PreservedAddons
    }) => string[]
  }
const { requiredNativeAddonNames } = require('./runtime-modules.js') as {
  requiredNativeAddonNames: (target: string) => string[]
}

const WINDOWS_ADDONS = requiredNativeAddonNames('win')
/** The two addons binding.gyp itself builds; everything else in build/Release came from Cargo. */
const GYP_BUILT_ADDONS = ['tuff_native_ocr.node', 'tuff_native_everything.node']
const AUDIO_ADDON = 'tuff_native_audio.node'
const EVERYTHING_ADDON = 'tuff_native_everything.node'
/** Present in the release dir but on no target's required list. */
const UNREQUESTED_ADDON = 'tuff_native_unrequested.node'

const fixtureRoots: string[] = []

type NativeAddonsFixture = {
  projectRoot: string
  releaseDir: string
  tempRoot: string
}

/**
 * A throwaway projectRoot holding `<root>/node_modules/@talex-touch/tuff-native/build/Release`.
 * Every addon in `addonNames` gets distinct stand-in bytes, so a copy that swaps one addon for
 * another — or for a rebuild's output — is visible in the assertions.
 */
function createNativeAddonsFixture(
  addonNames: readonly string[],
  options: { createReleaseDir?: boolean } = {}
): NativeAddonsFixture {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'native-addons-'))
  fixtureRoots.push(tempRoot)

  const projectRoot = path.join(tempRoot, 'apps', 'core-app')
  const releaseDir = nativeAddonReleaseDir(projectRoot)
  if (options.createReleaseDir ?? true) {
    mkdirSync(releaseDir, { recursive: true })
    for (const addonName of addonNames) {
      writeFileSync(path.join(releaseDir, addonName), `cargo-built:${addonName}\n`)
    }
  }

  return { projectRoot, releaseDir, tempRoot }
}

/** Mimics node-gyp's clean step, then a gyp rebuild that produced `rebuiltAddons`. */
function simulateInstallAppDepsRebuild(releaseDir: string, rebuiltAddons: readonly string[]): void {
  rmSync(releaseDir, { recursive: true, force: true })
  mkdirSync(releaseDir, { recursive: true })
  for (const addonName of rebuiltAddons) {
    writeFileSync(path.join(releaseDir, addonName), `node-gyp-rebuilt:${addonName}\n`)
  }
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('nativeAddonReleaseDir', () => {
  it('names the tuff-native Release dir the presence check reads, for the root it is given', () => {
    const fixture = createNativeAddonsFixture([], { createReleaseDir: false })
    const expected = path.join(
      fixture.projectRoot,
      'node_modules',
      '@talex-touch',
      'tuff-native',
      'build',
      'Release'
    )

    expect(nativeAddonReleaseDir(fixture.projectRoot)).toBe(expected)

    // Not just a string: preserving and restoring act on that exact directory.
    mkdirSync(expected, { recursive: true })
    writeFileSync(path.join(expected, 'tuff_native_ocr.node'), 'cargo-built:ocr\n')
    const preserved = preserveRequiredNativeAddons({
      projectRoot: fixture.projectRoot,
      target: 'win',
      tempRoot: fixture.tempRoot
    })
    rmSync(path.join(expected, 'tuff_native_ocr.node'))

    expect(restorePreservedNativeAddons({ projectRoot: fixture.projectRoot, preserved })).toEqual([
      'tuff_native_ocr.node'
    ])
    expect(readFileSync(path.join(expected, 'tuff_native_ocr.node'), 'utf8')).toBe(
      'cargo-built:ocr\n'
    )
  })
})

describe('preserveRequiredNativeAddons', () => {
  it('keeps exactly the required addons that exist and copies them out', () => {
    const fixture = createNativeAddonsFixture([...WINDOWS_ADDONS, UNREQUESTED_ADDON])

    const { backupDir, kept } = preserveRequiredNativeAddons({
      projectRoot: fixture.projectRoot,
      target: 'win',
      tempRoot: fixture.tempRoot
    })

    expect([...kept].sort()).toEqual([...WINDOWS_ADDONS].sort())
    for (const addonName of WINDOWS_ADDONS) {
      expect(readFileSync(path.join(backupDir, addonName), 'utf8')).toBe(
        `cargo-built:${addonName}\n`
      )
      // A copy, not a move: the addon the build just produced stays where it was produced.
      expect(readFileSync(path.join(fixture.releaseDir, addonName), 'utf8')).toBe(
        `cargo-built:${addonName}\n`
      )
    }
    expect(existsSync(path.join(backupDir, UNREQUESTED_ADDON))).toBe(false)
  })

  it('keeps only the cross-platform addons when the target is mac', () => {
    const fixture = createNativeAddonsFixture(WINDOWS_ADDONS)

    const { backupDir, kept } = preserveRequiredNativeAddons({
      projectRoot: fixture.projectRoot,
      target: 'mac',
      tempRoot: fixture.tempRoot
    })

    expect([...kept].sort()).toEqual([...requiredNativeAddonNames('mac')].sort())
    expect(existsSync(path.join(backupDir, EVERYTHING_ADDON))).toBe(false)
  })

  it('skips a required addon this run never built instead of throwing', () => {
    const fixture = createNativeAddonsFixture(['tuff_native_ocr.node'])

    const { kept } = preserveRequiredNativeAddons({
      projectRoot: fixture.projectRoot,
      target: 'win',
      tempRoot: fixture.tempRoot
    })

    expect(kept).toEqual(['tuff_native_ocr.node'])
  })
})

describe('restorePreservedNativeAddons', () => {
  it('puts back the addon the rebuild dropped and leaves the addons it rebuilt', () => {
    const fixture = createNativeAddonsFixture(WINDOWS_ADDONS)
    const preserved = preserveRequiredNativeAddons({
      projectRoot: fixture.projectRoot,
      target: 'win',
      tempRoot: fixture.tempRoot
    })

    // The PR #1991 sequence: node-gyp's clean wiped build/Release, then binding.gyp rebuilt its
    // own OCR and Everything targets while the Cargo-built audio addon stayed gone.
    simulateInstallAppDepsRebuild(fixture.releaseDir, GYP_BUILT_ADDONS)

    const restored = restorePreservedNativeAddons({ projectRoot: fixture.projectRoot, preserved })

    expect(restored).toEqual([AUDIO_ADDON])
    for (const addonName of GYP_BUILT_ADDONS) {
      expect(readFileSync(path.join(fixture.releaseDir, addonName), 'utf8')).toBe(
        `node-gyp-rebuilt:${addonName}\n`
      )
    }
    expect(readFileSync(path.join(fixture.releaseDir, AUDIO_ADDON))).toEqual(
      Buffer.from(`cargo-built:${AUDIO_ADDON}\n`)
    )
    // The presence check that runs next finds every required addon again.
    expect(
      WINDOWS_ADDONS.filter((addonName) => !existsSync(path.join(fixture.releaseDir, addonName)))
    ).toEqual([])
  })

  it('recreates the release dir when the rebuild took the whole tree with it', () => {
    const fixture = createNativeAddonsFixture(WINDOWS_ADDONS)
    const preserved = preserveRequiredNativeAddons({
      projectRoot: fixture.projectRoot,
      target: 'win',
      tempRoot: fixture.tempRoot
    })

    // install-app-deps can take the parent dirs, not just build/Release.
    rmSync(path.join(fixture.projectRoot, 'node_modules', '@talex-touch', 'tuff-native'), {
      recursive: true,
      force: true
    })

    const restored = restorePreservedNativeAddons({ projectRoot: fixture.projectRoot, preserved })

    expect([...restored].sort()).toEqual([...WINDOWS_ADDONS].sort())
    for (const addonName of WINDOWS_ADDONS) {
      expect(readFileSync(path.join(fixture.releaseDir, addonName), 'utf8')).toBe(
        `cargo-built:${addonName}\n`
      )
    }
    expect(existsSync(preserved.backupDir)).toBe(false)
  })

  it('drops the backup even when an addon cannot be copied back', () => {
    const fixture = createNativeAddonsFixture([AUDIO_ADDON])
    const preserved = preserveRequiredNativeAddons({
      projectRoot: fixture.projectRoot,
      target: 'win',
      tempRoot: fixture.tempRoot
    })
    // The backup is the only copy left, and it is gone.
    rmSync(path.join(preserved.backupDir, AUDIO_ADDON))
    rmSync(path.join(fixture.releaseDir, AUDIO_ADDON))

    let failure: NodeJS.ErrnoException | undefined
    try {
      restorePreservedNativeAddons({ projectRoot: fixture.projectRoot, preserved })
    } catch (error) {
      failure = error as NodeJS.ErrnoException
    }

    expect(failure?.code).toBe('ENOENT')
    expect(existsSync(preserved.backupDir)).toBe(false)
  })

  it.each<[scenario: string, rebuildProducedAddons: readonly string[]]>([
    ['install-app-deps kept every addon', WINDOWS_ADDONS],
    ['install-app-deps recreated build/Release without any addon', []]
  ])('always deletes the backup when %s', (_scenario, rebuildProducedAddons) => {
    const fixture = createNativeAddonsFixture(WINDOWS_ADDONS)
    const preserved = preserveRequiredNativeAddons({
      projectRoot: fixture.projectRoot,
      target: 'win',
      tempRoot: fixture.tempRoot
    })
    expect(existsSync(preserved.backupDir)).toBe(true)

    simulateInstallAppDepsRebuild(fixture.releaseDir, rebuildProducedAddons)
    const restored = restorePreservedNativeAddons({ projectRoot: fixture.projectRoot, preserved })

    expect(existsSync(preserved.backupDir)).toBe(false)
    expect([...restored].sort()).toEqual(
      WINDOWS_ADDONS.filter((addonName) => !rebuildProducedAddons.includes(addonName)).sort()
    )
  })
})

describe('a run that never produced the Cargo addons', () => {
  it('keeps and restores nothing, and fabricates no release dir', () => {
    const fixture = createNativeAddonsFixture([], { createReleaseDir: false })
    const preserved = preserveRequiredNativeAddons({
      projectRoot: fixture.projectRoot,
      target: 'win',
      tempRoot: fixture.tempRoot
    })

    expect(preserved.kept).toEqual([])
    expect(restorePreservedNativeAddons({ projectRoot: fixture.projectRoot, preserved })).toEqual(
      []
    )
    expect(existsSync(fixture.releaseDir)).toBe(false)
    expect(
      WINDOWS_ADDONS.filter((addonName) => existsSync(path.join(fixture.releaseDir, addonName)))
    ).toEqual([])
  })

  it('keeps and restores nothing when the release dir exists but is empty', () => {
    const fixture = createNativeAddonsFixture([])
    const preserved = preserveRequiredNativeAddons({
      projectRoot: fixture.projectRoot,
      target: 'win',
      tempRoot: fixture.tempRoot
    })

    expect(preserved.kept).toEqual([])
    expect(restorePreservedNativeAddons({ projectRoot: fixture.projectRoot, preserved })).toEqual(
      []
    )
    expect(readdirSync(fixture.releaseDir)).toEqual([])
  })
})
