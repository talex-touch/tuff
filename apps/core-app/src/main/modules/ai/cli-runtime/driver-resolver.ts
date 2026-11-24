import type {
  CliDriverDescriptor,
  CliDriverResolution,
  CliPermissionRiskKind,
  CliRuntimeKind,
  CliRuntimeProtocol,
  CliWorktreeRequestOptions
} from './types'
import {
  ANTIGRAVITY_CLI_PROFILE_ID,
  ANTIGRAVITY_CLI_PROVIDER_ID,
  CLAUDE_CLI_PROFILE_ID,
  CLAUDE_CLI_PROVIDER_ID,
  CODEX_CLI_PROFILE_ID,
  CODEX_CLI_PROVIDER_ID,
  CURSOR_CLI_PROFILE_ID,
  CURSOR_CLI_PROVIDER_ID,
  GEMINI_CLI_PROFILE_ID,
  GEMINI_CLI_PROVIDER_ID,
  KIRO_CLI_PROFILE_ID,
  KIRO_CLI_PROVIDER_ID,
  OMP_CLI_PROFILE_ID,
  OMP_CLI_PROVIDER_ID,
  OPENCODE_CLI_PROFILE_ID,
  OPENCODE_CLI_PROVIDER_ID,
  resolveAntigravityExecutable,
  resolveClaudeAcpExecutable,
  resolveClaudeExecutable,
  resolveCodexAcpExecutable,
  resolveCodexExecutable,
  resolveCursorExecutable,
  resolveGeminiExecutable,
  resolveKiroExecutable,
  resolveOmpExecutable,
  resolveOpencodeExecutable
} from '../providers/pi-cli-runtime'

const ACP_SUBCOMMAND_ARGS: readonly string[] = Object.freeze(['acp'])
const ANTIGRAVITY_ACP_ARGS: readonly string[] = Object.freeze(['acp', '--process-per-session'])
const EMPTY_ARGS: readonly string[] = Object.freeze([])

/**
 * Gemini CLI accepts `--experimental-acp` across legacy and current releases (newer versions also
 * accept `--acp` while retaining `--experimental-acp` as a backwards-compatible alias). Users on a
 * build that requires different flags (e.g. `--acp`) can override via `TUFF_GEMINI_ACP_ARGS`.
 */
export const GEMINI_ACP_ARGS_ENV = 'TUFF_GEMINI_ACP_ARGS'
export const DEFAULT_GEMINI_ACP_ARGS: readonly string[] = Object.freeze(['--experimental-acp'])

export function resolveGeminiAcpArgs(
  env: Readonly<Record<string, string | undefined>> = process.env
): readonly string[] {
  const raw = env[GEMINI_ACP_ARGS_ENV]?.trim()
  if (!raw) return DEFAULT_GEMINI_ACP_ARGS
  const tokens = raw.split(/\s+/).filter(Boolean)
  return tokens.length > 0 ? tokens : DEFAULT_GEMINI_ACP_ARGS
}

/**
 * Single declarative driver registry for all external CLI schedulers.
 *
 * Each entry binds exactly one `profile:cli:<id>` scheduler profile to its own CLI binary
 * candidate list, spawn arguments, wire protocol, and runtime metadata. `resolveCliDriver`
 * resolves strictly within one entry's candidate list and never falls back across different CLIs.
 */
export const CLI_DRIVER_REGISTRY: Readonly<Record<CliRuntimeKind, CliDriverDescriptor>> =
  Object.freeze({
    omp: {
      kind: 'omp',
      displayName: 'OMP',
      profileId: OMP_CLI_PROFILE_ID,
      providerId: OMP_CLI_PROVIDER_ID,
      capabilityProvider: 'tuff-omp-runtime',
      notFoundCode: 'OMP_CLI_NOT_FOUND',
      notFoundMessage: 'OMP executable not found on this system',
      defaultModelByProtocol: { acp: 'omp-acp' },
      fallbackModelLabel: 'omp-acp',
      candidates: [
        {
          protocol: 'acp',
          resolveExecutable: resolveOmpExecutable,
          resolveArgs: () => ACP_SUBCOMMAND_ARGS,
          adapterName: 'omp'
        }
      ]
    },
    codex: {
      kind: 'codex',
      displayName: 'Codex',
      profileId: CODEX_CLI_PROFILE_ID,
      providerId: CODEX_CLI_PROVIDER_ID,
      capabilityProvider: 'tuff-codex-runtime',
      notFoundCode: 'CODEX_CLI_NOT_FOUND',
      notFoundMessage: 'Codex executable not found on this system',
      defaultModelByProtocol: {
        acp: 'codex-acp',
        'codex-app-server': 'codex-app-server'
      },
      fallbackModelLabel: 'codex-app-server',
      candidates: [
        {
          protocol: 'acp',
          resolveExecutable: resolveCodexAcpExecutable,
          resolveArgs: () => EMPTY_ARGS,
          adapterName: 'codex-acp'
        },
        {
          protocol: 'codex-app-server',
          resolveExecutable: resolveCodexExecutable,
          adapterName: 'codex'
        }
      ]
    },
    claude: {
      kind: 'claude',
      displayName: 'Claude',
      profileId: CLAUDE_CLI_PROFILE_ID,
      providerId: CLAUDE_CLI_PROVIDER_ID,
      capabilityProvider: 'tuff-claude-runtime',
      notFoundCode: 'CLAUDE_CLI_NOT_FOUND',
      notFoundMessage: 'Claude executable not found on this system',
      defaultModelByProtocol: {
        acp: 'claude-acp',
        'claude-stream-json': 'claude-stream-json'
      },
      fallbackModelLabel: 'claude-stream-json',
      candidates: [
        {
          protocol: 'acp',
          resolveExecutable: resolveClaudeAcpExecutable,
          resolveArgs: () => EMPTY_ARGS,
          adapterName: 'claude-acp'
        },
        {
          protocol: 'claude-stream-json',
          resolveExecutable: resolveClaudeExecutable,
          adapterName: 'claude'
        }
      ]
    },
    antigravity: {
      kind: 'antigravity',
      displayName: 'Antigravity',
      profileId: ANTIGRAVITY_CLI_PROFILE_ID,
      providerId: ANTIGRAVITY_CLI_PROVIDER_ID,
      capabilityProvider: 'tuff-antigravity-runtime',
      notFoundCode: 'ANTIGRAVITY_CLI_NOT_FOUND',
      notFoundMessage: 'Antigravity (agy) executable not found on this system',
      defaultModelByProtocol: { acp: 'antigravity-acp' },
      fallbackModelLabel: 'antigravity-acp',
      candidates: [
        {
          protocol: 'acp',
          resolveExecutable: resolveAntigravityExecutable,
          resolveArgs: () => ANTIGRAVITY_ACP_ARGS,
          adapterName: 'antigravity-acp'
        }
      ]
    },
    opencode: {
      kind: 'opencode',
      displayName: 'OpenCode',
      profileId: OPENCODE_CLI_PROFILE_ID,
      providerId: OPENCODE_CLI_PROVIDER_ID,
      capabilityProvider: 'tuff-opencode-runtime',
      notFoundCode: 'OPENCODE_CLI_NOT_FOUND',
      notFoundMessage: 'OpenCode executable not found on this system',
      defaultModelByProtocol: { acp: 'opencode-acp' },
      fallbackModelLabel: 'opencode-acp',
      candidates: [
        {
          protocol: 'acp',
          resolveExecutable: resolveOpencodeExecutable,
          resolveArgs: () => ACP_SUBCOMMAND_ARGS,
          adapterName: 'opencode-acp'
        }
      ]
    },
    gemini: {
      kind: 'gemini',
      displayName: 'Gemini CLI',
      profileId: GEMINI_CLI_PROFILE_ID,
      providerId: GEMINI_CLI_PROVIDER_ID,
      capabilityProvider: 'tuff-gemini-runtime',
      notFoundCode: 'GEMINI_CLI_NOT_FOUND',
      notFoundMessage: 'Gemini CLI executable not found on this system',
      defaultModelByProtocol: { acp: 'gemini-acp' },
      fallbackModelLabel: 'gemini-acp',
      candidates: [
        {
          protocol: 'acp',
          resolveExecutable: resolveGeminiExecutable,
          resolveArgs: () => resolveGeminiAcpArgs(),
          adapterName: 'gemini-acp'
        }
      ]
    },
    kiro: {
      kind: 'kiro',
      displayName: 'Kiro',
      profileId: KIRO_CLI_PROFILE_ID,
      providerId: KIRO_CLI_PROVIDER_ID,
      capabilityProvider: 'tuff-kiro-runtime',
      notFoundCode: 'KIRO_CLI_NOT_FOUND',
      notFoundMessage: 'Kiro CLI executable not found on this system',
      defaultModelByProtocol: { acp: 'kiro-acp' },
      fallbackModelLabel: 'kiro-acp',
      candidates: [
        {
          protocol: 'acp',
          resolveExecutable: resolveKiroExecutable,
          resolveArgs: () => ACP_SUBCOMMAND_ARGS,
          adapterName: 'kiro-acp'
        }
      ]
    },
    cursor: {
      kind: 'cursor',
      displayName: 'Cursor',
      profileId: CURSOR_CLI_PROFILE_ID,
      providerId: CURSOR_CLI_PROVIDER_ID,
      capabilityProvider: 'tuff-cursor-runtime',
      notFoundCode: 'CURSOR_CLI_NOT_FOUND',
      notFoundMessage: 'Cursor Agent executable not found on this system',
      defaultModelByProtocol: { acp: 'cursor-acp' },
      fallbackModelLabel: 'cursor-acp',
      candidates: [
        {
          protocol: 'acp',
          resolveExecutable: resolveCursorExecutable,
          resolveArgs: () => ACP_SUBCOMMAND_ARGS,
          adapterName: 'cursor-acp'
        }
      ]
    }
  })

const CLI_PROFILE_KIND_MAP: ReadonlyMap<string, CliRuntimeKind> = new Map(
  Object.values(CLI_DRIVER_REGISTRY).map((descriptor) => [descriptor.profileId, descriptor.kind])
)

/**
 * The scheduler decides the executor (`AGENTS.md`):
 * ONLY registered `profile:cli:<id>` external CLI profiles resolve to a `CliRuntimeKind`.
 * `default-pi`, unnamed runs, custom profiles, and every other profile return `null` so they stay
 * on `PiAgentRuntimeHost` (reusing CLI endpoints via `cli-config-provider.ts` when available).
 */
export function resolveCliProfileKind(profileId: string | undefined): CliRuntimeKind | null {
  if (!profileId) return null
  return CLI_PROFILE_KIND_MAP.get(profileId) ?? null
}

/**
 * Resolves the concrete driver binary, spawn arguments, and wire protocol for one external CLI
 * scheduler kind. Never falls back across different CLIs (e.g. a missing Gemini or Codex binary
 * never spawns another CLI).
 */
export async function resolveCliDriver(kind: CliRuntimeKind): Promise<CliDriverResolution> {
  const descriptor = CLI_DRIVER_REGISTRY[kind]
  for (const candidate of descriptor.candidates) {
    const executablePath = await candidate.resolveExecutable()
    if (!executablePath) continue
    return {
      kind,
      protocol: candidate.protocol,
      executablePath,
      ...(candidate.resolveArgs ? { args: [...candidate.resolveArgs()] } : {}),
      adapterName: candidate.adapterName
    }
  }
  throw new Error(`${descriptor.notFoundCode}: ${descriptor.notFoundMessage}`)
}

export function cliProviderIdForKind(kind: CliRuntimeKind): string {
  return CLI_DRIVER_REGISTRY[kind].providerId
}

export function cliCapabilityProviderForKind(kind: CliRuntimeKind): string {
  return CLI_DRIVER_REGISTRY[kind].capabilityProvider
}

export function cliDisplayNameForKind(kind: CliRuntimeKind): string {
  return CLI_DRIVER_REGISTRY[kind].displayName
}

export function cliDefaultModelLabel(kind: CliRuntimeKind, protocol?: CliRuntimeProtocol): string {
  const descriptor = CLI_DRIVER_REGISTRY[kind]
  return (
    (protocol ? descriptor.defaultModelByProtocol[protocol] : undefined) ??
    descriptor.fallbackModelLabel
  )
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
