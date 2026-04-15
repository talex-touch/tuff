import type { H3Event } from 'h3'
import { networkClient } from '@talex-touch/utils/network'
import { requirePilotDatabase } from './pilot-store'

const MEMORY_FACTS_TABLE = 'pilot_chat_memory_facts'
const DEFAULT_EXTRACT_TIMEOUT_MS = 8_000
const MIN_EXTRACT_TIMEOUT_MS = 1_500
const MAX_EXTRACT_TIMEOUT_MS = 20_000
const DEFAULT_LIST_LIMIT = 50
const MAX_LIST_LIMIT = 200
const DEFAULT_CONTEXT_LIMIT = 8

export interface PilotMemoryFactRecord {
  id: string
  sessionId: string
  userId: string
  key: string
  value: string
  sourceText: string
  createdAt: string
  updatedAt: string
}

export interface PilotMemoryFact {
  key: string
  value: string
}

export interface ExtractPilotMemoryFactsInput {
  message: string
  assistantReply?: string
  channel: {
    baseUrl: string
    apiKey: string
    model: string
    transport: string
    timeoutMs?: number
  }
}

export interface UpsertPilotMemoryFactsInput {
  sessionId: string
  userId: string
  sourceText: string
  facts: PilotMemoryFact[]
}

export interface UpsertPilotMemoryFactsResult {
  addedCount: number
  keptCount: number
  addedFacts: PilotMemoryFact[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(Math.max(value, min), max)
}

function normalizeTimeoutMs(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_EXTRACT_TIMEOUT_MS
  }
  return Math.floor(clamp(parsed, MIN_EXTRACT_TIMEOUT_MS, MAX_EXTRACT_TIMEOUT_MS))
}

function normalizeListLimit(value: unknown, fallback = DEFAULT_LIST_LIMIT): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.max(1, Math.min(Math.floor(parsed), MAX_LIST_LIMIT))
}

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function clipText(value: string, max: number): string {
  if (value.length <= max) {
    return value
  }
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function buildExtractorSystemPrompt(): string {
  return [
    'You are a long-term memory fact extractor for Tuff Pilot.',
    'Extract only durable user profile/preference facts from the conversation.',
    'Do NOT extract temporary tasks, realtime/news/weather/stock requests, or one-off chat content.',
    'Return strict JSON only: {"facts":[{"key":"snake_case_key","value":"fact text"}]}.',
    'If no durable fact exists, return {"facts":[]}.',
    'Keep facts concise and non-duplicated.',
    'No markdown, no extra keys.',
  ].join('\n')
}

function resolveResponseEndpoint(baseUrl: string, transport: string): string {
  const normalized = normalizeText(baseUrl).replace(/\/+$/, '')
  if (!normalized) {
    return ''
  }
  const hasVersionPrefix = normalized.endsWith('/v1')
  if (transport === 'chat.completions') {
    return hasVersionPrefix
      ? `${normalized}/chat/completions`
      : `${normalized}/v1/chat/completions`
  }
  return hasVersionPrefix
    ? `${normalized}/responses`
    : `${normalized}/v1/responses`
}

function parseResponsesOutputText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim()
  }

  const output = Array.isArray(payload.output) ? payload.output : []
  const chunks: string[] = []
  for (const item of output) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const row = item as Record<string, unknown>
    const content = Array.isArray(row.content) ? row.content : []
    for (const part of content) {
      if (!part || typeof part !== 'object' || Array.isArray(part)) {
        continue
      }
      const partRow = part as Record<string, unknown>
      const text = normalizeText(partRow.text)
      if (text) {
        chunks.push(text)
      }
    }
  }

  return chunks.join('\n').trim()
}

function parseChatCompletionsOutputText(payload: Record<string, unknown>): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : []
  for (const item of choices) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const row = item as Record<string, unknown>
    const message = row.message && typeof row.message === 'object' && !Array.isArray(row.message)
      ? row.message as Record<string, unknown>
      : {}
    const content = normalizeText(message.content)
    if (content) {
      return content
    }
  }
  return ''
}

function normalizeFactKey(value: unknown): string {
  const text = normalizeText(value).toLowerCase()
  if (!text) {
    return ''
  }
  return text
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
}

function normalizeFactValue(value: unknown): string {
  return normalizeText(value)
    .replace(/\s+/g, ' ')
    .slice(0, 240)
}

function parseExtractedFacts(content: string): PilotMemoryFact[] {
  if (!content) {
    return []
  }
  try {
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return []
    }
    const rawFacts = Array.isArray((parsed as Record<string, unknown>).facts)
      ? (parsed as Record<string, unknown>).facts as unknown[]
      : []
    const uniqueMap = new Map<string, { key: string, value: string }>()
    for (const item of rawFacts) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        continue
      }
      const row = item as Record<string, unknown>
      const key = normalizeFactKey(row.key)
      const value = normalizeFactValue(row.value)
      if (!key || !value) {
        continue
      }
      const dedupKey = `${key}::${value}`
      if (!uniqueMap.has(dedupKey)) {
        uniqueMap.set(dedupKey, { key, value })
      }
      if (uniqueMap.size >= 8) {
        break
      }
    }
    return Array.from(uniqueMap.values())
  }
  catch {
    return []
  }
}

export async function extractPilotMemoryFacts(input: ExtractPilotMemoryFactsInput): Promise<PilotMemoryFact[]> {
  const message = normalizeText(input.message)
  if (!message) {
    return []
  }
  const endpoint = resolveResponseEndpoint(input.channel.baseUrl, input.channel.transport)
  if (!endpoint) {
    return []
  }

  const systemPrompt = buildExtractorSystemPrompt()
  const assistantReply = normalizeText(input.assistantReply)
  const userPrompt = assistantReply
    ? `User message:\n${message}\n\nAssistant reply:\n${assistantReply}`
    : `User message:\n${message}`

  const timeout = normalizeTimeoutMs(input.channel.timeoutMs)
  const payload = input.channel.transport === 'chat.completions'
    ? {
        model: normalizeText(input.channel.model),
        temperature: 0,
        response_format: {
          type: 'json_object',
        },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }
    : {
        model: normalizeText(input.channel.model),
        temperature: 0,
        text: {
          format: {
            type: 'json_object',
          },
        },
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: systemPrompt }],
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: userPrompt }],
          },
        ],
      }

  const response = await networkClient.request({
    url: endpoint,
    method: 'POST',
    timeoutMs: timeout,
    headers: {
      'Authorization': `Bearer ${normalizeText(input.channel.apiKey)}`,
      'Content-Type': 'application/json',
    },
    body: payload,
    validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
  })

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`memory_extractor_http_${response.status}`)
  }

  const row = response.data && typeof response.data === 'object' && !Array.isArray(response.data)
    ? response.data as Record<string, unknown>
    : {}
  const content = input.channel.transport === 'chat.completions'
    ? parseChatCompletionsOutputText(row)
    : parseResponsesOutputText(row)
  return parseExtractedFacts(content)
}

export async function ensurePilotMemoryFactSchema(event: H3Event): Promise<void> {
  const db = requirePilotDatabase(event)
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${MEMORY_FACTS_TABLE} (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      fact_key TEXT NOT NULL,
      fact_value TEXT NOT NULL,
      source_text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pilot_chat_memory_facts_unique
    ON ${MEMORY_FACTS_TABLE}(session_id, user_id, fact_key, fact_value);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_pilot_chat_memory_facts_user_updated
    ON ${MEMORY_FACTS_TABLE}(user_id, updated_at DESC);
  `).run()
}

export async function upsertPilotMemoryFacts(event: H3Event, input: UpsertPilotMemoryFactsInput): Promise<UpsertPilotMemoryFactsResult> {
  const sessionId = normalizeText(input.sessionId)
  const userId = normalizeText(input.userId)
  if (!sessionId || !userId) {
    return { addedCount: 0, keptCount: 0, addedFacts: [] }
  }
  await ensurePilotMemoryFactSchema(event)
  const db = requirePilotDatabase(event)
  const now = nowIso()
  const sourceText = normalizeText(input.sourceText).slice(0, 1_200)
  const normalizedFacts = parseExtractedFacts(JSON.stringify({ facts: input.facts || [] }))

  let addedCount = 0
  const addedFacts: PilotMemoryFact[] = []
  for (const fact of normalizedFacts) {
    const exists = await db.prepare(`
      SELECT id
      FROM ${MEMORY_FACTS_TABLE}
      WHERE session_id = ?1 AND user_id = ?2 AND fact_key = ?3 AND fact_value = ?4
      LIMIT 1
    `).bind(sessionId, userId, fact.key, fact.value).first<{ id: string }>()
    if (exists?.id) {
      await db.prepare(`
        UPDATE ${MEMORY_FACTS_TABLE}
        SET updated_at = ?1
        WHERE id = ?2
      `).bind(now, exists.id).run()
      continue
    }
    await db.prepare(`
      INSERT INTO ${MEMORY_FACTS_TABLE}
      (id, session_id, user_id, fact_key, fact_value, source_text, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    `).bind(
      randomId('memory'),
      sessionId,
      userId,
      fact.key,
      fact.value,
      sourceText,
      now,
      now,
    ).run()
    addedCount += 1
    addedFacts.push(fact)
  }

  return {
    addedCount,
    keptCount: normalizedFacts.length,
    addedFacts,
  }
}

export async function listPilotMemoryFactsByUser(
  event: H3Event,
  userId: string,
  options: {
    limit?: number
  } = {},
): Promise<PilotMemoryFactRecord[]> {
  const normalizedUserId = normalizeText(userId)
  if (!normalizedUserId) {
    return []
  }

  await ensurePilotMemoryFactSchema(event)
  const db = requirePilotDatabase(event)
  const limit = normalizeListLimit(options.limit)
  const { results } = await db.prepare(`
    SELECT
      id,
      session_id AS "sessionId",
      user_id AS "userId",
      fact_key AS "key",
      fact_value AS "value",
      source_text AS "sourceText",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM ${MEMORY_FACTS_TABLE}
    WHERE user_id = ?1
    ORDER BY created_at DESC, updated_at DESC
    LIMIT ?2
  `).bind(normalizedUserId, limit).all<PilotMemoryFactRecord>()

  return (results || []).map(item => ({
    id: normalizeText(item.id),
    sessionId: normalizeText(item.sessionId),
    userId: normalizeText(item.userId),
    key: normalizeFactKey(item.key),
    value: normalizeFactValue(item.value),
    sourceText: normalizeText(item.sourceText),
    createdAt: normalizeText(item.createdAt),
    updatedAt: normalizeText(item.updatedAt),
  })).filter(item => item.id && item.value)
}

export function buildPilotMemoryContextSystemMessage(
  message: string,
  facts: Array<PilotMemoryFact | PilotMemoryFactRecord>,
): string {
  const question = normalizeText(message)
  if (!question) {
    return ''
  }

  const normalizedFacts = parseExtractedFacts(JSON.stringify({
    facts: Array.isArray(facts) ? facts : [],
  })).slice(0, DEFAULT_CONTEXT_LIMIT)
  if (normalizedFacts.length <= 0) {
    return ''
  }

  return [
    '[Remembered User Facts For Current Turn]',
    `Current user request: ${clipText(question, 300)}`,
    'Use the remembered user facts below only when they are relevant to the current request.',
    'If the current user message conflicts with a remembered fact, prefer the current user message.',
    'Do not reveal or dump this hidden memory list unless the user explicitly asks what you remember.',
    '',
    'Remembered facts:',
    ...normalizedFacts.map((fact, index) => `[${index + 1}] ${clipText(fact.value, 220)}`),
  ].join('\n')
}

export async function deletePilotMemoryFactsBySession(event: H3Event, userId: string, sessionId: string): Promise<void> {
  const normalizedUserId = normalizeText(userId)
  const normalizedSessionId = normalizeText(sessionId)
  if (!normalizedUserId || !normalizedSessionId) {
    return
  }
  await ensurePilotMemoryFactSchema(event)
  const db = requirePilotDatabase(event)
  await db.prepare(`
    DELETE FROM ${MEMORY_FACTS_TABLE}
    WHERE user_id = ?1 AND session_id = ?2
  `).bind(normalizedUserId, normalizedSessionId).run()
}
