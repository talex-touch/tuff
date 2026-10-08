import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
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

describe('a preservation that fails part way', () => {
  it('takes the half-filled backup with it and leaves the addon tree it was reading intact', () => {
    // The forcing function is a *directory* where an addon file should be: `existsSync` still
    // reports the addon as present, so the loop enters `copyFileSync`, which refuses to copy a
    // directory ("EISDIR" on Linux, "ENOTSUP" on macOS). Do not "fix" this fixture back into a
    // file — a file copies fine and the failure path goes untested. `tuff_native_audio.node` is
    // second on the win list, so `tuff_native_ocr.node` is already in the backup when the throw
    // lands: the half-filled backup this cleanup exists to remove.
    const fixture = createNativeAddonsFixture([
      ...WINDOWS_ADDONS.filter((addonName) => addonName !== AUDIO_ADDON),
      UNREQUESTED_ADDON
    ])
    mkdirSync(path.join(fixture.releaseDir, AUDIO_ADDON), { recursive: true })

    // Its own tempRoot, so a backup left behind shows up here and nowhere else.
    const failureTempRoot = mkdtempSync(path.join(tmpdir(), 'native-addons-failure-'))
    fixtureRoots.push(failureTempRoot)

    expect(() =>
      preserveRequiredNativeAddons({
        projectRoot: fixture.projectRoot,
        target: 'win',
        tempRoot: failureTempRoot
      })
    ).toThrow()

    expect(
      readdirSync(failureTempRoot).filter((entry) => entry.startsWith('tuff-native-addons-'))
    ).toEqual([])
    // Copying out was the only thing the failure was allowed to disturb.
    expect(readdirSync(fixture.releaseDir).sort()).toEqual(
      [...WINDOWS_ADDONS, UNREQUESTED_ADDON].sort()
    )

    // Positive control, in the same tempRoot: once the tree is readable again the same call
    // backs up and reports — and tempRoot holds exactly the one backup it just made, so a
    // backup the failed call had leaked would show up as a second entry here.
    const audioAddonPath = path.join(fixture.releaseDir, AUDIO_ADDON)
    rmSync(audioAddonPath, { recursive: true, force: true })
    writeFileSync(audioAddonPath, `cargo-built:${AUDIO_ADDON}\n`)
    const { backupDir, kept } = preserveRequiredNativeAddons({
      projectRoot: fixture.projectRoot,
      target: 'win',
      tempRoot: failureTempRoot
    })

    expect(path.dirname(backupDir)).toBe(failureTempRoot)
    expect(
      readdirSync(failureTempRoot).filter((entry) => entry.startsWith('tuff-native-addons-'))
    ).toEqual([path.basename(backupDir)])
    expect([...kept].sort()).toEqual([...WINDOWS_ADDONS].sort())
  })
})

describe('restorePreservedNativeAddons', () => {
  it.skipIf(process.platform === 'win32')(
    'preserves the mac translation helper contents and executable mode across a rebuild',
    () => {
      const helperName = 'tuff-native-translation'
      const fixture = createNativeAddonsFixture(['tuff_native_ocr.node', AUDIO_ADDON, helperName])
      const helperPath = path.join(fixture.releaseDir, helperName)
      const helperContents = Buffer.from('#!/bin/sh\nprintf "translation-helper\\n"\n')
      writeFileSync(helperPath, helperContents)
      chmodSync(helperPath, 0o755)

      const preserved = preserveRequiredNativeAddons({
        projectRoot: fixture.projectRoot,
        target: 'mac',
        tempRoot: fixture.tempRoot
      })

      simulateInstallAppDepsRebuild(fixture.releaseDir, ['tuff_native_ocr.node'])
      expect(existsSync(helperPath)).toBe(false)

      const restored = restorePreservedNativeAddons({
        projectRoot: fixture.projectRoot,
        preserved
      })

      expect([...restored].sort()).toEqual([AUDIO_ADDON, helperName].sort())
      expect(readFileSync(helperPath)).toEqual(helperContents)
      expect(statSync(helperPath).mode & 0o777).toBe(0o755)
      expect(readFileSync(path.join(fixture.releaseDir, AUDIO_ADDON), 'utf8')).toBe(
        `cargo-built:${AUDIO_ADDON}\n`
      )
      expect(readFileSync(path.join(fixture.releaseDir, 'tuff_native_ocr.node'), 'utf8')).toBe(
        'node-gyp-rebuilt:tuff_native_ocr.node\n'
      )
      expect(existsSync(preserved.backupDir)).toBe(false)
    }
  )

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
