import type {
  AcpMcpServerConfig,
  AcpPermissionOption,
  AcpPermissionRequestParams,
  AcpPermissionRequestResult,
  AcpPromptContent,
  CliPermissionDecision,
  CliPermissionRequest,
  CliPermissionRiskKind,
  CliRuntimeClient,
  CliRuntimeKind,
  CliRuntimeProtocol,
  CliRuntimeSession,
  CliRuntimeStreamEvent
} from '@talex-touch/tuff-intelligence'
import type { PiWorkspaceAuthority } from '../pi-agent-runtime-host'
import type {
  PiRuntimeRunEvent,
  PiRuntimeRunRecord,
  PiRuntimeStartPayload
} from '../pi-agent-runtime-protocol'
import type {
  GitWorktreeManager,
  ReleaseWorktreeOptions,
  ReleaseWorktreeResult,
  WorktreeDiffResult,
  WorktreeLease
} from '../worktree'

export type {
  AcpMcpServerConfig,
  AcpPermissionOption,
  AcpPermissionRequestParams,
  AcpPermissionRequestResult,
  AcpPromptContent,
  CliPermissionDecision,
  CliPermissionRequest,
  CliPermissionRiskKind,
  CliRuntimeClient,
  CliRuntimeKind,
  CliRuntimeProtocol,
  CliRuntimeSession,
  CliRuntimeStreamEvent,
  ReleaseWorktreeOptions,
  ReleaseWorktreeResult,
  WorktreeDiffResult,
  WorktreeLease
}

export interface CliDriverResolution {
  readonly kind: CliRuntimeKind
  readonly protocol: CliRuntimeProtocol
  readonly executablePath: string
  readonly args?: readonly string[]
  readonly adapterName: string
}

export interface CliDriverCandidateSpec {
  readonly protocol: CliRuntimeProtocol
  readonly resolveExecutable: () => Promise<string | null>
  readonly resolveArgs?: () => readonly string[]
  readonly adapterName: string
}

export interface CliDriverDescriptor {
  readonly kind: CliRuntimeKind
  readonly displayName: string
  readonly profileId: string
  readonly providerId: string
  readonly capabilityProvider: string
  readonly notFoundCode: string
  readonly notFoundMessage: string
  readonly defaultModelByProtocol: Readonly<Partial<Record<CliRuntimeProtocol, string>>>
  readonly fallbackModelLabel: string
  readonly candidates: readonly CliDriverCandidateSpec[]
}

export interface CliWorktreeRequestOptions {
  enabled?: boolean
  baseRef?: string
  branchPrefix?: string
  detached?: boolean
  cleanupOnComplete?: boolean
  forceCleanup?: boolean
}

/**
 * Host-internal execution options owned by Main (`AiCliOrchestrator`).
 * Never parsed from untrusted renderer/plugin `request.metadata`.
 */
export interface CliExecuteRuntimeOptions {
  reattachWorktreeId?: string
  resumedFromInterruption?: boolean
}

export interface CliPermissionRequestContext {
  runId: string
  kind: CliRuntimeKind
  protocol: CliRuntimeProtocol
  payload: PiRuntimeStartPayload
  workspace?: PiWorkspaceAuthority
  signal: AbortSignal
}

export interface CliAgentRuntimeHostOptions {
  onEvent?: (event: PiRuntimeRunEvent) => void | Promise<void>
  onRecord?: (runId: string, record: PiRuntimeRunRecord) => void | Promise<void>
  onWorktreeBound?: (runId: string, lease: WorktreeLease) => void | Promise<void>
  resolveMcpServers?: (
    payload: PiRuntimeStartPayload,
    workspace?: PiWorkspaceAuthority
  ) => AcpMcpServerConfig[] | Promise<AcpMcpServerConfig[]>
  onPermissionRequest?: (
    request: CliPermissionRequest,
    context: CliPermissionRequestContext
  ) => CliPermissionDecision | Promise<CliPermissionDecision>
  sanitizeToolOutput?: (value: unknown) => unknown
  worktreeManager?: GitWorktreeManager
  resolveDriver?: (kind: CliRuntimeKind) => Promise<CliDriverResolution>
}
