import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  findCommandInSearchRoots,
  getResolvedCliExecutable,
  resetCliExecutableCache,
  resolveCliExecutable
} from './cli-executable'
import {
  getResolvedPiExecutable,
  getResolvedPiForm,
  resetPiExecutableCache,
  resolvePiExecutable
} from '../pi-cli-runtime'

/**
 * Real directories and real mode bits: the module's whole job is asking the filesystem which of
 * several places holds an executable, and a stubbed `fs` would only test the stub.
 *
 * The command names are synthetic so no machine — developer or CI — can have them in the fixed
 * roots (`/opt/homebrew/bin`, `/usr/local/bin`) this resolver also searches and the test cannot
 * redirect. HOME is redirected so the version-manager and `~/.local/bin` roots resolve inside the
 * workspace too.
 */
const LOOKUP = {
  command: 'tuff-probe-primary',
  fallbackCommands: ['tuff-probe-fallback'],
  envOverride: 'TUFF_PROBE_CLI_PATH'
} as const

const ENV_KEYS = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'FNM_DIR',
  'XDG_DATA_HOME',
  LOOKUP.envOverride,
  'TUFF_PI_CLI_PATH'
] as const

let workDir: string
let binDir: string
let savedEnv: Array<string | undefined> = []

async function writeExecutable(directory: string, name: string): Promise<string> {
  await mkdir(directory, { recursive: true })
  const path = join(directory, name)
  await writeFile(path, '#!/bin/sh\nexit 0\n', 'utf8')
  await chmod(path, 0o755)
  return path
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'cli-executable-'))
  binDir = join(workDir, 'bin')
  await mkdir(binDir)
  savedEnv = ENV_KEYS.map((key) => process.env[key])
  process.env.PATH = binDir
  process.env.HOME = workDir
  process.env.USERPROFILE = workDir
  delete process.env.FNM_DIR
  delete process.env.XDG_DATA_HOME
  delete process.env[LOOKUP.envOverride]
  delete process.env.TUFF_PI_CLI_PATH
  resetCliExecutableCache()
})

afterEach(async () => {
  ENV_KEYS.forEach((key, index) => {
    const previous = savedEnv[index]
    if (previous === undefined) delete process.env[key]
    else process.env[key] = previous
  })
  resetCliExecutableCache()
  await rm(workDir, { recursive: true, force: true })
})

describe('resolveCliExecutable', () => {
  it('finds the primary command on PATH', async () => {
    const path = await writeExecutable(binDir, LOOKUP.command)

    await expect(resolveCliExecutable(LOOKUP)).resolves.toEqual({
      path,
      command: LOOKUP.command,
      form: 'primary'
    })
  })

  it('falls back to the alias only once the primary is absent everywhere', async () => {
    const path = await writeExecutable(binDir, 'tuff-probe-fallback')

    await expect(resolveCliExecutable(LOOKUP)).resolves.toEqual({
      path,
      command: 'tuff-probe-fallback',
      form: 'fallback'
    })
  })

  it('prefers a primary in a fixed root over a fallback on PATH', async () => {
    // The fallback is a stand-in, not a peer: every location for the primary — PATH and the
    // roots a GUI launch never inherits — is exhausted before the alias is considered at all.
    await writeExecutable(binDir, 'tuff-probe-fallback')
    const primary = await writeExecutable(join(workDir, '.local', 'bin'), LOOKUP.command)

    await expect(resolveCliExecutable(LOOKUP)).resolves.toMatchObject({
      path: primary,
      form: 'primary'
    })
  })

  it('searches version-manager roots newest version first', async () => {
    const root = join(workDir, '.local', 'share', 'mise', 'installs', 'node')
    await writeExecutable(join(root, '22.1.0', 'bin'), LOOKUP.command)
    const newest = await writeExecutable(join(root, '24.2.0', 'bin'), LOOKUP.command)

    await expect(resolveCliExecutable(LOOKUP)).resolves.toMatchObject({ path: newest })
  })

  it('orders versions by number and skips alias and short-name directories', async () => {
    // A string sort puts `24.9.0` before `24.18.0`, and `lts` / `latest` before every number.
    const mise = join(workDir, '.local', 'share', 'mise', 'installs', 'node')
    await writeExecutable(join(mise, '24.9.0', 'bin'), LOOKUP.command)
    const newest = await writeExecutable(join(mise, '24.18.0', 'bin'), LOOKUP.command)
    await writeExecutable(join(mise, 'latest', 'bin'), LOOKUP.command)
    await writeExecutable(join(mise, 'lts', 'bin'), LOOKUP.command)
    await writeExecutable(join(mise, '24', 'bin'), LOOKUP.command)
    await writeExecutable(join(mise, '24.18', 'bin'), LOOKUP.command)

    await expect(resolveCliExecutable(LOOKUP)).resolves.toMatchObject({ path: newest })
  })

  it("reads nvm's v-prefixed version directories by number too", async () => {
    const nvm = join(workDir, '.nvm', 'versions', 'node')
    await writeExecutable(join(nvm, 'v20.9.0', 'bin'), LOOKUP.command)
    const newest = await writeExecutable(join(nvm, 'v20.10.0', 'bin'), LOOKUP.command)

    await expect(resolveCliExecutable(LOOKUP)).resolves.toMatchObject({ path: newest })
  })

  it.each([
    { root: '$FNM_DIR', env: { FNM_DIR: 'custom-fnm' }, dir: ['custom-fnm'] },
    { root: 'the legacy ~/.fnm', dir: ['.fnm'] },
    {
      root: "macOS's Application Support",
      dir: ['Library', 'Application Support', 'fnm'],
      platform: 'darwin'
    },
    { root: '$XDG_DATA_HOME', env: { XDG_DATA_HOME: 'xdg-data' }, dir: ['xdg-data', 'fnm'] },
    { root: '~/.local/share', dir: ['.local', 'share', 'fnm'] }
  ])(
    "finds fnm's install under $root, in installation/bin, newest first",
    async ({ env, dir, platform }) => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
      if (platform) Object.defineProperty(process, 'platform', { value: platform })
      for (const [key, value] of Object.entries(env ?? {})) process.env[key] = join(workDir, value)
      try {
        const versions = join(workDir, ...dir, 'node-versions')
        await writeExecutable(join(versions, 'v22.9.0', 'installation', 'bin'), LOOKUP.command)
        const newest = await writeExecutable(
          join(versions, 'v22.10.0', 'installation', 'bin'),
          LOOKUP.command
        )

        await expect(resolveCliExecutable(LOOKUP)).resolves.toMatchObject({ path: newest })
      } finally {
        Object.defineProperty(process, 'platform', originalPlatform)
      }
    }
  )

  it('reports absence as null when neither name exists', async () => {
    await expect(resolveCliExecutable(LOOKUP)).resolves.toBeNull()
  })

  it('ignores a file on PATH that is not executable', async () => {
    await writeFile(join(binDir, LOOKUP.command), 'not runnable', 'utf8')
    await chmod(join(binDir, LOOKUP.command), 0o644)

    await expect(resolveCliExecutable(LOOKUP)).resolves.toBeNull()
  })

  describe('environment override', () => {
    it('wins over everything on PATH', async () => {
      await writeExecutable(binDir, LOOKUP.command)
      const pinned = await writeExecutable(join(workDir, 'pinned'), 'anything')
      process.env[LOOKUP.envOverride] = pinned

      await expect(resolveCliExecutable(LOOKUP)).resolves.toEqual({
        path: pinned,
        command: LOOKUP.command,
        form: 'primary'
      })
    })

    it('is authoritative: a dead override means absent, not "search anyway"', async () => {
      await writeExecutable(binDir, LOOKUP.command)
      process.env[LOOKUP.envOverride] = join(workDir, 'definitely-missing')

      await expect(resolveCliExecutable(LOOKUP)).resolves.toBeNull()
    })

    it('counts a directory as absent too', async () => {
      await writeExecutable(binDir, LOOKUP.command)
      const bundle = join(workDir, 'Probe.app')
      await mkdir(bundle)
      process.env[LOOKUP.envOverride] = bundle

      await expect(resolveCliExecutable(LOOKUP)).resolves.toBeNull()
    })

    it('reads the form off the file name when it points at the alias', async () => {
      const pinned = await writeExecutable(join(workDir, 'pinned'), 'tuff-probe-fallback')
      process.env[LOOKUP.envOverride] = pinned

      await expect(resolveCliExecutable(LOOKUP)).resolves.toMatchObject({
        command: 'tuff-probe-fallback',
        form: 'fallback'
      })
    })
  })

  describe('settings override', () => {
    it('wins over PATH, and yields to the environment override', async () => {
      await writeExecutable(binDir, LOOKUP.command)
      const picked = await writeExecutable(join(workDir, 'picked'), 'anything')

      await expect(resolveCliExecutable(LOOKUP, { settingsOverride: picked })).resolves.toEqual({
        path: picked,
        command: LOOKUP.command,
        form: 'primary'
      })

      resetCliExecutableCache()
      const pinned = await writeExecutable(join(workDir, 'pinned'), 'anything')
      process.env[LOOKUP.envOverride] = pinned
      await expect(
        resolveCliExecutable(LOOKUP, { settingsOverride: picked })
      ).resolves.toMatchObject({ path: pinned })
    })

    it('is skipped once it is not executable: the search goes on and says so', async () => {
      // Unlike the environment override, a pick in Settings is not a test pin: the program moved
      // or was uninstalled, and the CLI the user still has should keep working.
      const onPath = await writeExecutable(binDir, LOOKUP.command)

      await expect(
        resolveCliExecutable(LOOKUP, { settingsOverride: join(workDir, 'moved-away') })
      ).resolves.toEqual({
        path: onPath,
        command: LOOKUP.command,
        form: 'primary',
        settingsOverrideRejected: true
      })
    })

    it('refuses a directory, such as the app bundle picked instead of the program in it', async () => {
      // On a directory X_OK means "may enter": access() alone took `Claude.app` for the CLI.
      const onPath = await writeExecutable(binDir, LOOKUP.command)
      const bundle = join(workDir, 'Probe.app')
      await mkdir(bundle)

      await expect(resolveCliExecutable(LOOKUP, { settingsOverride: bundle })).resolves.toEqual({
        path: onPath,
        command: LOOKUP.command,
        form: 'primary',
        settingsOverrideRejected: true
      })
    })
  })

  describe('cache', () => {
    it('is unprobed until the first resolve, then memoises the answer', async () => {
      expect(getResolvedCliExecutable(LOOKUP.command)).toBeUndefined()
      const path = await writeExecutable(binDir, LOOKUP.command)

      await resolveCliExecutable(LOOKUP)

      expect(getResolvedCliExecutable(LOOKUP.command)).toMatchObject({ path })
      // The memo answers even after the file is gone; only a reset re-scans.
      await rm(path)
      await expect(resolveCliExecutable(LOOKUP)).resolves.toMatchObject({ path })
    })

    it('keeps a probed miss as null, distinct from unprobed', async () => {
      await resolveCliExecutable(LOOKUP)

      expect(getResolvedCliExecutable(LOOKUP.command)).toBeNull()
    })

    it('re-scans after a reset for that command', async () => {
      await resolveCliExecutable(LOOKUP)
      expect(getResolvedCliExecutable(LOOKUP.command)).toBeNull()
      const path = await writeExecutable(binDir, LOOKUP.command)

      resetCliExecutableCache(LOOKUP.command)

      expect(getResolvedCliExecutable(LOOKUP.command)).toBeUndefined()
      await expect(resolveCliExecutable(LOOKUP)).resolves.toMatchObject({ path })
    })

    it('memoises per command, so one CLI never answers for another', async () => {
      const other = { command: 'tuff-probe-other', envOverride: 'TUFF_PROBE_OTHER_PATH' }
      const path = await writeExecutable(binDir, LOOKUP.command)

      await resolveCliExecutable(LOOKUP)
      await resolveCliExecutable(other)

      expect(getResolvedCliExecutable(LOOKUP.command)).toMatchObject({ path })
      expect(getResolvedCliExecutable(other.command)).toBeNull()
    })
  })
})

describe('findCommandInSearchRoots', () => {
  it('finds a bare command in the version-manager roots, PATH first, and null when absent', async () => {
    const mise = join(workDir, '.local', 'share', 'mise', 'installs', 'node')
    const inRoot = await writeExecutable(join(mise, '26.9.0', 'bin'), 'tuff-probe-npx')

    await expect(findCommandInSearchRoots('tuff-probe-npx')).resolves.toBe(inRoot)

    resetCliExecutableCache()
    const onPath = await writeExecutable(binDir, 'tuff-probe-npx')
    await expect(findCommandInSearchRoots('tuff-probe-npx')).resolves.toBe(onPath)
    await expect(findCommandInSearchRoots('tuff-probe-missing')).resolves.toBeNull()
  })

  it('looks again after a miss, and lets go of a remembered hit that is gone', async () => {
    await expect(findCommandInSearchRoots('tuff-probe-npx')).resolves.toBeNull()
    // Installed after the first look: found without a reset.
    const onPath = await writeExecutable(binDir, 'tuff-probe-npx')
    await expect(findCommandInSearchRoots('tuff-probe-npx')).resolves.toBe(onPath)

    // Removed since (a version manager dropping that Node): the next look finds what is left.
    await rm(onPath)
    const mise = join(workDir, '.local', 'share', 'mise', 'installs', 'node')
    const inRoot = await writeExecutable(join(mise, '26.9.0', 'bin'), 'tuff-probe-npx')
    await expect(findCommandInSearchRoots('tuff-probe-npx')).resolves.toBe(inRoot)
  })
})

describe('pi wrappers', () => {
  beforeEach(() => resetPiExecutableCache())

  it('resolves pie as the fallback form of the pi provider', async () => {
    // Pinned by override rather than PATH so the machine's real `pi` in a fixed root cannot
    // steal the answer. The basename decides the form: this is what lets AC4's
    // `TUFF_PI_CLI_PATH=…/pie` show "Pi · Touch Pie".
    const pie = await writeExecutable(join(workDir, 'pie-bin'), 'pie')
    process.env.TUFF_PI_CLI_PATH = pie

    expect(getResolvedPiExecutable()).toBeUndefined()
    expect(getResolvedPiForm()).toBeUndefined()
    await expect(resolvePiExecutable()).resolves.toBe(pie)
    expect(getResolvedPiExecutable()).toBe(pie)
    expect(getResolvedPiForm()).toBe('fallback')
  })

  it('keeps the primary form for a pinned pi', async () => {
    const pi = await writeExecutable(join(workDir, 'pi-bin'), 'pi')
    process.env.TUFF_PI_CLI_PATH = pi

    await expect(resolvePiExecutable()).resolves.toBe(pi)
    expect(getResolvedPiForm()).toBe('primary')
  })

  it('reports a probed miss as null and clears it on reset', async () => {
    process.env.TUFF_PI_CLI_PATH = join(workDir, 'definitely-missing')

    await expect(resolvePiExecutable()).resolves.toBeNull()
    expect(getResolvedPiExecutable()).toBeNull()
    expect(getResolvedPiForm()).toBeUndefined()

    resetPiExecutableCache()
    expect(getResolvedPiExecutable()).toBeUndefined()
  })
})
