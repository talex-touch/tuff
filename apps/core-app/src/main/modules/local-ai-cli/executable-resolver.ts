import type { ChildProcess } from 'node:child_process'
import type {
  LocalAiCliProviderId,
  LocalAiCliProviderStatus
} from '@talex-touch/utils/transport/events/local-ai-cli'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { CliExecutableLookup } from '../ai/providers/cli/cli-executable'
import { StorageList } from '@talex-touch/utils/common/storage/constants'
import { spawnSafe } from '@talex-touch/utils/common/utils/safe-shell'
import {
  refreshCliExecutables,
  resolveCliExecutable,
  withExecutableDirOnPath
} from '../ai/providers/cli/cli-executable'
import {
  ANTIGRAVITY_CLI_LOOKUP,
  CLAUDE_CLI_LOOKUP,
  CODEX_CLI_LOOKUP,
  CURSOR_CLI_LOOKUP,
  GEMINI_CLI_LOOKUP,
  KIRO_CLI_LOOKUP,
  OMP_CLI_LOOKUP,
  OPENCODE_CLI_LOOKUP,
  PI_CLI_LOOKUP
} from '../ai/providers/pi-cli-runtime'
import { getMainConfig } from '../storage'
import { getLocalAiCliProviderDefinition, LOCAL_AI_CLI_PROVIDERS } from './provider-registry'

/**
 * Where the local agent finds each CLI and what it reports about it.
 *
 * The lookup is the chat providers' own (`ai/providers/cli/cli-executable.ts`, spec
 * `pi-provider-contracts.md` §11.3.3), so a CLI is the same program whichever feature runs it; the
 * user's 「选择程序」 pick rides along as the settings override. What this file adds is the
 * `--version` probe, which is what tells an installed CLI from a file that merely has the name.
 *
 * Both answers are memoised. CoreBox, the omni panel and every project menu read the status, and
 * each read used to start four `--version` processes; {@link refreshLocalAiCliExecutables} is the
 * one way to look again.
 */

const PROBE_TIMEOUT_MS = 5_000
/** How long a probe that was asked to stop (SIGTERM) gets before it is killed outright. */
const PROBE_KILL_GRACE_MS = 1_000
const PROBE_OUTPUT_LIMIT = 16_384

/**
 * A mise shim whose tool version is not installed installs it before running (`auto_install`,
 * on by default): a `--version` probe would download a runtime from the network, and a slow
 * mirror or a dead proxy kept it running long past {@link PROBE_TIMEOUT_MS}. A probe only asks
 * what is there, so it runs with installs off and a missing tool fails fast like any other miss.
 * `not_found_auto_install` is the older name of the shim's own switch; other programs ignore both.
 */
const PROBE_ENV = { MISE_AUTO_INSTALL: 'false', MISE_NOT_FOUND_AUTO_INSTALL: 'false' }

/** One lookup per CLI, shared directly as a single source of truth with `pi-cli-runtime`. */
const LOOKUPS: Readonly<Record<LocalAiCliProviderId, CliExecutableLookup>> = {
  pi: PI_CLI_LOOKUP,
  'oh-my-pi': OMP_CLI_LOOKUP,
  codex: CODEX_CLI_LOOKUP,
  claude: CLAUDE_CLI_LOOKUP,
  antigravity: ANTIGRAVITY_CLI_LOOKUP,
  opencode: OPENCODE_CLI_LOOKUP,
  gemini: GEMINI_CLI_LOOKUP,
  kiro: KIRO_CLI_LOOKUP,
  cursor: CURSOR_CLI_LOOKUP
}

function lookupCommands(lookup: CliExecutableLookup): string[] {
  return [lookup.command, ...(lookup.fallbackCommands ?? [])]
}

function matchesLookup(candidate: CliExecutableLookup, target: CliExecutableLookup): boolean {
  if (candidate.command === target.command) return true
  const candidateCommands = new Set(lookupCommands(candidate))
  return lookupCommands(target).some((command) => candidateCommands.has(command))
}

/**
 * `--version` output by the path that was run. Kept as the pending promise, so reads that arrive
 * while a probe runs share it rather than starting another. The output, not the version, is what
 * is kept: which CLI's pattern it is read with depends on who asks, and the user can point two
 * providers at one file.
 *
 * Only an answer is kept. A run that failed or timed out (`null`) is dropped once its process has
 * exited, so the next read asks again: a CLI caught mid-update or slow to start is not written off
 * for the rest of the session. Until that exit the failure stands, so a program that hangs costs
 * one process per path, not one per read.
 */
const versionOutputs = new Map<string, Promise<string | null>>()

/**
 * Probes whose process is still running. Their parent is the app: a probe outliving it is never
 * reaped, so {@link stopLocalAiCliVersionProbes} kills them on quit.
 */
const runningProbes = new Set<ChildProcess>()

/**
 * The probe each path is running, until its process exits. A refresh forgets the answers in
 * {@link versionOutputs} but not these, so a read after it shares a run still going instead of
 * starting a second process for the path.
 */
const liveProbes = new Map<string, Promise<string | null>>()

/**
 * Set by the quit sweep. A status read still in its executable lookup when the sweep runs would
 * otherwise start a probe after it, and nothing is left to reap that one. Quitting is one-way
 * (the sweep's quit step runs once per process), so this is never cleared.
 */
let quitting = false

/**
 * Runs `path --version` and resolves with its output, or `null` when it fails, times out or says
 * too much. `onExit` runs once the run's process is gone, told whether the run failed.
 */
function runVersionProbe(path: string, onExit: (failed: boolean) => void): Promise<string | null> {
  const { promise, resolve } = Promise.withResolvers<string | null>()
  let child: ChildProcess
  try {
    // Run by the path as found, with its own directory on PATH: a `#!/usr/bin/env node` CLI
    // finds the `node` beside it, which a GUI launch's PATH does not have.
    child = spawnSafe(path, ['--version'], {
      env: { ...withExecutableDirOnPath(process.env, path), ...PROBE_ENV },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
  } catch {
    resolve(null)
    queueMicrotask(() => onExit(true))
    return promise
  }

  let output = ''
  /** `undefined` until the run has an outcome. */
  let answer: string | null | undefined
  let finished = false
  let killTimer: NodeJS.Timeout | undefined
  const settle = (value: string | null): void => {
    if (answer !== undefined) return
    answer = value
    resolve(value)
  }
  // SIGTERM first, so a CLI may clean up; one that ignores it is killed.
  const stop = (): void => {
    settle(null)
    if (killTimer) return
    child.kill('SIGTERM')
    killTimer = setTimeout(() => child.kill('SIGKILL'), PROBE_KILL_GRACE_MS)
    killTimer.unref()
  }
  const timeout = setTimeout(stop, PROBE_TIMEOUT_MS)
  timeout.unref()
  const finish = (): void => {
    if (finished) return
    finished = true
    clearTimeout(timeout)
    clearTimeout(killTimer)
    runningProbes.delete(child)
    onExit(answer === null)
  }

  runningProbes.add(child)
  const collect = (chunk: Buffer): void => {
    // Still read once there is an outcome, so the pipe drains, but no longer kept.
    if (answer !== undefined) return
    output += chunk.toString('utf8')
    if (output.length > PROBE_OUTPUT_LIMIT) stop()
  }
  child.stdout?.on('data', collect)
  child.stderr?.on('data', collect)
  child.once('error', () => {
    settle(null)
    // Never started (ENOENT, EACCES): no exit is coming.
    if (child.pid === undefined) finish()
  })
  child.once('close', (code) => {
    settle(code === 0 ? output.trim() : null)
    finish()
  })
  return promise
}

function readVersionOutput(path: string): Promise<string | null> {
  const pending = versionOutputs.get(path)
  if (pending) return pending
  // A run from before a refresh, still going: shared, so the path keeps one process, but not
  // kept as the answer, as it may describe the program from before the change.
  const live = liveProbes.get(path)
  if (live) return live
  if (quitting) return Promise.resolve(null)
  const probe: Promise<string | null> = runVersionProbe(path, (failed) => {
    // Only this probe's own entries: a refresh may have cleared the memo meanwhile.
    if (liveProbes.get(path) === probe) liveProbes.delete(path)
    if (failed && versionOutputs.get(path) === probe) versionOutputs.delete(path)
  })
  liveProbes.set(path, probe)
  versionOutputs.set(path, probe)
  return probe
}

/**
 * Kills every `--version` probe still running. The app calls it on quit, before anything that the
 * quit budget may cut off: an app that exits leaves its probes to launchd, and a hung one (a mise
 * shim stuck in uninterruptible wait, 2026-11-15) then never ends. With `quitting`, no probe
 * starts afterwards either.
 */
export function stopLocalAiCliVersionProbes(options: { quitting?: boolean } = {}): void {
  if (options.quitting) quitting = true
  for (const child of runningProbes) child.kill('SIGKILL')
}

/**
 * The CLI's version, or `undefined` when the program at `path` did not answer `--version` as this
 * CLI does — a timeout, a non-zero exit, or another program's output (`mise --version` among them).
 */
export async function probeCliVersion(
  providerId: LocalAiCliProviderId,
  path: string
): Promise<string | undefined> {
  const output = await readVersionOutput(path)
  if (!output) return undefined
  const match = output.match(getLocalAiCliProviderDefinition(providerId).versionPattern)
  return match ? (match.slice(1).find((group) => group !== undefined) ?? match[0]) : undefined
}

/**
 * The 「选择程序」 pick for the CLI behind `lookup`, read from the app settings. Installed as the
 * chat providers' settings-override reader (`setCliSettingsOverrideReader`), so both features see
 * the same pick.
 */
export function readLocalAiCliExecutableOverride(lookup: CliExecutableLookup): string | undefined {
  const providerId = LOCAL_AI_CLI_PROVIDERS.find((provider) =>
    matchesLookup(LOOKUPS[provider.id], lookup)
  )?.id
  if (!providerId) return undefined
  const settings = (getMainConfig(StorageList.APP_SETTING) as AppSetting | undefined)?.localAiCli
  return settings?.providers?.[providerId]?.executableOverride?.trim() || undefined
}

export async function resolveLocalAiCliProviderStatus(
  providerId: LocalAiCliProviderId,
  settings: AppSetting['localAiCli']
): Promise<LocalAiCliProviderStatus> {
  const definition = getLocalAiCliProviderDefinition(providerId)
  const lookup = LOOKUPS[providerId]
  const providerSettings = settings?.providers?.[providerId]
  const override = providerSettings?.executableOverride?.trim() || undefined
  const resolved = await resolveCliExecutable(lookup, { settingsOverride: override })
  const version = resolved ? await probeCliVersion(providerId, resolved.path) : undefined
  const installed = Boolean(resolved && version)
  // A miss with a pick in place means the pick was tried and refused: an executable one would have
  // been the answer. `TUFF_<CLI>_CLI_PATH` decides before the pick is read, so it is not refused.
  const settingsOverrideRejected = resolved
    ? resolved.settingsOverrideRejected === true
    : Boolean(override) && !process.env[lookup.envOverride]?.trim()

  return {
    id: providerId,
    label: definition.label,
    enabled: providerSettings?.enabled === true,
    installed,
    ...(resolved && installed
      ? { executablePath: resolved.path, version }
      : { issueCode: 'PROVIDER_UNAVAILABLE' as const }),
    ...(settingsOverrideRejected ? { settingsOverrideRejected: true } : {}),
    capabilities: {
      ...definition.capabilities,
      taskRead: definition.capabilities.taskRead && installed,
      terminalRead: definition.capabilities.terminalRead && installed
    }
  }
}

export async function resolveAllLocalAiCliProviderStatuses(
  settings: AppSetting['localAiCli']
): Promise<LocalAiCliProviderStatus[]> {
  return await Promise.all(
    LOCAL_AI_CLI_PROVIDERS.map((provider) => resolveLocalAiCliProviderStatus(provider.id, settings))
  )
}

/**
 * Looks every registered CLI up again under the picks in `settings` and forgets every `--version`
 * answer, so an install, a removal, an update or a new pick shows without a restart. The lookups
 * are the chat providers' memo too, which config assembly reads synchronously on every invoke: the
 * new answers replace the old in one step once all are in, and no read in between finds a CLI
 * unprobed and drops its chat row. Nothing is run here; the next read that needs a version asks.
 */
export async function refreshLocalAiCliExecutables(
  settings: AppSetting['localAiCli']
): Promise<void> {
  await refreshCliExecutables(
    LOCAL_AI_CLI_PROVIDERS.map((provider) => ({
      lookup: LOOKUPS[provider.id],
      settingsOverride: settings?.providers?.[provider.id]?.executableOverride
    }))
  )
  // After the swap, not before: until then reads answer from the old lookups and what those said.
  versionOutputs.clear()
}
