export const ORCHESTRATOR_PRIVACY_GATE_KEYS = Object.freeze([
  'typedDeletePreview',
  'authorityBoundOneShotDelete',
  'terminalRunDeletion',
  'activeRunProtected',
  'automaticRetention',
  'keysetPagination',
  'cancellationPartialCommit',
  'cascadeDelete',
  'journaledMigration',
  'utf8ByteAccounting'
] as const)

export type OrchestratorPrivacyGateKey = (typeof ORCHESTRATOR_PRIVACY_GATE_KEYS)[number]
export type OrchestratorPrivacyGateChecks = Record<OrchestratorPrivacyGateKey, true>
