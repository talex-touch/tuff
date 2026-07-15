import type { Client } from '@libsql/client'
import type {
  CompressionSnapshot,
  CompressionSnapshotDraft,
  CompressionSnapshotMetadata,
  ContextCheckpoint,
  ContextContinuationReason,
  ContextContinuationSummary,
  ContextPackage,
  ContextPackageLog,
  ContextPrivacyLevel,
  ContextScope,
  ContextSession,
  ContextTurn,
  CreateCompressionSnapshotInput,
  CreateCompressionSnapshotResult,
  EvaluateMemoryInput,
  EvaluateMemoryResult,
  ListCompressionSnapshotsInput,
  ListCompressionSnapshotsResult,
  ListContextCheckpointsInput,
  ListContextCheckpointsResult,
  ListContextPackageLogsInput,
  ListContextPackageLogsResult,
  ListMemoriesInput,
  ListMemoriesResult,
  MemoryItem,
  MemoryPolicyCandidate,
  MemoryTombstone,
  MemoryUpsertInput,
  PrepareContextTurnInput,
  PrepareContextTurnResult,
  ReplaceMemoryInput,
  ReplaceMemoryResult,
  SetMemoryEnabledResult
} from '@talex-touch/utils/types/intelligence'
import crypto from 'node:crypto'
import process from 'node:process'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import { withSqliteRetry } from '../../db/sqlite-retry'
import { createLogger } from '../../utils/logger'
import { databaseModule } from '../database'
import { localKnowledgeEngine } from './intelligence-local-knowledge-engine'
import { estimateContextTokens, normalizeContextTokenBudget } from './intelligence-token-estimate'

const log = createLogger('IntelligenceContext')
const DEFAULT_TOKEN_BUDGET = 1_600
const SESSION_IDLE_MS = 2 * 60 * 60 * 1000
const COREBOX_ONLY = process.env.TUFF_INTELLIGENCE_CONTEXT_COREBOX_ONLY === '1'
const REDACTED_PRIVATE_TURN = '[redacted:private-context-turn]'
const COMPRESSION_TEXT_MAX = 4_000
const COMPRESSION_ARRAY_MAX = 20
const COMPRESSION_ARRAY_ITEM_MAX = 500
const COMPRESSION_TOTAL_MAX = 12_000
const COMPRESSION_MEMORY_IDS_MAX = 32

interface SessionRow {
  id: string
  owner: ContextSession['owner']
  status: ContextSession['status']
  objective: string | null
  summary: string | null
  metadata: string | null
  created_at: number
  updated_at: number
  archived_at: number | null
}

interface TurnRow {
  id: string
  session_id: string
  role: ContextTurn['role']
  content: string
  privacy_level: ContextPrivacyLevel
  token_estimate: number
  metadata: string | null
  created_at: number
}

interface MemoryRow {
  id: string
  type: MemoryItem['type']
  scope: MemoryItem['scope']
  content: string
  summary: string
  tags: string
  confidence: number
  source_session_id: string | null
  source_turn_id: string | null
  privacy_level: ContextPrivacyLevel
  ttl: number | null
  enabled: number
  created_at: number
  updated_at: number
  last_used_at: number | null
  usage_count: number
  replaces_memory_id?: string | null
}

interface MemoryRevalidationRow extends MemoryRow {
  tombstone_memory_id: string | null
}

interface PackageLogRow {
  id: string
  session_id: string
  scope: ContextScope
  trace_id: string | null
  token_budget: number
  token_estimate: number
  items: string
  metadata: string | null
  created_at: number
}

interface CheckpointRow {
  id: string
  session_id: string
  type: ContextCheckpoint['type']
  reason: string
  summary: string | null
  context_scope: ContextScope
  metadata: string | null
  created_at: number
}

interface CompressionSnapshotRow {
  id: string
  session_id: string
  goal: string | null
  current_state: string | null
  decisions: string
  constraints: string
  artifacts: string
  open_questions: string
  source_turn_from: string | null
  source_turn_to: string | null
  metadata: string | null
  created_at: number
}

interface CompressionSourceTurnRow {
  id: string
  privacy_level: ContextPrivacyLevel
  created_at: number
}

interface CompressionSnapshotContent {
  goal?: string
  currentState?: string
  decisions: string[]
  constraints: string[]
  artifacts: string[]
  openQuestions: string[]
}

interface NormalizedCompressionSnapshot extends CompressionSnapshotContent {
  sourceTurnFrom: string
  sourceTurnTo: string
  metadata: CompressionSnapshotMetadata
}

type ContextPackageSourceType = ContextPackage['items'][number]['sourceType']

interface ContextPackageExcludedItem {
  sourceType: ContextPackageSourceType
  sourceId: string
  reason: string
  tokenEstimate: number
}

interface ContinuationBoundary {
  sourceSession?: ContextSession
  sourceSessionId?: string
  reason: ContextContinuationReason
}

interface ResolvedContinuation {
  summary: ContextContinuationSummary
  item?: ContextPackage['items'][number]
  excluded?: ContextPackageExcludedItem
}

type MemoryContextExclusionReason =
  | 'memory-disabled'
  | 'memory-expired'
  | 'memory-privacy-blocked'
  | 'memory-scope-mismatch'

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`
}

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

function parsePackageLogItems(value: string | null | undefined): ContextPackageLog['items'] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const record = item as Record<string, unknown>
        return {
          sourceType: record.sourceType as ContextPackageLog['items'][number]['sourceType'],
          sourceId: String(record.sourceId || ''),
          reason: String(record.reason || ''),
          tokenEstimate: Math.max(0, Math.floor(Number(record.tokenEstimate || 0))),
          metadata:
            record.metadata &&
            typeof record.metadata === 'object' &&
            !Array.isArray(record.metadata)
              ? (record.metadata as Record<string, unknown>)
              : undefined
        }
      })
      .filter((item) => item.sourceId && item.reason)
  } catch {
    return []
  }
}

function stringifyJson(value: Record<string, unknown> | undefined): string | null {
  if (!value || Object.keys(value).length === 0) return null
  return JSON.stringify(value)
}

function normalizeScope(input: PrepareContextTurnInput): ContextScope {
  if (input.explicitScope) return input.explicitScope
  if (input.metadata?.noHistory === true) return 'none'
  if (input.continueSession) return 'session'
  return 'light'
}

function isExplicitNewTopic(input: string): boolean {
  return /(?:^|\s)(?:new session|new topic|clear context|no history|不带历史|清理上下文|新会话|新话题)(?:\s|$)/i.test(
    input
  )
}

function containsSecret(content: string): boolean {
  return [
    /\bsk-[\w-]{12,}\b/,
    /\bghp_\w{20,}\b/,
    /\bBearer\s+[A-Za-z0-9._~+\/-]{16,}=*(?![A-Za-z0-9._~+\/=-])/i,
    /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
    /\b(?:api[_-]?key|token|secret|password|passwd)\s*[:=]\s*\S+/i,
    /(?:恢复码|口令)\s*[:=：]\s*\S+/,
    /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/
  ].some((pattern) => pattern.test(content))
}

export function isContextInputProviderSafe(content: string): boolean {
  return !containsSecret(content)
}

function optsOutOfMemory(content: string): boolean {
  return [
    /\b(do not remember|don't remember|dont remember|forget this)\b/i,
    /(不要记住|别记住|不要记忆|不要保存|别保存|不要记录|别记录|不用记住|不需要记住)/
  ].some((pattern) => pattern.test(content))
}

function clampConfidence(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.6
  return Math.min(1, Math.max(0, value))
}

function normalizeMemorySummary(input: EvaluateMemoryInput, content: string): string {
  const summarySource =
    typeof input.summary === 'string' ? input.summary.trim() || content : content
  const summary = summarySource.replace(/\s+/g, ' ').trim()
  return summary.slice(0, 240)
}

function normalizeMemoryTags(tags: string[] | undefined): string[] {
  if (!Array.isArray(tags)) return []
  return Array.from(
    new Set(
      tags
        .filter((tag) => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => tag.slice(0, 40))
    )
  ).slice(0, 12)
}

function memoryEvaluationFingerprint(content: string, candidate: MemoryPolicyCandidate): string {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        content,
        type: candidate.type,
        scope: candidate.scope,
        summary: candidate.summary,
        tags: candidate.tags,
        confidence: candidate.confidence,
        sourceSessionId: candidate.sourceSessionId ?? null,
        sourceTurnId: candidate.sourceTurnId ?? null,
        privacyLevel: candidate.privacyLevel,
        ttl: candidate.ttl ?? null
      })
    )
    .digest('hex')
}

function createMemoryItem(
  input: MemoryUpsertInput,
  now = Date.now(),
  forcedId?: string
): MemoryItem {
  const content = String(input.content || '').trim()
  if (!content) {
    throw new Error('Invalid memory: content is required')
  }
  const summary = normalizeMemorySummary(input, content)
  const tags = normalizeMemoryTags(input.tags)
  const policyText = [content, summary, ...tags].join('\n')
  const privacyLevel = input.privacyLevel ?? (containsSecret(policyText) ? 'secret' : 'normal')
  if (privacyLevel !== 'normal' || containsSecret(policyText)) {
    throw new Error('MEMORY_POLICY_REJECTED_SECRET')
  }
  if (input.ttl !== undefined && (!Number.isFinite(input.ttl) || input.ttl <= 0)) {
    throw new Error('Invalid memory: ttl must be a positive duration')
  }

  return {
    id: forcedId ?? input.id ?? id('mem'),
    type: input.type,
    scope: input.scope,
    content,
    summary,
    tags,
    confidence: input.confidence ?? 1,
    sourceSessionId: input.sourceSessionId,
    sourceTurnId: input.sourceTurnId,
    privacyLevel,
    ttl: input.ttl,
    enabled: input.enabled ?? true,
    createdAt: now,
    updatedAt: now,
    usageCount: 0
  }
}

function compressionSnapshotError(reason: string): Error {
  return new Error(`COMPRESSION_SNAPSHOT_INVALID:${reason}`)
}

function normalizeCompressionText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw compressionSnapshotError(`${field}-type`)
  const normalized = value.trim()
  if (!normalized) return undefined
  if (normalized.length > COMPRESSION_TEXT_MAX) throw compressionSnapshotError(`${field}-oversized`)
  return normalized
}

function normalizeCompressionArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > COMPRESSION_ARRAY_MAX)
    throw compressionSnapshotError(`${field}-shape`)
  return value.map((item) => {
    if (typeof item !== 'string') throw compressionSnapshotError(`${field}-item-type`)
    const normalized = item.trim()
    if (!normalized || normalized.length > COMPRESSION_ARRAY_ITEM_MAX)
      throw compressionSnapshotError(`${field}-item-size`)
    return normalized
  })
}

function compressionMetadataFromRecord(
  record: Record<string, unknown>
): CompressionSnapshotMetadata {
  const metadata: CompressionSnapshotMetadata = {}
  if (
    record.privacyLevel === 'normal' ||
    record.privacyLevel === 'sensitive' ||
    record.privacyLevel === 'secret'
  )
    metadata.privacyLevel = record.privacyLevel
  if (
    record.factState === 'confirmed' ||
    record.factState === 'inferred' ||
    record.factState === 'user-rejected'
  )
    metadata.factState = record.factState
  if (typeof record.confidence === 'number' && Number.isFinite(record.confidence))
    metadata.confidence = record.confidence
  if (Array.isArray(record.memoryIds)) {
    metadata.memoryIds = Array.from(
      new Set(
        record.memoryIds
          .slice(0, COMPRESSION_MEMORY_IDS_MAX)
          .flatMap((item) => (typeof item === 'string' ? [item.trim()] : []))
          .filter((item) => Boolean(item) && item.length <= 128)
      )
    )
  }
  if (typeof record.checkpointId === 'string' && record.checkpointId.trim().length <= 128)
    metadata.checkpointId = record.checkpointId.trim()
  return metadata
}

function normalizeCompressionMetadata(value: unknown): CompressionSnapshotMetadata {
  if (value === undefined || value === null) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw compressionSnapshotError('metadata-shape')
  const record = value as Record<string, unknown>
  const metadata = compressionMetadataFromRecord(record)

  if (record.privacyLevel !== undefined && metadata.privacyLevel === undefined)
    throw compressionSnapshotError('metadata-privacy')
  if (record.factState !== undefined && metadata.factState === undefined)
    throw compressionSnapshotError('metadata-fact-state')
  if (record.confidence !== undefined) {
    if (metadata.confidence === undefined || metadata.confidence < 0 || metadata.confidence > 1)
      throw compressionSnapshotError('metadata-confidence')
  }
  if (record.memoryIds !== undefined) {
    if (!Array.isArray(record.memoryIds) || record.memoryIds.length > COMPRESSION_MEMORY_IDS_MAX)
      throw compressionSnapshotError('metadata-memory-ids')
    const memoryIds = Array.from(
      new Set(
        record.memoryIds.map((memoryId) => {
          if (typeof memoryId !== 'string')
            throw compressionSnapshotError('metadata-memory-id-type')
          const normalized = memoryId.trim()
          if (!normalized || normalized.length > 128)
            throw compressionSnapshotError('metadata-memory-id-size')
          return normalized
        })
      )
    )
    metadata.memoryIds = memoryIds
  }
  delete metadata.checkpointId
  return metadata
}

function normalizeCompressionSnapshotDraft(
  input: CompressionSnapshotDraft
): NormalizedCompressionSnapshot {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw compressionSnapshotError('snapshot-shape')
  const record = input as unknown as Record<string, unknown>
  const sourceTurnFrom = normalizeCompressionText(record.sourceTurnFrom, 'source-turn-from')
  const sourceTurnTo = normalizeCompressionText(record.sourceTurnTo, 'source-turn-to')
  if (!sourceTurnFrom || !sourceTurnTo || sourceTurnFrom.length > 128 || sourceTurnTo.length > 128)
    throw compressionSnapshotError('source-range')

  const snapshot: NormalizedCompressionSnapshot = {
    goal: normalizeCompressionText(record.goal, 'goal'),
    currentState: normalizeCompressionText(record.currentState, 'current-state'),
    decisions: normalizeCompressionArray(record.decisions, 'decisions'),
    constraints: normalizeCompressionArray(record.constraints, 'constraints'),
    artifacts: normalizeCompressionArray(record.artifacts, 'artifacts'),
    openQuestions: normalizeCompressionArray(record.openQuestions, 'open-questions'),
    sourceTurnFrom,
    sourceTurnTo,
    metadata: normalizeCompressionMetadata(record.metadata)
  }
  const contentSize = [snapshot.goal, snapshot.currentState]
    .filter((value): value is string => Boolean(value))
    .concat(snapshot.decisions, snapshot.constraints, snapshot.artifacts, snapshot.openQuestions)
    .reduce((total, value) => total + value.length, 0)
  if (contentSize === 0) throw compressionSnapshotError('empty')
  if (contentSize > COMPRESSION_TOTAL_MAX) throw compressionSnapshotError('oversized')
  return snapshot
}

function renderCompressionSnapshot(snapshot: CompressionSnapshotContent): string {
  const sections: string[] = []
  if (snapshot.goal) sections.push(`Goal: ${snapshot.goal}`)
  if (snapshot.currentState) sections.push(`Current state: ${snapshot.currentState}`)
  const appendList = (label: string, values: string[]): void => {
    if (values.length > 0)
      sections.push(`${label}:\n${values.map((value) => `- ${value}`).join('\n')}`)
  }
  appendList('Decisions', snapshot.decisions)
  appendList('Constraints', snapshot.constraints)
  appendList('Artifacts', snapshot.artifacts)
  appendList('Open questions', snapshot.openQuestions)
  return sections.join('\n\n')
}

function compressionSnapshotFromRow(row: CompressionSnapshotRow): CompressionSnapshot {
  return {
    id: row.id,
    sessionId: row.session_id,
    goal: row.goal ?? undefined,
    currentState: row.current_state ?? undefined,
    decisions: parseJsonArray(row.decisions),
    constraints: parseJsonArray(row.constraints),
    artifacts: parseJsonArray(row.artifacts),
    openQuestions: parseJsonArray(row.open_questions),
    sourceTurnFrom: row.source_turn_from ?? undefined,
    sourceTurnTo: row.source_turn_to ?? undefined,
    metadata: compressionMetadataFromRecord(parseJsonRecord(row.metadata)),
    createdAt: row.created_at
  }
}

function getCompressionSnapshotPolicyExclusionReason(snapshot: CompressionSnapshot): string | null {
  const metadata = snapshot.metadata
  if (metadata?.privacyLevel && metadata.privacyLevel !== 'normal')
    return `snapshot-${metadata.privacyLevel}-blocked`
  if (metadata?.factState === 'user-rejected') return 'snapshot-user-rejected'
  if (metadata?.confidence !== undefined && metadata.confidence < 0.5)
    return 'snapshot-low-confidence'
  const content = renderCompressionSnapshot(snapshot)
  if (!content || containsSecret(content)) return 'snapshot-content-blocked'
  return null
}

function contentForPersistence(content: string, privacyLevel: ContextPrivacyLevel): string {
  return privacyLevel === 'normal' ? content : REDACTED_PRIVATE_TURN
}

function sessionFromRow(row: SessionRow): ContextSession {
  return {
    id: row.id,
    owner: row.owner,
    status: row.status,
    objective: row.objective ?? undefined,
    summary: row.summary ?? undefined,
    metadata: parseJsonRecord(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? undefined
  }
}

function turnFromRow(row: TurnRow): ContextTurn {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    privacyLevel: row.privacy_level,
    tokenEstimate: Math.max(Number(row.token_estimate) || 0, estimateContextTokens(row.content)),
    metadata: parseJsonRecord(row.metadata),
    createdAt: row.created_at
  }
}

function memoryFromRow(row: MemoryRow): MemoryItem {
  return {
    id: row.id,
    type: row.type,
    scope: row.scope,
    content: row.content,
    summary: row.summary,
    tags: parseJsonArray(row.tags),
    confidence: row.confidence,
    sourceSessionId: row.source_session_id ?? undefined,
    sourceTurnId: row.source_turn_id ?? undefined,
    replacesMemoryId: row.replaces_memory_id ?? undefined,
    privacyLevel: row.privacy_level,
    ttl: row.ttl ?? undefined,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at ?? undefined,
    usageCount: row.usage_count
  }
}

function getMemoryContextExclusionReason(
  memory: MemoryItem,
  sessionId: string,
  now: number
): MemoryContextExclusionReason | null {
  if (!memory.enabled) {
    return 'memory-disabled'
  }
  if (memory.privacyLevel !== 'normal') {
    return 'memory-privacy-blocked'
  }
  if (memory.ttl !== undefined && memory.updatedAt + memory.ttl <= now) {
    return 'memory-expired'
  }
  if (memory.scope === 'global') {
    return null
  }
  if (
    memory.scope === 'session' &&
    Boolean(memory.sourceSessionId) &&
    memory.sourceSessionId === sessionId
  ) {
    return null
  }
  return 'memory-scope-mismatch'
}

/**
 * Apply the host-owned injection policy after storage filtering so stale or
 * over-broad rows cannot enter a ContextPackage.
 */
export function isMemoryUsableForContext(
  memory: MemoryItem,
  sessionId: string,
  now = Date.now()
): boolean {
  return getMemoryContextExclusionReason(memory, sessionId, now) === null
}

function serializePackageLogItems(contextPackage: ContextPackage): string {
  return JSON.stringify(
    contextPackage.items.map((item) => ({
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      reason: item.reason,
      tokenEstimate: item.tokenEstimate,
      metadata: item.metadata
    }))
  )
}

function readExcludedItems(value: unknown): ContextPackageExcludedItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }
    const record = item as Record<string, unknown>
    const sourceId = typeof record.sourceId === 'string' ? record.sourceId : ''
    const reason = typeof record.reason === 'string' ? record.reason : ''
    const sourceType = record.sourceType as ContextPackageSourceType
    if (!sourceId || !reason) {
      return []
    }
    return [
      {
        sourceType,
        sourceId,
        reason,
        tokenEstimate: Math.max(0, Math.floor(Number(record.tokenEstimate) || 0))
      }
    ]
  })
}

function packageLogFromRow(row: PackageLogRow): ContextPackageLog {
  return {
    id: row.id,
    sessionId: row.session_id,
    scope: row.scope,
    traceId: row.trace_id ?? undefined,
    tokenBudget: row.token_budget,
    tokenEstimate: row.token_estimate,
    items: parsePackageLogItems(row.items),
    metadata: parseJsonRecord(row.metadata),
    createdAt: row.created_at
  }
}

function checkpointFromRow(row: CheckpointRow): ContextCheckpoint {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    reason: row.reason,
    summary: row.summary ?? undefined,
    contextScope: row.context_scope,
    metadata: parseJsonRecord(row.metadata),
    createdAt: row.created_at
  }
}

export class ContextHygieneService {
  private getClient(): Client | null {
    return databaseModule.getClient()
  }

  private requireClient(): Client {
    const client = this.getClient()
    if (!client) {
      throw new Error('CONTEXT_HYGIENE_UNAVAILABLE: database client is not ready')
    }
    return client
  }

  private async withDbWrite<T>(label: string, operation: () => Promise<T>): Promise<T> {
    return dbWriteScheduler.schedule(label, () => withSqliteRetry(operation, { label }), {
      priority: 'interactive',
      maxQueueWaitMs: 8_000
    })
  }

  private async persistMemory(
    client: Client,
    memory: MemoryItem,
    allowUpdate: boolean
  ): Promise<void> {
    const onConflict = allowUpdate
      ? `
          ON CONFLICT(id) DO UPDATE SET
            type = excluded.type,
            scope = excluded.scope,
            content = excluded.content,
            summary = excluded.summary,
            tags = excluded.tags,
            confidence = excluded.confidence,
            source_session_id = excluded.source_session_id,
            source_turn_id = excluded.source_turn_id,
            privacy_level = excluded.privacy_level,
            ttl = excluded.ttl,
            enabled = excluded.enabled,
            updated_at = excluded.updated_at`
      : ''

    await client.execute({
      sql: `
        INSERT INTO intelligence_memory_items
          (id, type, scope, content, summary, tags, confidence, source_session_id, source_turn_id,
           privacy_level, ttl, enabled, created_at, updated_at, last_used_at, usage_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ${onConflict}
      `,
      args: [
        memory.id,
        memory.type,
        memory.scope,
        memory.content,
        memory.summary,
        JSON.stringify(memory.tags),
        memory.confidence,
        memory.sourceSessionId ?? null,
        memory.sourceTurnId ?? null,
        memory.privacyLevel,
        memory.ttl ?? null,
        memory.enabled ? 1 : 0,
        memory.createdAt,
        memory.updatedAt,
        memory.lastUsedAt ?? null,
        memory.usageCount
      ]
    })
  }

  private async getCompressionSnapshotExclusionReason(
    snapshot: CompressionSnapshot
  ): Promise<string | null> {
    const policyReason = getCompressionSnapshotPolicyExclusionReason(snapshot)
    if (policyReason) return policyReason
    if (!snapshot.sourceTurnFrom || !snapshot.sourceTurnTo) return 'snapshot-source-range-invalid'
    if (!snapshot.metadata?.checkpointId) return 'snapshot-checkpoint-missing'

    const client = this.requireClient()
    const endpointsResult = await client.execute({
      sql: `
        SELECT id, privacy_level, created_at
        FROM intelligence_context_turns
        WHERE session_id = ? AND (id = ? OR id = ?)
      `,
      args: [snapshot.sessionId, snapshot.sourceTurnFrom, snapshot.sourceTurnTo]
    })
    const endpoints = endpointsResult.rows as unknown as CompressionSourceTurnRow[]
    const sourceFrom = endpoints.find((turn) => turn.id === snapshot.sourceTurnFrom)
    const sourceTo = endpoints.find((turn) => turn.id === snapshot.sourceTurnTo)
    if (!sourceFrom || !sourceTo) return 'snapshot-source-range-invalid'
    if (sourceFrom.id !== sourceTo.id && sourceFrom.created_at >= sourceTo.created_at)
      return 'snapshot-source-range-invalid'

    const rangeResult = await client.execute({
      sql: `
        SELECT id, privacy_level, created_at
        FROM intelligence_context_turns
        WHERE session_id = ? AND created_at >= ? AND created_at <= ?
        ORDER BY created_at ASC, id ASC
      `,
      args: [snapshot.sessionId, sourceFrom.created_at, sourceTo.created_at]
    })
    const sourceTurns = rangeResult.rows as unknown as CompressionSourceTurnRow[]
    if (sourceTurns.length === 0) return 'snapshot-source-range-invalid'
    if (sourceTurns.some((turn) => turn.privacy_level !== 'normal'))
      return 'snapshot-source-privacy-blocked'

    const memoryIds = Array.from(new Set(snapshot.metadata.memoryIds ?? []))
    if (memoryIds.length === 0) return null
    const result = await client.execute({
      sql: `
        SELECT memory_id
        FROM intelligence_memory_tombstones
        WHERE memory_id IN (${memoryIds.map(() => '?').join(', ')})
        LIMIT 1
      `,
      args: memoryIds
    })
    return result.rows.length > 0 ? 'snapshot-memory-tombstoned' : null
  }

  private assertOwner(owner: ContextSession['owner']): void {
    if (COREBOX_ONLY && owner !== 'corebox') {
      throw new Error('CONTEXT_HYGIENE_COREBOX_ONLY')
    }
  }

  private async getSession(sessionId: string): Promise<ContextSession | null> {
    const client = this.requireClient()
    const result = await client.execute({
      sql: 'SELECT * FROM intelligence_context_sessions WHERE id = ? LIMIT 1',
      args: [sessionId]
    })
    const row = result.rows[0] as unknown as SessionRow | undefined
    return row ? sessionFromRow(row) : null
  }

  private async getLatestActiveSession(
    owner: ContextSession['owner']
  ): Promise<ContextSession | null> {
    const client = this.requireClient()
    const result = await client.execute({
      sql: `
        SELECT * FROM intelligence_context_sessions
        WHERE owner = ? AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      args: [owner]
    })
    const row = result.rows[0] as unknown as SessionRow | undefined
    return row ? sessionFromRow(row) : null
  }

  private async createSession(
    input: PrepareContextTurnInput,
    now: number
  ): Promise<ContextSession> {
    const client = this.requireClient()
    const session: ContextSession = {
      id: input.sessionId || id('ctxs'),
      owner: input.owner ?? 'corebox',
      status: 'active',
      objective: input.objective,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now
    }

    await this.withDbWrite('intelligence.context.createSession', async () => {
      await client.execute({
        sql: `
          INSERT INTO intelligence_context_sessions
            (id, owner, status, objective, summary, metadata, created_at, updated_at, archived_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          session.id,
          session.owner,
          session.status,
          session.objective ?? null,
          null,
          stringifyJson(session.metadata),
          now,
          now,
          null
        ]
      })
    })
    return session
  }

  private async createCheckpoint(
    sessionId: string,
    type: ContextCheckpoint['type'],
    reason: string,
    contextScope: ContextScope,
    now: number,
    metadata?: Record<string, unknown>
  ): Promise<ContextCheckpoint> {
    const client = this.requireClient()
    const checkpoint: ContextCheckpoint = {
      id: id('ctxcp'),
      sessionId,
      type,
      reason,
      contextScope,
      metadata,
      createdAt: now
    }
    await this.withDbWrite('intelligence.context.checkpoint', async () => {
      await client.execute({
        sql: `
          INSERT INTO intelligence_context_checkpoints
            (id, session_id, type, reason, summary, context_scope, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          checkpoint.id,
          sessionId,
          type,
          reason,
          null,
          contextScope,
          stringifyJson(metadata),
          now
        ]
      })
    })
    return checkpoint
  }

  private async resolveSession(
    input: PrepareContextTurnInput,
    scope: ContextScope,
    now: number
  ): Promise<{
    session: ContextSession
    checkpoint?: ContextCheckpoint
    continuation?: ContinuationBoundary
  }> {
    const owner = input.owner ?? 'corebox'
    this.assertOwner(owner)

    const requestedSessionId = input.sessionId?.trim()
    const explicitNew =
      input.startNewSession === true || scope === 'none' || isExplicitNewTopic(input.input)
    const wantsContinuation = input.continueSession === true && !explicitNew
    const contextActorId =
      typeof input.metadata?.contextActorId === 'string' ? input.metadata.contextActorId.trim() : ''
    const requested = requestedSessionId ? await this.getSession(requestedSessionId) : null
    if (
      requested &&
      (requested.owner !== owner ||
        (contextActorId && requested.metadata?.contextActorId !== contextActorId))
    ) {
      throw new Error('CONTEXT_SESSION_SCOPE_MISMATCH')
    }

    const latest =
      requested ?? (explicitNew || contextActorId ? null : await this.getLatestActiveSession(owner))
    const inactive = latest ? latest.status !== 'active' : false
    const idle = latest
      ? latest.status === 'active' && now - latest.updatedAt > SESSION_IDLE_MS
      : false

    let continuation: ContinuationBoundary | undefined
    if (wantsContinuation && !requested) {
      continuation = {
        sourceSessionId: requestedSessionId,
        reason: 'continuation-session-missing'
      }
    } else if (wantsContinuation && requested && (inactive || idle)) {
      const reason: ContextContinuationReason =
        requested.status === 'archived'
          ? 'archived-session-continuation'
          : requested.status === 'expired'
            ? 'expired-session-continuation'
            : 'idle-session-continuation'
      continuation = {
        sourceSession: requested,
        sourceSessionId: requested.id,
        reason
      }
    }

    if (!latest || explicitNew || inactive || idle) {
      const continuationMetadata = continuation
        ? {
            ...(input.metadata ?? {}),
            ...(continuation.sourceSessionId
              ? { continuedFromSessionId: continuation.sourceSessionId }
              : {}),
            continuationReason: continuation.reason
          }
        : input.metadata
      const shouldGenerateSessionId = Boolean(requested || wantsContinuation)
      const session = await this.createSession(
        {
          ...input,
          sessionId: shouldGenerateSessionId ? undefined : input.sessionId,
          metadata: continuationMetadata
        },
        now
      )
      const checkpointReason =
        continuation?.reason ??
        (explicitNew ? 'explicit-new-context' : idle ? 'long-inactivity' : 'new-session')
      const checkpointMetadata = continuation
        ? {
            ...(continuation.sourceSessionId
              ? { continuedFromSessionId: continuation.sourceSessionId }
              : {}),
            continuationReason: continuation.reason
          }
        : undefined
      const checkpoint = await this.createCheckpoint(
        session.id,
        'session_start',
        checkpointReason,
        scope,
        now,
        checkpointMetadata
      )
      return { session, checkpoint, continuation }
    }

    return { session: latest }
  }

  private async listRecentTurns(sessionId: string, limit: number): Promise<ContextTurn[]> {
    const client = this.requireClient()
    const result = await client.execute({
      sql: `
        SELECT * FROM intelligence_context_turns
        WHERE session_id = ? AND privacy_level = 'normal'
        ORDER BY created_at DESC
        LIMIT ?
      `,
      args: [sessionId, limit]
    })
    return (result.rows as unknown as TurnRow[]).map(turnFromRow).reverse()
  }

  private async listUsableMemories(sessionId: string): Promise<MemoryItem[]> {
    const client = this.requireClient()
    const now = Date.now()
    const result = await client.execute({
      sql: `
        SELECT m.*
        FROM intelligence_memory_items m
        LEFT JOIN intelligence_memory_tombstones t ON t.memory_id = m.id
        WHERE m.enabled = 1
          AND m.privacy_level = 'normal'
          AND t.memory_id IS NULL
          AND (m.ttl IS NULL OR m.updated_at + m.ttl > ?)
          AND (m.scope = 'global' OR (m.scope = 'session' AND m.source_session_id = ?))
        ORDER BY m.updated_at DESC
        LIMIT 5
      `,
      args: [now, sessionId]
    })
    return (result.rows as unknown as MemoryRow[])
      .map(memoryFromRow)
      .filter((memory) => isMemoryUsableForContext(memory, sessionId, now))
  }

  private async saveTurn(
    sessionId: string,
    input: PrepareContextTurnInput,
    now: number,
    role: ContextTurn['role'] = 'user'
  ): Promise<ContextTurn> {
    const client = this.requireClient()
    const privacyLevel = containsSecret(input.input) ? 'secret' : (input.privacyLevel ?? 'normal')
    const persistedContent = contentForPersistence(input.input, privacyLevel)
    const turn: ContextTurn = {
      id: id('ctxt'),
      sessionId,
      role,
      content: persistedContent,
      privacyLevel,
      tokenEstimate: estimateContextTokens(persistedContent),
      metadata: input.metadata,
      createdAt: now
    }

    await this.withDbWrite('intelligence.context.saveTurn', async () => {
      await client.execute({
        sql: `
          INSERT INTO intelligence_context_turns
            (id, session_id, role, content, privacy_level, token_estimate, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          turn.id,
          sessionId,
          turn.role,
          turn.content,
          turn.privacyLevel,
          turn.tokenEstimate,
          stringifyJson(turn.metadata),
          now
        ]
      })
      await client.execute({
        sql: 'UPDATE intelligence_context_sessions SET updated_at = ? WHERE id = ?',
        args: [now, sessionId]
      })
    })

    return turn
  }

  private async resolveContinuation(boundary: ContinuationBoundary): Promise<ResolvedContinuation> {
    const metadataBase = {
      ...(boundary.sourceSessionId ? { sourceSessionId: boundary.sourceSessionId } : {}),
      reason: boundary.reason
    }
    const sourceSession = boundary.sourceSession
    if (!sourceSession) {
      return {
        summary: {
          ...metadataBase,
          status: 'unavailable',
          degradedReason: 'continuation-source-session-missing'
        }
      }
    }

    try {
      const snapshot = await this.getLatestCompressionSnapshot(sourceSession.id)
      if (snapshot) {
        const content = renderCompressionSnapshot(snapshot)
        const tokenEstimate = estimateContextTokens(content)
        const exclusionReason = await this.getCompressionSnapshotExclusionReason(snapshot)
        const summary: ContextContinuationSummary = {
          ...metadataBase,
          status: exclusionReason ? 'excluded' : 'included',
          summarySourceType: 'compression_snapshot',
          summarySourceId: snapshot.id,
          ...(exclusionReason ? { degradedReason: exclusionReason } : {})
        }
        if (exclusionReason) {
          return {
            summary,
            excluded: {
              sourceType: 'summary',
              sourceId: snapshot.id,
              reason: exclusionReason,
              tokenEstimate
            }
          }
        }
        return {
          summary,
          item: {
            sourceType: 'summary',
            sourceId: snapshot.id,
            reason: 'explicit inactive session summary continuation',
            content,
            tokenEstimate,
            metadata: {
              sourceSessionId: sourceSession.id,
              continuationReason: boundary.reason,
              snapshotId: snapshot.id,
              sourceTurnFrom: snapshot.sourceTurnFrom,
              sourceTurnTo: snapshot.sourceTurnTo,
              checkpointId: snapshot.metadata?.checkpointId
            }
          }
        }
      }

      const legacySummary = sourceSession.summary?.trim()
      if (!legacySummary) {
        return {
          summary: {
            ...metadataBase,
            status: 'unavailable',
            degradedReason: 'continuation-summary-unavailable'
          }
        }
      }

      const tokenEstimate = estimateContextTokens(legacySummary)
      if (containsSecret(legacySummary)) {
        return {
          summary: {
            ...metadataBase,
            status: 'excluded',
            summarySourceType: 'session_summary',
            summarySourceId: sourceSession.id,
            degradedReason: 'summary-content-blocked'
          },
          excluded: {
            sourceType: 'summary',
            sourceId: sourceSession.id,
            reason: 'summary-content-blocked',
            tokenEstimate
          }
        }
      }

      return {
        summary: {
          ...metadataBase,
          status: 'included',
          summarySourceType: 'session_summary',
          summarySourceId: sourceSession.id
        },
        item: {
          sourceType: 'summary',
          sourceId: sourceSession.id,
          reason: 'explicit inactive session summary continuation',
          content: legacySummary,
          tokenEstimate,
          metadata: {
            sourceSessionId: sourceSession.id,
            continuationReason: boundary.reason
          }
        }
      }
    } catch {
      return {
        summary: {
          ...metadataBase,
          status: 'unavailable',
          degradedReason: 'continuation-summary-read-failed'
        }
      }
    }
  }

  private async buildPackage(input: {
    session: ContextSession
    turn: ContextTurn
    scope: ContextScope
    tokenBudget: number
    traceId?: string
    metadata?: Record<string, unknown>
    continuation?: ResolvedContinuation
  }): Promise<ContextPackage> {
    const items: ContextPackage['items'] = []
    const excluded: ContextPackageExcludedItem[] = []
    let retrievalMetadata: Record<string, unknown> | undefined
    let compressionMetadata: Record<string, unknown> | undefined
    let tokenEstimate = 0

    const addItem = (item: ContextPackage['items'][number], allowBudgetOverflow = false): void => {
      if (!allowBudgetOverflow && tokenEstimate + item.tokenEstimate > input.tokenBudget) {
        excluded.push({
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          reason: 'token-budget-pruned',
          tokenEstimate: item.tokenEstimate
        })
        return
      }
      items.push(item)
      tokenEstimate += item.tokenEstimate
    }

    if (input.turn.privacyLevel === 'normal') {
      addItem(
        {
          sourceType: 'current_input',
          sourceId: input.turn.id,
          reason: 'current user input',
          content: input.turn.content,
          tokenEstimate: input.turn.tokenEstimate
        },
        true
      )
    } else {
      excluded.push({
        sourceType: 'current_input',
        sourceId: input.turn.id,
        reason: `${input.turn.privacyLevel}-policy-blocked`,
        tokenEstimate: input.turn.tokenEstimate
      })
    }

    const includeHistory = input.metadata?.noHistory !== true

    const continuationMetadata = input.continuation?.summary
    if (input.continuation && continuationMetadata) {
      const canIncludeContinuation =
        includeHistory && (input.scope === 'session' || input.scope === 'retrieval')
      if (!canIncludeContinuation && input.continuation.item) {
        continuationMetadata.status = 'excluded'
        continuationMetadata.degradedReason = 'continuation-history-disabled'
        excluded.push({
          sourceType: 'summary',
          sourceId:
            continuationMetadata.summarySourceId ??
            continuationMetadata.sourceSessionId ??
            'continuation',
          reason: 'continuation-history-disabled',
          tokenEstimate: input.continuation.item.tokenEstimate
        })
      } else if (input.continuation.item) {
        const itemCount = items.length
        addItem(input.continuation.item)
        if (items.length === itemCount) {
          continuationMetadata.status = 'excluded'
          continuationMetadata.degradedReason = 'token-budget-pruned'
        }
      } else if (input.continuation.excluded) {
        excluded.push(input.continuation.excluded)
      }
    }

    if (includeHistory && (input.scope === 'session' || input.scope === 'retrieval')) {
      try {
        const snapshot = await this.getLatestCompressionSnapshot(input.session.id)
        if (snapshot) {
          const summary = renderCompressionSnapshot(snapshot)
          const summaryTokenEstimate = estimateContextTokens(summary)
          const exclusionReason = await this.getCompressionSnapshotExclusionReason(snapshot)
          const snapshotMetadata = {
            snapshotId: snapshot.id,
            sourceTurnFrom: snapshot.sourceTurnFrom,
            sourceTurnTo: snapshot.sourceTurnTo,
            checkpointId: snapshot.metadata?.checkpointId,
            tokenEstimate: summaryTokenEstimate
          }
          if (exclusionReason) {
            excluded.push({
              sourceType: 'summary',
              sourceId: snapshot.id,
              reason: exclusionReason,
              tokenEstimate: summaryTokenEstimate
            })
            compressionMetadata = {
              status: 'excluded',
              degradedReason: exclusionReason,
              ...snapshotMetadata
            }
          } else {
            const itemCount = items.length
            addItem({
              sourceType: 'summary',
              sourceId: snapshot.id,
              reason: 'validated compression snapshot',
              content: summary,
              tokenEstimate: summaryTokenEstimate,
              metadata: snapshotMetadata
            })
            compressionMetadata = {
              status: items.length > itemCount ? 'included' : 'pruned',
              ...snapshotMetadata
            }
          }
        } else if (input.session.summary && !containsSecret(input.session.summary)) {
          addItem({
            sourceType: 'summary',
            sourceId: input.session.id,
            reason: 'validated legacy session summary',
            content: input.session.summary,
            tokenEstimate: estimateContextTokens(input.session.summary)
          })
          compressionMetadata = { status: 'legacy' }
        }
      } catch {
        compressionMetadata = {
          status: 'degraded',
          degradedReason: 'snapshot-read-failed'
        }
      }
    }

    if (includeHistory && (input.scope === 'session' || input.scope === 'retrieval')) {
      for (const turn of await this.listRecentTurns(input.session.id, 6)) {
        if (turn.id === input.turn.id) continue
        addItem({
          sourceType: 'recent_turn',
          sourceId: turn.id,
          reason: 'explicit session continuation',
          content: turn.content,
          tokenEstimate: turn.tokenEstimate,
          metadata: { role: turn.role }
        })
      }
    }

    if (includeHistory && (input.scope === 'session' || input.scope === 'retrieval')) {
      for (const memory of await this.listUsableMemories(input.session.id)) {
        addItem({
          sourceType: 'memory',
          sourceId: memory.id,
          reason: `usable ${memory.scope} memory`,
          content: memory.summary || memory.content,
          tokenEstimate: estimateContextTokens(memory.summary || memory.content)
        })
      }
    }

    if (input.scope === 'retrieval') {
      const retrieval = await localKnowledgeEngine.buildContext({
        query: input.turn.content,
        tokenBudget: Math.max(1, input.tokenBudget - tokenEstimate),
        maxChunks: 4,
        dedupe: true
      })
      retrievalMetadata = {
        status: retrieval.status,
        degradedReason: retrieval.degradedReason,
        chunkCount: retrieval.chunks.length,
        citationCount: retrieval.citations.length
      }
      for (const hit of retrieval.chunks) {
        addItem({
          sourceType: 'retrieval',
          sourceId: hit.chunk.id,
          reason: `local knowledge match: ${hit.document.title}`,
          content: hit.chunk.content,
          tokenEstimate: hit.chunk.tokenEstimate,
          metadata: {
            citation: hit.citation,
            documentId: hit.document.id,
            sourceType: hit.document.sourceType,
            sourceUri: hit.document.sourceUri,
            status: retrieval.status,
            degradedReason: retrieval.degradedReason
          }
        })
      }
    }

    const packageMetadataBase =
      retrievalMetadata || compressionMetadata || continuationMetadata
        ? {
            ...(input.metadata ?? {}),
            ...(retrievalMetadata ? { retrieval: retrievalMetadata } : {}),
            ...(compressionMetadata ? { compression: compressionMetadata } : {}),
            ...(continuationMetadata ? { continuation: continuationMetadata } : {})
          }
        : input.metadata
    const packageMetadata =
      excluded.length > 0 ? { ...(packageMetadataBase ?? {}), excluded } : packageMetadataBase

    const contextPackage: ContextPackage = {
      id: id('ctxpkg'),
      sessionId: input.session.id,
      scope: input.scope,
      traceId: input.traceId,
      tokenBudget: input.tokenBudget,
      tokenEstimate,
      items,
      metadata: packageMetadata,
      createdAt: Date.now()
    }

    await this.savePackageLog(contextPackage)
    return contextPackage
  }

  async revalidatePackageMemories(contextPackage: ContextPackage): Promise<ContextPackage> {
    const memoryIds = Array.from(
      new Set(
        contextPackage.items
          .filter((item) => item.sourceType === 'memory')
          .map((item) => item.sourceId)
      )
    )
    if (memoryIds.length === 0) {
      return contextPackage
    }

    const client = this.requireClient()
    const now = Date.now()
    const result = await client.execute({
      sql: `
        SELECT m.*, t.memory_id AS tombstone_memory_id
        FROM intelligence_memory_items m
        LEFT JOIN intelligence_memory_tombstones t ON t.memory_id = m.id
        WHERE m.id IN (${memoryIds.map(() => '?').join(', ')})
      `,
      args: memoryIds
    })
    const rowsById = new Map(
      (result.rows as unknown as MemoryRevalidationRow[]).map((row) => [row.id, row])
    )
    const excluded: ContextPackageExcludedItem[] = []
    const items = contextPackage.items.filter((item) => {
      if (item.sourceType !== 'memory') {
        return true
      }
      const row = rowsById.get(item.sourceId)
      const reason = !row
        ? 'memory-missing'
        : row.tombstone_memory_id
          ? 'memory-tombstoned'
          : getMemoryContextExclusionReason(memoryFromRow(row), contextPackage.sessionId, now)
      if (!reason) {
        return true
      }
      excluded.push({
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        reason,
        tokenEstimate: item.tokenEstimate
      })
      return false
    })

    if (excluded.length === 0) {
      return contextPackage
    }

    const revalidatedPackage: ContextPackage = {
      ...contextPackage,
      tokenEstimate: items.reduce((total, item) => total + item.tokenEstimate, 0),
      items,
      metadata: {
        ...(contextPackage.metadata ?? {}),
        excluded: [...readExcludedItems(contextPackage.metadata?.excluded), ...excluded],
        memoryRevalidation: {
          checkedCount: memoryIds.length,
          excludedCount: excluded.length
        }
      }
    }
    await this.updatePackageLog(revalidatedPackage)
    return revalidatedPackage
  }

  private async updatePackageLog(contextPackage: ContextPackage): Promise<void> {
    const client = this.requireClient()
    await this.withDbWrite('intelligence.context.packageLog.revalidate', async () => {
      await client.execute({
        sql: `
          UPDATE intelligence_context_package_logs
          SET token_estimate = ?, items = ?, metadata = ?
          WHERE id = ? AND session_id = ?
        `,
        args: [
          contextPackage.tokenEstimate,
          serializePackageLogItems(contextPackage),
          stringifyJson(contextPackage.metadata),
          contextPackage.id,
          contextPackage.sessionId
        ]
      })
    })
  }

  private async savePackageLog(contextPackage: ContextPackage): Promise<void> {
    const client = this.requireClient()
    await this.withDbWrite('intelligence.context.packageLog', async () => {
      await client.execute({
        sql: `
          INSERT INTO intelligence_context_package_logs
            (id, session_id, scope, trace_id, token_budget, token_estimate, items, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          contextPackage.id,
          contextPackage.sessionId,
          contextPackage.scope,
          contextPackage.traceId ?? null,
          contextPackage.tokenBudget,
          contextPackage.tokenEstimate,
          serializePackageLogItems(contextPackage),
          stringifyJson(contextPackage.metadata),
          contextPackage.createdAt
        ]
      })
    })
  }

  async prepareTurn(input: PrepareContextTurnInput): Promise<PrepareContextTurnResult> {
    if (!input || typeof input.input !== 'string' || !input.input.trim()) {
      throw new Error('Invalid context turn: input is required')
    }

    const now = Date.now()
    const scope = normalizeScope(input)
    const {
      session,
      checkpoint,
      continuation: continuationBoundary
    } = await this.resolveSession(input, scope, now)
    const continuation = continuationBoundary
      ? await this.resolveContinuation(continuationBoundary)
      : undefined
    const turn = await this.saveTurn(session.id, input, now)
    const contextPackage = await this.buildPackage({
      session,
      turn,
      scope,
      tokenBudget: normalizeContextTokenBudget(input.tokenBudget, DEFAULT_TOKEN_BUDGET),
      traceId: input.traceId,
      metadata: input.metadata,
      continuation
    })

    return {
      session,
      turn,
      checkpoint,
      package: contextPackage,
      continuation: continuation?.summary
    }
  }

  async appendAssistantTurn(input: {
    sessionId: string
    content: string
    privacyLevel?: ContextPrivacyLevel
    metadata?: Record<string, unknown>
  }): Promise<ContextTurn> {
    const sessionId = String(input.sessionId || '').trim()
    const content = String(input.content || '').trim()
    if (!sessionId || !content) {
      throw new Error('Invalid assistant context turn: sessionId and content are required')
    }
    return this.saveTurn(
      sessionId,
      {
        input: content,
        privacyLevel: input.privacyLevel,
        metadata: input.metadata
      },
      Date.now(),
      'assistant'
    )
  }

  async createCompressionSnapshot(
    input: CreateCompressionSnapshotInput
  ): Promise<CreateCompressionSnapshotResult> {
    const sessionId = String(input?.sessionId || '').trim()
    if (!sessionId || !Number.isFinite(input?.expectedSessionUpdatedAt))
      throw compressionSnapshotError('request')
    const normalized = normalizeCompressionSnapshotDraft(input.snapshot)
    const summary = renderCompressionSnapshot(normalized)
    if (containsSecret(summary)) throw compressionSnapshotError('secret-content')
    if (normalized.metadata.privacyLevel && normalized.metadata.privacyLevel !== 'normal')
      throw compressionSnapshotError('privacy-blocked')
    if (normalized.metadata.factState === 'user-rejected')
      throw compressionSnapshotError('fact-rejected')
    if (normalized.metadata.confidence !== undefined && normalized.metadata.confidence < 0.5)
      throw compressionSnapshotError('low-confidence')

    const client = this.requireClient()
    return this.withDbWrite('intelligence.context.createCompressionSnapshot', async () => {
      await client.execute('BEGIN IMMEDIATE')
      try {
        const sessionResult = await client.execute({
          sql: 'SELECT * FROM intelligence_context_sessions WHERE id = ? LIMIT 1',
          args: [sessionId]
        })
        const session = sessionResult.rows[0] as unknown as SessionRow | undefined
        if (!session || session.status === 'expired') throw compressionSnapshotError('session')
        if (session.updated_at !== input.expectedSessionUpdatedAt) {
          await client.execute('ROLLBACK')
          return {
            status: 'degraded',
            degradedReason: 'cas-conflict',
            sessionUpdatedAt: session.updated_at
          }
        }

        const endpointsResult = await client.execute({
          sql: `
            SELECT id, privacy_level, created_at
            FROM intelligence_context_turns
            WHERE session_id = ? AND (id = ? OR id = ?)
          `,
          args: [sessionId, normalized.sourceTurnFrom, normalized.sourceTurnTo]
        })
        const endpoints = endpointsResult.rows as unknown as CompressionSourceTurnRow[]
        const sourceFrom = endpoints.find((turn) => turn.id === normalized.sourceTurnFrom)
        const sourceTo = endpoints.find((turn) => turn.id === normalized.sourceTurnTo)
        if (!sourceFrom || !sourceTo) throw compressionSnapshotError('source-range-missing')
        if (sourceFrom.id !== sourceTo.id && sourceFrom.created_at >= sourceTo.created_at)
          throw compressionSnapshotError('source-range-order')

        const rangeResult = await client.execute({
          sql: `
            SELECT id, privacy_level, created_at
            FROM intelligence_context_turns
            WHERE session_id = ? AND created_at >= ? AND created_at <= ?
            ORDER BY created_at ASC, id ASC
          `,
          args: [sessionId, sourceFrom.created_at, sourceTo.created_at]
        })
        const sourceTurns = rangeResult.rows as unknown as CompressionSourceTurnRow[]
        if (sourceTurns.length === 0 || sourceTurns.some((turn) => turn.privacy_level !== 'normal'))
          throw compressionSnapshotError('source-range-privacy')

        const now = Date.now()
        const checkpointId = id('ctxcp')
        const snapshot: CompressionSnapshot = {
          id: id('ctxsnap'),
          sessionId,
          goal: normalized.goal,
          currentState: normalized.currentState,
          decisions: normalized.decisions,
          constraints: normalized.constraints,
          artifacts: normalized.artifacts,
          openQuestions: normalized.openQuestions,
          sourceTurnFrom: normalized.sourceTurnFrom,
          sourceTurnTo: normalized.sourceTurnTo,
          metadata: { ...normalized.metadata, checkpointId },
          createdAt: now
        }
        const checkpoint: ContextCheckpoint = {
          id: checkpointId,
          sessionId,
          type: 'compression_snapshot',
          reason: 'compression-snapshot-created',
          summary: (normalized.currentState ?? normalized.goal ?? summary).slice(0, 240),
          contextScope: 'session',
          metadata: {
            snapshotId: snapshot.id,
            sourceTurnFrom: snapshot.sourceTurnFrom,
            sourceTurnTo: snapshot.sourceTurnTo
          },
          createdAt: now
        }
        const sessionUpdatedAt = Math.max(now, session.updated_at + 1)
        const sessionMetadata = {
          ...parseJsonRecord(session.metadata),
          compressionSnapshot: {
            id: snapshot.id,
            checkpointId,
            sourceTurnFrom: snapshot.sourceTurnFrom,
            sourceTurnTo: snapshot.sourceTurnTo,
            updatedAt: sessionUpdatedAt
          }
        }

        await client.execute({
          sql: `
            INSERT INTO intelligence_compression_snapshots
              (id, session_id, goal, current_state, decisions, constraints, artifacts,
               open_questions, source_turn_from, source_turn_to, metadata, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            snapshot.id,
            snapshot.sessionId,
            snapshot.goal ?? null,
            snapshot.currentState ?? null,
            JSON.stringify(snapshot.decisions),
            JSON.stringify(snapshot.constraints),
            JSON.stringify(snapshot.artifacts),
            JSON.stringify(snapshot.openQuestions),
            snapshot.sourceTurnFrom ?? null,
            snapshot.sourceTurnTo ?? null,
            JSON.stringify(snapshot.metadata),
            snapshot.createdAt
          ]
        })
        await client.execute({
          sql: `
            INSERT INTO intelligence_context_checkpoints
              (id, session_id, type, reason, summary, context_scope, metadata, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            checkpoint.id,
            checkpoint.sessionId,
            checkpoint.type,
            checkpoint.reason,
            checkpoint.summary ?? null,
            checkpoint.contextScope,
            stringifyJson(checkpoint.metadata),
            checkpoint.createdAt
          ]
        })
        const casResult = await client.execute({
          sql: `
            UPDATE intelligence_context_sessions
            SET summary = ?, metadata = ?, updated_at = ?
            WHERE id = ? AND updated_at = ?
          `,
          args: [
            summary,
            JSON.stringify(sessionMetadata),
            sessionUpdatedAt,
            sessionId,
            input.expectedSessionUpdatedAt
          ]
        })
        if (Number(casResult.rowsAffected ?? 0) !== 1) {
          await client.execute('ROLLBACK')
          return {
            status: 'degraded',
            degradedReason: 'cas-conflict',
            sessionUpdatedAt: session.updated_at
          }
        }

        await client.execute('COMMIT')
        return {
          status: 'created',
          snapshot,
          checkpoint,
          sessionUpdatedAt
        }
      } catch (error) {
        await client.execute('ROLLBACK').catch(() => undefined)
        throw error
      }
    })
  }

  async listCompressionSnapshots(
    input: ListCompressionSnapshotsInput
  ): Promise<ListCompressionSnapshotsResult> {
    const sessionId = String(input?.sessionId || '').trim()
    if (!sessionId) throw compressionSnapshotError('session-query')
    const limit = Math.min(50, Math.max(1, Math.floor(input.limit ?? 20)))
    const client = this.requireClient()
    const result = await client.execute({
      sql: `
        SELECT id, session_id, goal, current_state, decisions, constraints, artifacts,
          open_questions, source_turn_from, source_turn_to, metadata, created_at
        FROM intelligence_compression_snapshots
        WHERE session_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `,
      args: [sessionId, limit]
    })
    return {
      snapshots: (result.rows as unknown as CompressionSnapshotRow[]).map(
        compressionSnapshotFromRow
      )
    }
  }

  async getLatestCompressionSnapshot(sessionId: string): Promise<CompressionSnapshot | null> {
    const result = await this.listCompressionSnapshots({ sessionId, limit: 1 })
    return result.snapshots[0] ?? null
  }

  async listPackageLogs(input: ListContextPackageLogsInput): Promise<ListContextPackageLogsResult> {
    if (!input?.sessionId && !input?.traceId) {
      throw new Error('Invalid context package log query: sessionId or traceId is required')
    }

    const client = this.requireClient()
    const limit = Math.min(50, Math.max(1, Math.floor(input.limit ?? 20)))
    const where: string[] = []
    const args: Array<string | number> = []
    if (input.sessionId) {
      where.push('session_id = ?')
      args.push(input.sessionId)
    }
    if (input.traceId) {
      where.push('trace_id = ?')
      args.push(input.traceId)
    }
    args.push(limit)

    const result = await client.execute({
      sql: `
        SELECT id, session_id, scope, trace_id, token_budget, token_estimate, items, metadata, created_at
        FROM intelligence_context_package_logs
        WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT ?
      `,
      args
    })

    return {
      logs: (result.rows as unknown as PackageLogRow[]).map(packageLogFromRow)
    }
  }

  async listCheckpoints(input: ListContextCheckpointsInput): Promise<ListContextCheckpointsResult> {
    const sessionId = String(input?.sessionId || '').trim()
    if (!sessionId) {
      throw new Error('Invalid context checkpoint query: sessionId is required')
    }

    const client = this.requireClient()
    const limit = Math.min(50, Math.max(1, Math.floor(input.limit ?? 20)))
    const where = ['session_id = ?']
    const args: Array<string | number> = [sessionId]
    if (input.type) {
      where.push('type = ?')
      args.push(input.type)
    }
    args.push(limit)

    const result = await client.execute({
      sql: `
        SELECT id, session_id, type, reason, summary, context_scope, metadata, created_at
        FROM intelligence_context_checkpoints
        WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT ?
      `,
      args
    })

    return {
      checkpoints: (result.rows as unknown as CheckpointRow[]).map(checkpointFromRow)
    }
  }

  async listMemories(input: ListMemoriesInput = {}): Promise<ListMemoriesResult> {
    const client = this.requireClient()
    const limit = Math.min(100, Math.max(1, Math.floor(input.limit ?? 50)))
    const offset = Math.max(0, Math.floor(input.offset ?? 0))
    const status = input.status ?? 'enabled'
    const where = ['m.privacy_level = ?', 't.memory_id IS NULL']
    const args: Array<string | number> = ['normal']

    if (status === 'enabled') {
      where.push('m.enabled = 1')
    } else if (status === 'disabled') {
      where.push('m.enabled = 0')
    }
    if (input.scope) {
      where.push('m.scope = ?')
      args.push(input.scope)
    }
    if (input.type) {
      where.push('m.type = ?')
      args.push(input.type)
    }

    const query = String(input.query || '')
      .trim()
      .slice(0, 200)
    if (query) {
      const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`
      where.push(`(
        m.content LIKE ? ESCAPE '\\'
        OR m.summary LIKE ? ESCAPE '\\'
        OR m.tags LIKE ? ESCAPE '\\'
      )`)
      args.push(pattern, pattern, pattern)
    }
    args.push(limit + 1, offset)

    const result = await client.execute({
      sql: `
        SELECT m.*,
          (
            SELECT replaced.memory_id
            FROM intelligence_memory_tombstones replaced
            WHERE replaced.reason = 'replaced-by:' || m.id
            ORDER BY replaced.created_at DESC
            LIMIT 1
          ) AS replaces_memory_id
        FROM intelligence_memory_items m
        LEFT JOIN intelligence_memory_tombstones t ON t.memory_id = m.id
        WHERE ${where.join(' AND ')}
        ORDER BY m.updated_at DESC, m.id ASC
        LIMIT ? OFFSET ?
      `,
      args
    })

    const rows = result.rows as unknown as MemoryRow[]
    return {
      memories: rows.slice(0, limit).map(memoryFromRow),
      offset,
      limit,
      hasMore: rows.length > limit
    }
  }

  async saveMemory(input: MemoryUpsertInput): Promise<MemoryItem> {
    const memory = createMemoryItem(input)
    const client = this.requireClient()

    await this.withDbWrite('intelligence.context.saveMemory', async () => {
      await this.persistMemory(client, memory, true)
    })

    return memory
  }

  async replaceMemory(input: ReplaceMemoryInput): Promise<ReplaceMemoryResult> {
    const memoryId = String(input.memoryId || '').trim()
    if (!memoryId || !Number.isFinite(input.expectedUpdatedAt)) {
      throw new Error('Invalid memory replacement request')
    }

    const evaluation = this.evaluateMemory(input.replacement)
    if (
      evaluation.status !== 'suggested' ||
      !evaluation.candidate ||
      !evaluation.fingerprint ||
      evaluation.fingerprint !== input.evaluationFingerprint
    ) {
      throw new Error('MEMORY_REPLACE_EVALUATION_MISMATCH')
    }

    const now = Date.now()
    const replacement = createMemoryItem(
      {
        ...input.replacement,
        type: evaluation.candidate.type,
        scope: evaluation.candidate.scope,
        summary: evaluation.candidate.summary,
        tags: evaluation.candidate.tags,
        confidence: evaluation.candidate.confidence,
        sourceSessionId: evaluation.candidate.sourceSessionId,
        sourceTurnId: evaluation.candidate.sourceTurnId,
        privacyLevel: evaluation.candidate.privacyLevel,
        ttl: evaluation.candidate.ttl,
        enabled: true
      },
      now,
      id('mem')
    )
    replacement.replacesMemoryId = memoryId
    const tombstone: MemoryTombstone = {
      id: id('memdel'),
      memoryId,
      reason: `replaced-by:${replacement.id}`,
      createdAt: now
    }
    const client = this.requireClient()

    await this.withDbWrite('intelligence.context.replaceMemory', async () => {
      await client.execute('BEGIN IMMEDIATE')
      try {
        const currentResult = await client.execute({
          sql: `
            SELECT m.*
            FROM intelligence_memory_items m
            LEFT JOIN intelligence_memory_tombstones t ON t.memory_id = m.id
            WHERE m.id = ? AND m.privacy_level = 'normal' AND t.memory_id IS NULL
            LIMIT 1
          `,
          args: [memoryId]
        })
        const current = currentResult.rows[0] as unknown as MemoryRow | undefined
        if (!current || current.updated_at !== input.expectedUpdatedAt) {
          throw new Error('MEMORY_REPLACE_CONFLICT')
        }

        await this.persistMemory(client, replacement, false)
        await client.execute({
          sql: 'UPDATE intelligence_memory_items SET enabled = 0, updated_at = ? WHERE id = ?',
          args: [now, memoryId]
        })
        await client.execute({
          sql: `
            INSERT INTO intelligence_memory_tombstones (id, memory_id, reason, created_at)
            VALUES (?, ?, ?, ?)
          `,
          args: [tombstone.id, tombstone.memoryId, tombstone.reason, tombstone.createdAt]
        })
        await client.execute('COMMIT')
      } catch (error) {
        await client.execute('ROLLBACK').catch(() => undefined)
        throw error
      }
    })

    return { memory: replacement, tombstone }
  }

  async setMemoryEnabled(memoryId: string, enabled: boolean): Promise<SetMemoryEnabledResult> {
    const normalizedMemoryId = String(memoryId || '').trim()
    if (!normalizedMemoryId) {
      throw new Error('Invalid memory update: memoryId is required')
    }

    const client = this.requireClient()
    const updatedAt = Date.now()
    await this.withDbWrite('intelligence.context.setMemoryEnabled', async () => {
      await client.execute({
        sql: `
          UPDATE intelligence_memory_items
          SET enabled = ?, updated_at = ?
          WHERE id = ?
            AND privacy_level = 'normal'
            AND NOT EXISTS (
              SELECT 1
              FROM intelligence_memory_tombstones t
              WHERE t.memory_id = intelligence_memory_items.id
            )
        `,
        args: [enabled ? 1 : 0, updatedAt, normalizedMemoryId]
      })
    })

    return {
      memoryId: normalizedMemoryId,
      enabled,
      updatedAt
    }
  }

  evaluateMemory(input: EvaluateMemoryInput): EvaluateMemoryResult {
    const content = String(input.content || '').trim()
    if (!content) {
      return {
        status: 'rejected',
        reason: 'empty_content'
      }
    }

    if (optsOutOfMemory(content)) {
      return {
        status: 'rejected',
        reason: 'user_opt_out'
      }
    }

    const privacyLevel = input.privacyLevel ?? (containsSecret(content) ? 'secret' : 'normal')
    if (privacyLevel === 'secret' || containsSecret(content)) {
      return {
        status: 'rejected',
        reason: 'secret_detected'
      }
    }

    if (privacyLevel === 'sensitive') {
      return {
        status: 'needs_review',
        reason: 'sensitive_content'
      }
    }

    const candidate: MemoryPolicyCandidate = {
      type: input.type ?? 'temporary',
      scope: input.scope ?? 'session',
      summary: normalizeMemorySummary(input, content),
      tags: normalizeMemoryTags(input.tags),
      confidence: clampConfidence(input.confidence),
      sourceSessionId: input.sourceSessionId,
      sourceTurnId: input.sourceTurnId,
      privacyLevel,
      ttl: input.ttl
    }
    return {
      status: 'suggested',
      reason: 'explicit_memory_candidate',
      candidate,
      fingerprint: memoryEvaluationFingerprint(content, candidate)
    }
  }

  async deleteMemory(memoryId: string, reason = 'user-delete'): Promise<MemoryTombstone> {
    if (!memoryId) {
      throw new Error('Invalid memory delete: memoryId is required')
    }
    const client = this.requireClient()
    const tombstone: MemoryTombstone = {
      id: id('memdel'),
      memoryId,
      reason,
      createdAt: Date.now()
    }

    await this.withDbWrite('intelligence.context.deleteMemory', async () => {
      await client.execute({
        sql: 'UPDATE intelligence_memory_items SET enabled = 0, updated_at = ? WHERE id = ?',
        args: [tombstone.createdAt, memoryId]
      })
      await client.execute({
        sql: `
          INSERT INTO intelligence_memory_tombstones (id, memory_id, reason, created_at)
          VALUES (?, ?, ?, ?)
        `,
        args: [tombstone.id, memoryId, tombstone.reason, tombstone.createdAt]
      })
    })

    log.info('Memory tombstone written', { meta: { memoryId } })
    return tombstone
  }
}

export const contextHygieneService = new ContextHygieneService()
