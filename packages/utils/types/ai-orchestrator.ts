export type AiCliProviderId =
  | "codex"
  | "claude"
  | "pi"
  | "oh-my-pi"
  | "opencode";

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
  provider: AiCliProviderId;
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

export interface AiImportApplyRequest {
  scanId: string;
  candidateIds: string[];
  confirmSecretMigration?: boolean;
  overrides?: Record<
    string,
    { targetScope?: AiImportTargetScope; alias?: string }
  >;
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
