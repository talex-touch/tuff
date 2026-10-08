export type AiCliProviderId =
  | "codex"
  | "claude"
  | "pi"
  | "oh-my-pi"
  | "opencode";

/**
 * Where a stored item came from. Scans can only produce CLI providers, so the
 * scan-side types stay on {@link AiCliProviderId}; only a persisted item can be
 * `manual`, which is what the user typing a server into settings produces.
 */
export type AiImportOriginId = AiCliProviderId | "manual";

/**
 * Agents whose skills and MCP servers Tuff reads in place. cc-switch's library and the shared
 * `~/.agents` layer hold skills for several agents, but they are storage rather than agents, so they
 * are not on this list.
 */
export const KNOWN_AI_AGENT_IDS = [
  "codex",
  "claude",
  "pi",
  "oh-my-pi",
  "opencode",
  "cursor",
  "gemini",
  "kiro",
  "qoder",
  "codebuddy",
  "factory",
  "reasonix",
  "kilocode",
  "devin",
] as const;

export type KnownAiAgentId = (typeof KNOWN_AI_AGENT_IDS)[number];

/**
 * An agent id. Open-ended on purpose: the directory table grows with the tools people install, and a
 * resource that belongs to an agent this build has no brand for still names its owner instead of
 * vanishing from the list.
 */
export type AiAgentId = KnownAiAgentId | (string & {});

/**
 * Brand names. A product's name reads the same in every locale, which is why main may hand these out
 * while every other display string stays the renderer's.
 */
const AI_AGENT_LABELS: Readonly<Record<KnownAiAgentId, string>> = {
  codex: "Codex",
  claude: "Claude Code",
  pi: "Pi",
  "oh-my-pi": "Oh My Pi",
  opencode: "OpenCode",
  cursor: "Cursor",
  gemini: "Gemini CLI",
  kiro: "Kiro",
  qoder: "Qoder",
  codebuddy: "CodeBuddy",
  factory: "Factory",
  reasonix: "Reasonix",
  kilocode: "Kilo Code",
  devin: "Devin",
};

export function isKnownAiAgentId(value: string): value is KnownAiAgentId {
  return Object.prototype.hasOwnProperty.call(AI_AGENT_LABELS, value);
}

/** The agent's brand name, or its id when this build has none. */
export function aiAgentLabel(agentId: AiAgentId): string {
  return isKnownAiAgentId(agentId) ? AI_AGENT_LABELS[agentId] : agentId;
}

/**
 * One agent an inventory found on this machine, and how much of each resource it holds.
 *
 * An inventory lists only the agents holding at least one of the resource it counted, and fills only
 * that count. The other one is `null` — "not counted by this response" — rather than a zero nobody
 * measured.
 */
export interface AgentPresence {
  agentId: AiAgentId;
  label: string;
  /** Skills the agent's own directory holds. */
  skillCount: number | null;
  /** MCP servers the agent's own configuration declares. */
  mcpServerCount: number | null;
}

export type AiRuntimeProviderId = "pi-core";

export type AiImportItemKind =
  | "skill"
  | "mcp"
  | "agent"
  | "command"
  | "rule"
  | "instruction"
  | "config";

export type AiImportScope = "user" | "project";

export type AiImportTargetScope = "global" | "workspace";

export type AiImportCandidateState =
  | "added"
  | "changed"
  | "unchanged"
  | "source-missing"
  | "invalid";

export interface AiImportSecretDescriptor {
  keyPath: string;
  fingerprint?: string;
  authRef?: string;
  reauthRequired?: boolean;
}

export interface AiImportedConfigItem {
  id: string;
  candidateId: string;
  sourceId: string;
  provider: AiImportOriginId;
  sourceScope: AiImportScope;
  targetScope: AiImportTargetScope;
  workspaceRoot?: string;
  kind: AiImportItemKind;
  name: string;
  alias?: string;
  sourceKey: string;
  contentRef?: string;
  normalizedProjection?: Record<string, unknown>;
  secrets: AiImportSecretDescriptor[];
  state:
    | Exclude<AiImportCandidateState, "added" | "changed" | "unchanged">
    | "active";
  revisionId: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AiImportSourceSnapshot {
  id: string;
  provider: AiCliProviderId;
  label: string;
  scope: AiImportScope;
  rootPath: string;
  executablePath?: string;
  installed: boolean;
  scannedAt: number;
  fingerprint: string;
  warnings: string[];
}

export interface AiImportCandidateBase {
  id: string;
  sourceId: string;
  provider: AiCliProviderId;
  scope: AiImportScope;
  targetScope: AiImportTargetScope;
  canonicalRootId: string;
  sourceKey: string;
  kind: AiImportItemKind;
  name: string;
  path: string;
  /**
   * The directory discovery held the file to, when that was not its source's root: an MCP file an
   * agent keeps beside its configuration directory (`~/.claude.json` next to `~/.claude`) is held to
   * its own directory. Canonical; absent means the source root. Applying the candidate re-reads the
   * file within the same directory.
   */
  containedBy?: string;
  fingerprint: string;
  state: AiImportCandidateState;
  updatedAt?: number;
  warnings: string[];
  ignoredFields: string[];
  blockingIssues: string[];
}

export interface AiSkillImportCandidate extends AiImportCandidateBase {
  kind: "skill";
  description: string;
  manifestPath: string;
}

export interface AiMcpImportCandidate extends AiImportCandidateBase {
  kind: "mcp";
  serverNames: string[];
  transportTypes: string[];
  secretKeyPaths: string[];
}

export interface AiAgentImportCandidate extends AiImportCandidateBase {
  kind: "agent";
  description: string;
  mode?: string;
}

export interface AiCommandImportCandidate extends AiImportCandidateBase {
  kind: "command";
  description: string;
}

export interface AiRuleImportCandidate extends AiImportCandidateBase {
  kind: "rule" | "instruction";
  description: string;
  globs: string[];
  alwaysApply: boolean;
}

export interface AiConfigImportCandidate extends AiImportCandidateBase {
  kind: "config";
  keyPaths: string[];
  sensitiveKeyPaths: string[];
}

export type AiImportCandidate =
  | AiSkillImportCandidate
  | AiMcpImportCandidate
  | AiAgentImportCandidate
  | AiCommandImportCandidate
  | AiRuleImportCandidate
  | AiConfigImportCandidate;

export interface AiImportScanResult {
  scanId: string;
  scannedAt: number;
  cwd: string;
  sources: AiImportSourceSnapshot[];
  candidates: AiImportCandidate[];
}

export interface AiImportPreviewRequest {
  cwd?: string;
  providerIds?: AiCliProviderId[];
}

/**
 * Which servers of one MCP candidate to import. Everything else the file declares stays behind: no
 * profile, no migrated secret, and no copy of its definition in the stored snapshot.
 */
export interface AiImportMcpServerSelection {
  /** Server names as the file keys them under its MCP root (`mcpServers.<name>`). */
  include: string[];
  /**
   * Members of `include` that land switched off — imported and kept, not run. Servers Tuff already
   * holds from the file keep their own switches without being named here.
   */
  disabled?: string[];
}

export interface AiImportApplyRequest {
  scanId: string;
  candidateIds: string[];
  /**
   * Consent to move credentials into the secure store. Only a value the store does not already hold
   * under its reference needs it: applying servers whose credentials an earlier import moved asks
   * nothing.
   */
  confirmSecretMigration?: boolean;
  overrides?: Record<
    string,
    { targetScope?: AiImportTargetScope; alias?: string }
  >;
  /**
   * Per MCP candidate id, the servers to import. A selected MCP candidate without an entry imports
   * every server it declares, as before. An entry for a candidate outside `candidateIds`, for a
   * candidate that is not MCP, or naming a server the scan did not find in the file rejects the
   * import, as does one naming a server that needs re-authentication (OAuth, a credential on the
   * command line, a reference to a value kept elsewhere: it could not run, and it would stop the
   * file's other servers).
   *
   * The selection adds to what Tuff already holds from that file, never replaces it: servers
   * imported earlier stay, with their credentials and their switches — one that is not running now
   * lands switched off — and the stored item is switched on so the selected servers run. A held
   * server that needs re-authentication, or that the file no longer declares, is left out. An item
   * marked invalid can be taken this way, leaving out the servers that made it so.
   */
  mcpServers?: Record<string, AiImportMcpServerSelection>;
}

export interface AiImportApplyItemResult {
  candidateId: string;
  status: "imported" | "unchanged" | "failed" | "reauth-required";
  itemId?: string;
  error?: string;
}

export interface AiImportApplyResult {
  revisionId: string;
  imported: number;
  unchanged: number;
  removed: number;
  items: AiImportApplyItemResult[];
}

export interface AiImportedItemSetActiveRequest {
  itemId: string;
  active: boolean;
}

export interface AiImportedItemCloneRequest {
  itemId: string;
  alias?: string;
}

export interface AiImportedItemDeleteRequest {
  itemId: string;
}

export type AiAgentApprovalMode = "manual" | "preauthorized";

export interface AiAgentPermissionPolicy {
  mode: AiAgentApprovalMode;
  allowedPermissions: string[];
}

export interface AiExecutionBudget {
  maxSteps: number;
  maxToolCalls?: number;
  maxCost?: number;
  maxChildRuns: number;
  maxConcurrency: number;
}

export interface AiDelegationNode {
  nodeId: string;
  profileId: string;
  objective: string;
  dependsOn: string[];
  requestedTools: string[];
  requestedMcpServers: string[];
  budget: AiExecutionBudget;
}

export interface AiDelegationPlan {
  planId: string;
  parentRunId: string;
  nodes: AiDelegationNode[];
  maxConcurrency: number;
  status:
    | "pending_approval"
    | "approved"
    | "executing"
    | "completed"
    | "rejected"
    | "failed";
  createdAt: number;
  approvedAt?: number;
}

export interface AiAutomationPolicy {
  version: number;
  allowedToolIds: string[];
  allowedMcpServerIds: string[];
  allowedAgentProfileIds: string[];
  allowedPaths: string[];
  allowedNetworkTargets: string[];
  budget: AiExecutionBudget;
  timeoutMs: number;
  maxRunsPerWindow: number;
  windowMs: number;
}

export interface AiAgentProfile {
  id: string;
  name: string;
  description: string;
  runtimeProvider: AiRuntimeProviderId;
  enabled: boolean;
  systemPrompt?: string;
  modelPreference: string[];
  allowedToolIds: string[];
  enabledSkillIds: string[];
  permissionPolicy: AiAgentPermissionPolicy;
  timeoutMs: number;
  createdAt: number;
  updatedAt: number;
}

export interface AiSessionHistoryMessage {
  role: "user" | "assistant";
  text: string;
  createdAt: number;
}

export type AiOrchestratorRunStatus =
  | "queued"
  | "pending_approval"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface AiOrchestratorExecuteRequest {
  objective: string;
  input?: unknown;
  profileId?: string;
  cwd?: string;
  timeoutMs?: number;
  approved?: boolean;
  allowedToolIds?: string[];
  sessionId?: string;
  metadata?: Record<string, unknown>;
  parentRunId?: string;
  budget?: Partial<AiExecutionBudget>;
}

export interface AiOrchestratorRunRecord {
  id: string;
  automationId?: string;
  sessionId: string;
  objective: string;
  profileId: string;
  runtimeProvider: AiRuntimeProviderId;
  cwd: string;
  status: AiOrchestratorRunStatus;
  output?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost?: number;
  };
  metadata?: Record<string, unknown>;
  parentRunId?: string;
  delegationPlan?: AiDelegationPlan;
  approvalReason?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  updatedAt: number;
}

export interface AiOrchestratorEvent {
  id: string;
  runId: string;
  seq: number;
  type: string;
  level: "debug" | "info" | "warn" | "error";
  payload?: Record<string, unknown>;
  createdAt: number;
}

export type AiAutomationTrigger =
  | { type: "startup" }
  | { type: "interval"; intervalMs: number }
  | { type: "cron"; expression: string }
  | {
      type: "file_event";
      path: string;
      events?: Array<"change" | "rename">;
      debounceMs?: number;
    };

export interface AiAutomationDefinition {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  objective: string;
  input?: unknown;
  profileId: string;
  trigger: AiAutomationTrigger;
  approvalMode: AiAgentApprovalMode;
  cwd?: string;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
  createdAt: number;
  policy: AiAutomationPolicy;
  updatedAt: number;
}

export interface AiAutomationRunRecord {
  id: string;
  automationId: string;
  orchestratorRunId?: string;
  triggerType: AiAutomationTrigger["type"] | "manual" | "recovery";
  status: AiOrchestratorRunStatus;
  approved: boolean;
  missedCount: number;
  payload?: Record<string, unknown>;
  error?: string;
  policyVersion: number;
  approvalReason?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  updatedAt: number;
}

export interface AiOrchestratorSnapshot {
  runtimeReady: boolean;
  activeRunIds: string[];
  profiles: AiAgentProfile[];
  automations: AiAutomationDefinition[];
  recentRuns: AiOrchestratorRunRecord[];
  importedItems: AiImportedConfigItem[];
}

export interface AiAutomationRunNowRequest {
  automationId: string;
  approved?: boolean;
  payload?: Record<string, unknown>;
}

export interface AiOrchestratorApproveRequest {
  runId: string;
}

export interface AiAutomationApproveRequest {
  runId: string;
}

export interface AiOrchestratorRunListRequest {
  limit?: number;
  status?: AiOrchestratorRunStatus;
}
