import type {
  LocalAiCliProviderId,
  LocalAiCliProviderStatus
} from '@talex-touch/utils/transport/events/local-ai-cli'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import { execFileSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { constants } from 'node:fs'
import { access, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { getLocalAiCliProviderDefinition, LOCAL_AI_CLI_PROVIDERS } from './provider-registry'

const PROBE_TIMEOUT_MS = 5_000
const LOGIN_SHELL_TIMEOUT_MS = 3_000

function pathEntries(): string[] {
  const home = homedir()
  return [
    ...(process.env.PATH ?? '').split(delimiter),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    join(home, '.local', 'bin'),
    join(home, '.bun', 'bin'),
    join(home, '.local', 'share', 'mise', 'shims')
  ].filter(Boolean)
}

async function validateExecutable(candidate: string): Promise<string | undefined> {
  try {
    const canonical = await realpath(candidate)
    const file = await stat(canonical)
    if (!file.isFile()) return undefined
    await access(canonical, constants.X_OK)
    return canonical
  } catch {
    return undefined
  }
}

async function resolveFromKnownPaths(command: string): Promise<string | undefined> {
  for (const entry of [...new Set(pathEntries())]) {
    const executable = await validateExecutable(join(entry, command))
    if (executable) return executable
  }
  return undefined
}

async function resolveFromLoginShell(command: string): Promise<string | undefined> {
  if (process.platform !== 'darwin') return undefined
  const shell = process.env.SHELL === '/bin/bash' ? '/bin/bash' : '/bin/zsh'
  try {
    const { stdout } = await execFileSafe(shell, ['-lc', `command -v ${command}`], {
      timeout: LOGIN_SHELL_TIMEOUT_MS,
      maxBuffer: 4_096
    })
    const candidate = stdout.trim().split(/\r?\n/).at(-1)
    return candidate ? await validateExecutable(candidate) : undefined
  } catch {
    return undefined
  }
}

async function probeVersion(
  providerId: LocalAiCliProviderId,
  executablePath: string
): Promise<string | undefined> {
  const definition = getLocalAiCliProviderDefinition(providerId)
  try {
    const { stdout, stderr } = await execFileSafe(executablePath, ['--version'], {
      timeout: PROBE_TIMEOUT_MS,
      maxBuffer: 16_384
    })
    const output = `${stdout}\n${stderr}`.trim()
    const match = output.match(definition.versionPattern)
    return match?.[0]
  } catch {
    return undefined
  }
}

export async function resolveLocalAiCliProviderStatus(
  providerId: LocalAiCliProviderId,
  settings: AppSetting['localAiCli']
): Promise<LocalAiCliProviderStatus> {
  const definition = getLocalAiCliProviderDefinition(providerId)
  const providerSettings = settings.providers[providerId]
  const override = providerSettings.executableOverride
    ? await validateExecutable(providerSettings.executableOverride)
    : undefined
  const executablePath =
    override ??
    (await resolveFromKnownPaths(definition.command)) ??
    (await resolveFromLoginShell(definition.command))
  const version = executablePath ? await probeVersion(providerId, executablePath) : undefined
  const installed = Boolean(executablePath && version)

  return {
    id: providerId,
    label: definition.label,
    enabled: providerSettings.enabled,
    installed,
    ...(installed ? { executablePath, version } : { issueCode: 'PROVIDER_UNAVAILABLE' as const }),
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
