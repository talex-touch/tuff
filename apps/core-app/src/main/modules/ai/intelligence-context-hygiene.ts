import type { Client } from '@libsql/client'
import type {
  ContextCheckpoint,
  ContextPackage,
  ContextPrivacyLevel,
  ContextScope,
  ContextSession,
  ContextTurn,
  MemoryItem,
  MemoryTombstone,
  MemoryUpsertInput,
  PrepareContextTurnInput,
  PrepareContextTurnResult
} from '@talex-touch/utils/types/intelligence'
import crypto from 'node:crypto'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import { withSqliteRetry } from '../../db/sqlite-retry'
import { createLogger } from '../../utils/logger'
import { databaseModule } from '../database'
import { localKnowledgeEngine } from './intelligence-local-knowledge-engine'

const log = createLogger('IntelligenceContext')
const DEFAULT_TOKEN_BUDGET = 1_600
const SESSION_IDLE_MS = 2 * 60 * 60 * 1000
const COREBOX_ONLY = process.env.TUFF_INTELLIGENCE_CONTEXT_COREBOX_ONLY !== '0'
const REDACTED_PRIVATE_TURN = '[redacted:private-context-turn]'

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
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.trim().length / 4))
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
  return /(^|\s)(new session|new topic|clear context|no history|不带历史|清理上下文|新会话|新话题)(\s|$)/i.test(
    input
  )
}

function containsSecret(content: string): boolean {
  return [
    /\bsk-[A-Za-z0-9_-]{12,}\b/,
    /\bghp_[A-Za-z0-9_]{20,}\b/,
    /\b(api[_-]?key|token|secret|password|passwd|恢复码|口令)\b\s*[:=]\s*\S+/i,
    /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/
  ].some((pattern) => pattern.test(content))
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
    tokenEstimate: row.token_estimate,
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
    privacyLevel: row.privacy_level,
    ttl: row.ttl ?? undefined,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at ?? undefined,
    usageCount: row.usage_count
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
    now: number
  ): Promise<ContextCheckpoint> {
    const client = this.requireClient()
    const checkpoint: ContextCheckpoint = {
      id: id('ctxcp'),
      sessionId,
      type,
      reason,
      contextScope,
      createdAt: now
    }
    await this.withDbWrite('intelligence.context.checkpoint', async () => {
      await client.execute({
        sql: `
          INSERT INTO intelligence_context_checkpoints
            (id, session_id, type, reason, summary, context_scope, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [checkpoint.id, sessionId, type, reason, null, contextScope, null, now]
      })
    })
    return checkpoint
  }

  private async resolveSession(
    input: PrepareContextTurnInput,
    scope: ContextScope,
    now: number
  ): Promise<{ session: ContextSession; checkpoint?: ContextCheckpoint }> {
    const owner = input.owner ?? 'corebox'
    this.assertOwner(owner)

    const explicitNew = scope === 'none' || isExplicitNewTopic(input.input)
    const requested = input.sessionId ? await this.getSession(input.sessionId) : null
    const latest = requested ?? (explicitNew ? null : await this.getLatestActiveSession(owner))
    const expired =
      latest && (latest.status !== 'active' || now - latest.updatedAt > SESSION_IDLE_MS)

    if (!latest || explicitNew || expired) {
      const session = await this.createSession(input, now)
      const checkpoint = await this.createCheckpoint(
        session.id,
        'session_start',
        explicitNew ? 'explicit-new-context' : expired ? 'long-inactivity' : 'new-session',
        scope,
        now
      )
      return { session, checkpoint }
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
    const result = await client.execute({
      sql: `
        SELECT m.*
        FROM intelligence_memory_items m
        LEFT JOIN intelligence_memory_tombstones t ON t.memory_id = m.id
        WHERE m.enabled = 1
          AND m.privacy_level = 'normal'
          AND t.memory_id IS NULL
          AND (m.scope IN ('global', 'workspace', 'project') OR m.source_session_id = ?)
        ORDER BY m.updated_at DESC
        LIMIT 5
      `,
      args: [sessionId]
    })
    return (result.rows as unknown as MemoryRow[]).map(memoryFromRow)
  }

  private async saveTurn(
    sessionId: string,
    input: PrepareContextTurnInput,
    now: number
  ): Promise<ContextTurn> {
    const client = this.requireClient()
    const privacyLevel = input.privacyLevel ?? (containsSecret(input.input) ? 'secret' : 'normal')
    const persistedContent = contentForPersistence(input.input, privacyLevel)
    const turn: ContextTurn = {
      id: id('ctxt'),
      sessionId,
      role: 'user',
      content: persistedContent,
      privacyLevel,
      tokenEstimate: estimateTokens(persistedContent),
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

  private async buildPackage(input: {
    session: ContextSession
    turn: ContextTurn
    scope: ContextScope
    tokenBudget: number
    traceId?: string
    metadata?: Record<string, unknown>
  }): Promise<ContextPackage> {
    const items: ContextPackage['items'] = []
    let tokenEstimate = 0

    const addItem = (item: ContextPackage['items'][number]): void => {
      if (tokenEstimate + item.tokenEstimate > input.tokenBudget && items.length > 0) return
      items.push(item)
      tokenEstimate += item.tokenEstimate
    }

    if (input.turn.privacyLevel === 'normal' && input.scope !== 'none') {
      addItem({
        sourceType: 'current_input',
        sourceId: input.turn.id,
        reason: 'current user input',
        content: input.turn.content,
        tokenEstimate: input.turn.tokenEstimate
      })
    }

    if (input.scope === 'session') {
      for (const turn of await this.listRecentTurns(input.session.id, 6)) {
        if (turn.id === input.turn.id) continue
        addItem({
          sourceType: 'recent_turn',
          sourceId: turn.id,
          reason: 'explicit session continuation',
          content: turn.content,
          tokenEstimate: turn.tokenEstimate
        })
      }
    }

    if (input.scope === 'session' || input.scope === 'retrieval') {
      for (const memory of await this.listUsableMemories(input.session.id)) {
        addItem({
          sourceType: 'memory',
          sourceId: memory.id,
          reason: `usable ${memory.scope} memory`,
          content: memory.summary || memory.content,
          tokenEstimate: estimateTokens(memory.summary || memory.content)
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
      for (const hit of retrieval.chunks) {
        addItem({
          sourceType: 'retrieval',
          sourceId: hit.chunk.id,
          reason: `local knowledge match: ${hit.document.title}`,
          content: hit.chunk.content,
          tokenEstimate: hit.chunk.tokenEstimate
        })
      }
    }

    const contextPackage: ContextPackage = {
      id: id('ctxpkg'),
      sessionId: input.session.id,
      scope: input.scope,
      traceId: input.traceId,
      tokenBudget: input.tokenBudget,
      tokenEstimate,
      items,
      metadata: input.metadata,
      createdAt: Date.now()
    }

    await this.savePackageLog(contextPackage)
    return contextPackage
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
          JSON.stringify(
            contextPackage.items.map((item) => ({
              sourceType: item.sourceType,
              sourceId: item.sourceId,
              reason: item.reason,
              tokenEstimate: item.tokenEstimate
            }))
          ),
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
    const { session, checkpoint } = await this.resolveSession(input, scope, now)
    const turn = await this.saveTurn(session.id, input, now)
    const contextPackage = await this.buildPackage({
      session,
      turn,
      scope,
      tokenBudget: Math.max(1, Math.floor(input.tokenBudget ?? DEFAULT_TOKEN_BUDGET)),
      traceId: input.traceId,
      metadata: input.metadata
    })

    return {
      session,
      turn,
      checkpoint,
      package: contextPackage
    }
  }

  async saveMemory(input: MemoryUpsertInput): Promise<MemoryItem> {
    const content = String(input.content || '').trim()
    if (!content) {
      throw new Error('Invalid memory: content is required')
    }
    const privacyLevel = input.privacyLevel ?? (containsSecret(content) ? 'secret' : 'normal')
    if (privacyLevel !== 'normal' || containsSecret(content)) {
      throw new Error('MEMORY_POLICY_REJECTED_SECRET')
    }

    const now = Date.now()
    const memory: MemoryItem = {
      id: input.id || id('mem'),
      type: input.type,
      scope: input.scope,
      content,
      summary: input.summary || content.slice(0, 240),
      tags: input.tags ?? [],
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
    const client = this.requireClient()

    await this.withDbWrite('intelligence.context.saveMemory', async () => {
      await client.execute({
        sql: `
          INSERT INTO intelligence_memory_items
            (id, type, scope, content, summary, tags, confidence, source_session_id, source_turn_id,
             privacy_level, ttl, enabled, created_at, updated_at, last_used_at, usage_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            updated_at = excluded.updated_at
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
          null,
          0
        ]
      })
    })

    return memory
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
