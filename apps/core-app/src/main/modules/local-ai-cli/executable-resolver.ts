import type {
  LocalAiCliProviderId,
  LocalAiCliProviderStatus
} from '@talex-touch/utils/transport/events/local-ai-cli'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { CliExecutableLookup } from '../ai/providers/cli/cli-executable'
import { StorageList } from '@talex-touch/utils/common/storage/constants'
import { execFileSafe } from '@talex-touch/utils/common/utils/safe-shell'
import {
  refreshCliExecutables,
  resolveCliExecutable,
  withExecutableDirOnPath
} from '../ai/providers/cli/cli-executable'
import {
  CLAUDE_CLI_LOOKUP,
  CODEX_CLI_LOOKUP,
  OMP_CLI_LOOKUP,
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

/** One lookup per CLI, shared with the chat providers. */
const LOOKUPS: Readonly<Record<LocalAiCliProviderId, CliExecutableLookup>> = {
  pi: PI_CLI_LOOKUP,
  'oh-my-pi': OMP_CLI_LOOKUP,
  codex: CODEX_CLI_LOOKUP,
  claude: CLAUDE_CLI_LOOKUP
}

/**
 * `--version` output by the path that was run. Kept as the pending promise, so reads that arrive
 * while a probe runs share it rather than starting another. The output, not the version, is what
 * is kept: which CLI's pattern it is read with depends on who asks, and the user can point two
 * providers at one file.
 *
 * Only an answer is kept. A run that failed or timed out (`null`) is dropped once it settles, so
 * the next read asks again: a CLI caught mid-update or slow to start is not written off for the
 * rest of the session.
 */
const versionOutputs = new Map<string, Promise<string | null>>()

function readVersionOutput(path: string): Promise<string | null> {
  let pending = versionOutputs.get(path)
  if (!pending) {
    // Run by the path as found, with its own directory on PATH: a `#!/usr/bin/env node` CLI finds
    // the `node` beside it, which a GUI launch's PATH does not have.
    const probe: Promise<string | null> = execFileSafe(path, ['--version'], {
      timeout: PROBE_TIMEOUT_MS,
      maxBuffer: 16_384,
      env: withExecutableDirOnPath(process.env, path)
    })
      .then(({ stdout, stderr }) => `${stdout}\n${stderr}`.trim())
      .catch(() => {
        // Only this probe's own entry: a refresh may have started another for the path meanwhile.
        if (versionOutputs.get(path) === probe) versionOutputs.delete(path)
        return null
      })
    pending = probe
    versionOutputs.set(path, pending)
  }
  return pending
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
  return match ? (match[1] ?? match[0]) : undefined
}

/**
 * The 「选择程序」 pick for the CLI behind `lookup`, read from the app settings. Installed as the
 * chat providers' settings-override reader (`setCliSettingsOverrideReader`), so both features see
 * the same pick.
 */
export function readLocalAiCliExecutableOverride(lookup: CliExecutableLookup): string | undefined {
  const providerId = LOCAL_AI_CLI_PROVIDERS.find(
    (provider) => LOOKUPS[provider.id].command === lookup.command
  )?.id
  if (!providerId) return undefined
  const settings = (getMainConfig(StorageList.APP_SETTING) as AppSetting).localAiCli
  return settings?.providers?.[providerId]?.executableOverride?.trim() || undefined
}

export async function resolveLocalAiCliProviderStatus(
  providerId: LocalAiCliProviderId,
  settings: AppSetting['localAiCli']
): Promise<LocalAiCliProviderStatus> {
  const definition = getLocalAiCliProviderDefinition(providerId)
  const lookup = LOOKUPS[providerId]
  const providerSettings = settings.providers[providerId]
  const override = providerSettings.executableOverride?.trim() || undefined
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
    enabled: providerSettings.enabled,
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
 * Looks the four CLIs up again under the picks in `settings` and forgets every `--version` answer,
 * so an install, a removal, an update or a new pick shows without a restart. The lookups are the
 * chat providers' memo too, which config assembly reads synchronously on every invoke: the new
 * answers replace the old in one step once all four are in, and no read in between finds a CLI
 * unprobed and drops its chat row. Nothing is run here; the next read that needs a version asks.
 */
export async function refreshLocalAiCliExecutables(
  settings: AppSetting['localAiCli']
): Promise<void> {
  await refreshCliExecutables(
    LOCAL_AI_CLI_PROVIDERS.map((provider) => ({
      lookup: LOOKUPS[provider.id],
      settingsOverride: settings.providers[provider.id]?.executableOverride
    }))
  )
  // After the swap, not before: until then reads answer from the old lookups and what those said.
  versionOutputs.clear()
}
