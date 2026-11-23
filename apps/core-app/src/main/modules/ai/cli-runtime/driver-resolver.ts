import type {
  CliDriverResolution,
  CliPermissionRiskKind,
  CliRuntimeKind,
  CliRuntimeProtocol,
  CliWorktreeRequestOptions
} from './types'
import {
  CLAUDE_CLI_PROFILE_ID,
  CLAUDE_CLI_PROVIDER_ID,
  CODEX_CLI_PROFILE_ID,
  CODEX_CLI_PROVIDER_ID,
  OMP_CLI_PROFILE_ID,
  OMP_CLI_PROVIDER_ID,
  resolveClaudeAcpExecutable,
  resolveClaudeExecutable,
  resolveCodexAcpExecutable,
  resolveCodexExecutable,
  resolveOmpExecutable
} from '../providers/pi-cli-runtime'

/**
 * The scheduler decides the executor (`AGENTS.md`):
 * ONLY `profile:cli:omp`, `profile:cli:codex`, and `profile:cli:claude` resolve to an external
 * CLI runtime kind. `default-pi`, unnamed runs, custom profiles, and every other profile return
 * `null` so they stay on `PiAgentRuntimeHost` (reusing CLI endpoints via `cli-config-provider.ts`).
 */
export function resolveCliProfileKind(profileId: string | undefined): CliRuntimeKind | null {
  if (profileId === OMP_CLI_PROFILE_ID) return 'omp'
  if (profileId === CODEX_CLI_PROFILE_ID) return 'codex'
  if (profileId === CLAUDE_CLI_PROFILE_ID) return 'claude'
  return null
}

/**
 * Resolves the concrete driver binary and wire protocol for one external CLI scheduler kind.
 * Never falls back across different CLIs (e.g. a missing Codex binary never spawns Claude or OMP).
 */
export async function resolveCliDriver(kind: CliRuntimeKind): Promise<CliDriverResolution> {
  if (kind === 'omp') {
    const ompExe = await resolveOmpExecutable()
    if (!ompExe) {
      throw new Error('OMP_CLI_NOT_FOUND: OMP executable not found on this system')
    }
    return {
      kind: 'omp',
      protocol: 'acp',
      executablePath: ompExe,
      adapterName: 'omp'
    }
  }

  if (kind === 'codex') {
    const codexAcpExe = await resolveCodexAcpExecutable()
    if (codexAcpExe) {
      return {
        kind: 'codex',
        protocol: 'acp',
        executablePath: codexAcpExe,
        adapterName: 'codex-acp'
      }
    }
    const codexExe = await resolveCodexExecutable()
    if (!codexExe) {
      throw new Error('CODEX_CLI_NOT_FOUND: Codex executable not found on this system')
    }
    return {
      kind: 'codex',
      protocol: 'codex-app-server',
      executablePath: codexExe,
      adapterName: 'codex'
    }
  }

  const claudeAcpExe = await resolveClaudeAcpExecutable()
  if (claudeAcpExe) {
    return {
      kind: 'claude',
      protocol: 'acp',
      executablePath: claudeAcpExe,
      adapterName: 'claude-acp'
    }
  }
  const claudeExe = await resolveClaudeExecutable()
  if (!claudeExe) {
    throw new Error('CLAUDE_CLI_NOT_FOUND: Claude executable not found on this system')
  }
  return {
    kind: 'claude',
    protocol: 'claude-stream-json',
    executablePath: claudeExe,
    adapterName: 'claude'
  }
}

export function cliProviderIdForKind(kind: CliRuntimeKind): string {
  if (kind === 'omp') return OMP_CLI_PROVIDER_ID
  if (kind === 'codex') return CODEX_CLI_PROVIDER_ID
  return CLAUDE_CLI_PROVIDER_ID
}

export function cliCapabilityProviderForKind(kind: CliRuntimeKind): string {
  if (kind === 'omp') return 'tuff-omp-runtime'
  if (kind === 'codex') return 'tuff-codex-runtime'
  return 'tuff-claude-runtime'
}

export function cliDefaultModelLabel(kind: CliRuntimeKind, protocol?: CliRuntimeProtocol): string {
  if (kind === 'omp') return 'omp-acp'
  if (kind === 'codex') return protocol === 'acp' ? 'codex-acp' : 'codex-app-server'
  return protocol === 'acp' ? 'claude-acp' : 'claude-stream-json'
}

export function resolveCliPermissionRisk(
  kind: unknown,
  riskHint?: CliPermissionRiskKind,
  toolName?: string
): CliPermissionRiskKind {
  if (riskHint === 'read' || riskHint === 'write' || riskHint === 'execute') {
    return riskHint
  }
  if (kind === 'read' || kind === 'search' || kind === 'fetch') return 'read'
  if (kind === 'edit' || kind === 'write' || kind === 'delete' || kind === 'move') return 'write'

  const normalized = typeof toolName === 'string' ? toolName.trim().toLowerCase() : ''
  if (
    normalized === 'read' ||
    normalized === 'glob' ||
    normalized === 'grep' ||
    normalized === 'ls' ||
    normalized === 'webfetch' ||
    normalized === 'websearch'
  ) {
    return 'read'
  }
  if (
    normalized === 'edit' ||
    normalized === 'write' ||
    normalized === 'multiedit' ||
    normalized === 'notebookedit'
  ) {
    return 'write'
  }
  return 'execute'
}

/**
 * Worktree isolation is strictly opt-in via `request.metadata?.worktree`.
 * Only allowlisted fields are accepted; anything else returns `null` (no worktree created).
 */
export function parseWorktreeRequestOptions(raw: unknown): CliWorktreeRequestOptions | null {
  if (raw === true) {
    return { enabled: true }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const record = raw as Record<string, unknown>
  if (record.enabled === false) {
    return null
  }
  const options: CliWorktreeRequestOptions = { enabled: true }
  if (typeof record.baseRef === 'string' && record.baseRef.trim()) {
    options.baseRef = record.baseRef.trim()
  }
  if (typeof record.branchPrefix === 'string' && record.branchPrefix.trim()) {
    options.branchPrefix = record.branchPrefix.trim()
  }
  if (typeof record.detached === 'boolean') {
    options.detached = record.detached
  }
  if (typeof record.cleanupOnComplete === 'boolean') {
    options.cleanupOnComplete = record.cleanupOnComplete
  }
  if (typeof record.forceCleanup === 'boolean') {
    options.forceCleanup = record.forceCleanup
  }
  return options
}
