import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { LocalAiCliProviderId } from '@talex-touch/utils/transport/events/local-ai-cli'
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Real files, real processes: the resolver's job is which program it runs and what that program
 * answers to `--version`, and a stubbed filesystem or child process would only test the stub.
 *
 * The four lookups are swapped for synthetic command names (the lookup itself is the chat
 * providers' and has its own suite), so no machine can have them in the fixed roots
 * (`/opt/homebrew/bin`, `/usr/local/bin`) the search also walks. HOME is redirected so the
 * version-manager and `~/.local/bin` roots resolve inside the workspace too.
 */
const mocks = vi.hoisted(() => ({
  getMainConfig: vi.fn()
}))

vi.mock('../storage', () => ({ getMainConfig: mocks.getMainConfig }))

vi.mock('../ai/providers/pi-cli-runtime', () => ({
  PI_CLI_LOOKUP: {
    command: 'tuff-probe-pi',
    fallbackCommands: ['tuff-probe-pie'],
    envOverride: 'TUFF_PROBE_PI_PATH'
  },
  OMP_CLI_LOOKUP: { command: 'tuff-probe-omp', envOverride: 'TUFF_PROBE_OMP_PATH' },
  CODEX_CLI_LOOKUP: { command: 'tuff-probe-codex', envOverride: 'TUFF_PROBE_CODEX_PATH' },
  CLAUDE_CLI_LOOKUP: { command: 'tuff-probe-claude', envOverride: 'TUFF_PROBE_CLAUDE_PATH' }
}))

import {
  getResolvedCliExecutable,
  resetCliExecutableCache
} from '../ai/providers/cli/cli-executable'
import {
  probeCliVersion,
  refreshLocalAiCliExecutables,
  resolveLocalAiCliProviderStatus
} from './executable-resolver'

const ENV_KEYS = ['PATH', 'HOME', 'USERPROFILE', 'TUFF_PROBE_RUNS'] as const

let workDir: string
let binDir: string
let runsLog: string
let savedEnv: Array<string | undefined> = []

/** A program that records each run and prints `output`. */
async function writeProgram(directory: string, name: string, output: string): Promise<string> {
  await mkdir(directory, { recursive: true })
  const path = join(directory, name)
  await writeFile(path, `#!/bin/sh\necho run >> "$TUFF_PROBE_RUNS"\necho '${output}'\n`, 'utf8')
  await chmod(path, 0o755)
  return path
}

async function runCount(): Promise<number> {
  try {
    return (await readFile(runsLog, 'utf8')).split('\n').filter(Boolean).length
  } catch {
    return 0
  }
}

function settings(
  overrides: Partial<Record<LocalAiCliProviderId, string>> = {}
): AppSetting['localAiCli'] {
  const provider = (id: LocalAiCliProviderId) => ({
    enabled: true,
    executableOverride: overrides[id] ?? ''
  })
  return {
    enabled: true,
    defaultProvider: null,
    providers: {
      pi: provider('pi'),
      codex: provider('codex'),
      claude: provider('claude'),
      'oh-my-pi': provider('oh-my-pi')
    }
  }
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'local-ai-cli-resolver-'))
  binDir = join(workDir, 'bin')
  runsLog = join(workDir, 'runs.log')
  await mkdir(binDir)
  savedEnv = ENV_KEYS.map((key) => process.env[key])
  process.env.PATH = binDir
  process.env.HOME = workDir
  process.env.USERPROFILE = workDir
  process.env.TUFF_PROBE_RUNS = runsLog
  // Both memos are module state. The refresh is the one way to forget the `--version` answers; the
  // reset after it leaves every lookup unprobed, as at startup.
  await refreshLocalAiCliExecutables(settings())
  resetCliExecutableCache()
})

afterEach(async () => {
  ENV_KEYS.forEach((key, index) => {
    const previous = savedEnv[index]
    if (previous === undefined) delete process.env[key]
    else process.env[key] = previous
  })
  await rm(workDir, { recursive: true, force: true })
})

describe('local agent CLI status', () => {
  it('runs a mise shim by its own name instead of resolving it to mise', async () => {
    // A shim is a link to mise, which picks the tool by the name it was run as. Resolved to its
    // target it is mise itself: `mise --version` passed for every CLI, and tasks ran `mise …`.
    const mise = join(workDir, 'mise-install', 'bin', 'mise')
    await mkdir(join(workDir, 'mise-install', 'bin'), { recursive: true })
    await writeFile(
      mise,
      [
        '#!/bin/sh',
        // `${0##*/}`, not `basename`: PATH here is the workspace's bin only.
        'case "${0##*/}" in',
        "  tuff-probe-codex) echo 'codex-cli 0.158.0' ;;",
        "  *) echo '2025.10.8 macos-arm64 (2025-10-13)' ;;",
        'esac',
        ''
      ].join('\n'),
      'utf8'
    )
    await chmod(mise, 0o755)
    const shim = join(binDir, 'tuff-probe-codex')
    await symlink(mise, shim)

    await expect(resolveLocalAiCliProviderStatus('codex', settings())).resolves.toMatchObject({
      installed: true,
      executablePath: shim,
      version: '0.158.0'
    })
  })

  it("reads a version only from the CLI's own --version output", async () => {
    const mise = await writeProgram(
      join(workDir, 'mise-install', 'bin'),
      'mise',
      '2025.10.8 macos-arm64 (2025-10-13)'
    )
    for (const provider of ['codex', 'claude', 'oh-my-pi'] as const) {
      await expect(probeCliVersion(provider, mise)).resolves.toBeUndefined()
    }

    // What each CLI prints on this machine (2026-10-03) still reads, as the bare version.
    const samples: Array<[LocalAiCliProviderId, string, string]> = [
      ['pi', '0.84.3', '0.84.3'],
      ['codex', 'codex-cli 0.158.0', '0.158.0'],
      ['claude', '2.1.280 (Claude Code)', '2.1.280'],
      ['oh-my-pi', 'omp/18.4.4', '18.4.4']
    ]
    for (const [provider, output, version] of samples) {
      const program = await writeProgram(join(workDir, `sample-${provider}`), 'cli', output)
      await expect(probeCliVersion(provider, program)).resolves.toBe(version)
    }
  })

  it('goes on past a pick that is no longer executable, and says so', async () => {
    const found = await writeProgram(binDir, 'tuff-probe-claude', '2.1.280 (Claude Code)')
    const movedAway = join(workDir, 'moved-away')

    await expect(
      resolveLocalAiCliProviderStatus('claude', settings({ claude: movedAway }))
    ).resolves.toMatchObject({
      installed: true,
      executablePath: found,
      version: '2.1.280',
      settingsOverrideRejected: true
    })
    // Nothing else to find: unavailable, and still saying the pick was refused.
    await expect(
      resolveLocalAiCliProviderStatus('oh-my-pi', settings({ 'oh-my-pi': movedAway }))
    ).resolves.toMatchObject({
      installed: false,
      issueCode: 'PROVIDER_UNAVAILABLE',
      settingsOverrideRejected: true
    })
  })

  it('answers a second read from memory without running --version again', async () => {
    await writeProgram(binDir, 'tuff-probe-omp', 'omp/18.4.4')

    await resolveLocalAiCliProviderStatus('oh-my-pi', settings())
    await expect(resolveLocalAiCliProviderStatus('oh-my-pi', settings())).resolves.toMatchObject({
      installed: true,
      version: '18.4.4'
    })

    expect(await runCount()).toBe(1)
  })

  it('asks again after a --version run that failed, rather than remembering the failure', async () => {
    // Caught mid-update or slow to start, a CLI fails once; that is not its answer for the session.
    const omp = join(binDir, 'tuff-probe-omp')
    await writeFile(omp, '#!/bin/sh\necho run >> "$TUFF_PROBE_RUNS"\nexit 1\n', 'utf8')
    await chmod(omp, 0o755)
    await expect(resolveLocalAiCliProviderStatus('oh-my-pi', settings())).resolves.toMatchObject({
      installed: false
    })

    await writeProgram(binDir, 'tuff-probe-omp', 'omp/18.4.4')
    await expect(resolveLocalAiCliProviderStatus('oh-my-pi', settings())).resolves.toMatchObject({
      installed: true,
      version: '18.4.4'
    })
  })

  it('probes again after a refresh', async () => {
    await writeProgram(binDir, 'tuff-probe-pi', '0.84.3')
    await expect(resolveLocalAiCliProviderStatus('pi', settings())).resolves.toMatchObject({
      version: '0.84.3'
    })
    // An update in place: the memo still answers with what it read.
    await writeProgram(binDir, 'tuff-probe-pi', '0.85.0')
    await expect(resolveLocalAiCliProviderStatus('pi', settings())).resolves.toMatchObject({
      version: '0.84.3'
    })

    await refreshLocalAiCliExecutables(settings())

    await expect(resolveLocalAiCliProviderStatus('pi', settings())).resolves.toMatchObject({
      version: '0.85.0'
    })
    expect(await runCount()).toBe(2)
  })

  it('keeps the previous lookup readable until the refreshed one replaces it', async () => {
    const before = await writeProgram(binDir, 'tuff-probe-codex', 'codex-cli 0.158.0')
    await resolveLocalAiCliProviderStatus('codex', settings())
    // Moved: the next look finds it in ~/.local/bin.
    await rm(before)
    const after = await writeProgram(
      join(workDir, '.local', 'bin'),
      'tuff-probe-codex',
      'codex-cli 0.158.0'
    )

    const refreshing = refreshLocalAiCliExecutables(settings())
    // The chat providers' memo: config assembly reads it synchronously on every invoke and drops a
    // CLI it finds unprobed, so mid-refresh it still answers with what it had.
    expect(getResolvedCliExecutable('tuff-probe-codex')).toMatchObject({ path: before })
    await refreshing

    expect(getResolvedCliExecutable('tuff-probe-codex')).toMatchObject({ path: after })
  })
})
