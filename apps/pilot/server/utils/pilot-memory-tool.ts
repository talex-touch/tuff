import type { StructuredTool } from '@langchain/core/tools'
import type { H3Event } from 'h3'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { listPilotMemoryFactsByUser, type PilotMemoryFactRecord } from './pilot-memory-facts'

const MEMORY_TOOL_CANDIDATE_LIMIT = 50
const DEFAULT_MEMORY_TOOL_LIMIT = 5
const MAX_MEMORY_TOOL_LIMIT = 10

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MEMORY_TOOL_LIMIT
  }
  return Math.max(1, Math.min(Math.floor(parsed), MAX_MEMORY_TOOL_LIMIT))
}

function normalizeTime(value: string): number {
  const stamp = Date.parse(value)
  return Number.isFinite(stamp) ? stamp : 0
}

function tokenizeQuery(query: string): string[] {
  const normalized = normalizeText(query).toLowerCase()
  if (!normalized) {
    return []
  }

  const matches = normalized.match(/[a-z0-9]{2,}|[\u4e00-\u9fa5]{1,12}/g) || []
  return Array.from(new Set(matches))
}

function isNameLookup(query: string): boolean {
  return /我叫什?么|我的名字|怎么称呼我|我是谁|what(?:'s| is) my name|who am i|call me/i.test(query)
}

function scoreMemoryFact(fact: PilotMemoryFactRecord, query: string, tokens: string[]): number {
  const normalizedQuery = normalizeText(query).toLowerCase()
  if (!normalizedQuery) {
    return 0
  }

  const haystack = `${normalizeText(fact.key)} ${normalizeText(fact.value)}`.toLowerCase()
  let score = 0

  if (haystack.includes(normalizedQuery)) {
    score += 40
  }

  for (const token of tokens) {
    if (!token) {
      continue
    }
    if (haystack.includes(token)) {
      score += token.length >= 4 ? 12 : 8
    }
  }

  if (isNameLookup(normalizedQuery)) {
    if (normalizeText(fact.key).toLowerCase().includes('name')) {
      score += 80
    }
    if (/(名字|姓名|称呼|name|叫)/i.test(fact.value)) {
      score += 32
    }
  }

  return score
}

function pickMemoryFacts(facts: PilotMemoryFactRecord[], query: string, limit: number): PilotMemoryFactRecord[] {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) {
    return facts
      .slice()
      .sort((left, right) => normalizeTime(right.createdAt) - normalizeTime(left.createdAt))
      .slice(0, limit)
  }

  const tokens = tokenizeQuery(normalizedQuery)
  const ranked = facts
    .map(fact => ({
      fact,
      score: scoreMemoryFact(fact, normalizedQuery, tokens),
      createdAt: normalizeTime(fact.createdAt),
    }))
    .sort((left, right) => right.score - left.score || right.createdAt - left.createdAt)

  const matched = ranked.filter(item => item.score > 0)
  const fallback = ranked.filter(item => item.score <= 0)
  const selected = (matched.length > 0 ? [...matched, ...fallback] : ranked)
    .slice(0, limit)
    .map(item => item.fact)

  return selected
}

function formatMemoryToolResult(query: string, facts: PilotMemoryFactRecord[]): string {
  if (facts.length <= 0) {
    return 'No stored memory was found for this user.'
  }

  const lines = ['[Pilot Memory Lookup]']
  const normalizedQuery = normalizeText(query)
  if (normalizedQuery) {
    lines.push(`Query: ${normalizedQuery}`)
  }
  lines.push(`Returned memories: ${facts.length}`)
  lines.push('')

  for (const [index, fact] of facts.entries()) {
    const createdAt = normalizeText(fact.createdAt)
    lines.push(`${index + 1}. ${fact.value}${createdAt ? ` (added: ${createdAt})` : ''}`)
  }

  return lines.join('\n')
}

export function createPilotGetMemoryTool(event: H3Event, userId: string): StructuredTool {
  return tool(async ({ query, limit }) => {
    const facts = await listPilotMemoryFactsByUser(event, userId, {
      limit: MEMORY_TOOL_CANDIDATE_LIMIT,
    })

    const selectedFacts = pickMemoryFacts(
      facts,
      normalizeText(query),
      normalizeLimit(limit),
    )

    return formatMemoryToolResult(normalizeText(query), selectedFacts)
  }, {
    name: 'getmemory',
    description: 'Retrieve stored long-term memory facts for the current user when personalized context is needed.',
    schema: z.object({
      query: z.string().trim().optional().describe('What user memory you want to look up, for example name, identity, preferences, habits, devices, or city.'),
      limit: z.number().int().min(1).max(MAX_MEMORY_TOOL_LIMIT).optional().describe('Maximum number of memory facts to return.'),
    }),
  })
}
