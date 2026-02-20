/**
 * SearchAgent - 搜索增强智能体
 *
 * 能力:
 * - 语义搜索
 * - 搜索结果排序
 * - 搜索建议生成
 * - 上下文相关搜索
 */

import type { AgentDescriptor, AgentPlanStep, TuffItem, TuffQuery } from '@talex-touch/utils'
import type { AgentExecutionContext, AgentImpl } from '../agent-registry'
import searchEngineCore from '../../../box-tool/search-engine/search-core'
import { agentRegistry } from '../agent-registry'

const SEARCH_AGENT_ID = 'builtin.search-agent'

const descriptor: AgentDescriptor = {
  id: SEARCH_AGENT_ID,
  name: 'Search Agent',
  description: '智能搜索助手，提供语义搜索、智能排序和搜索建议',
  version: '1.0.0',
  capabilities: [
    {
      id: 'search.query',
      name: '智能搜索',
      type: 'query',
      description: '执行智能搜索',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索查询' },
          scope: { type: 'string', description: '搜索范围: files, apps, plugins, all' },
          limit: { type: 'number', description: '最大结果数' },
          filters: {
            type: 'object',
            properties: {
              type: { type: 'string', description: '类型过滤' },
              dateRange: { type: 'object', description: '日期范围' }
            }
          }
        },
        required: ['query']
      },
      outputSchema: {
        type: 'object',
        properties: {
          results: { type: 'array' },
          total: { type: 'number' },
          suggestions: { type: 'array' }
        }
      }
    },
    {
      id: 'search.semantic',
      name: '语义搜索',
      type: 'query',
      description: '基于语义理解的深度搜索',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '自然语言查询' },
          context: { type: 'string', description: '搜索上下文' },
          threshold: { type: 'number', description: '相似度阈值 (0-1)' }
        },
        required: ['query']
      },
      outputSchema: {
        type: 'object',
        properties: {
          results: { type: 'array' },
          interpretation: { type: 'string' }
        }
      }
    },
    {
      id: 'search.suggest',
      name: '搜索建议',
      type: 'query',
      description: '生成搜索建议和补全',
      inputSchema: {
        type: 'object',
        properties: {
          partial: { type: 'string', description: '部分输入' },
          context: { type: 'string', description: '当前上下文' },
          limit: { type: 'number', description: '建议数量' }
        },
        required: ['partial']
      },
      outputSchema: {
        type: 'object',
        properties: {
          suggestions: { type: 'array', items: { type: 'string' } },
          categories: { type: 'array' }
        }
      }
    },
    {
      id: 'search.rank',
      name: '结果排序',
      type: 'action',
      description: '对搜索结果进行智能排序',
      inputSchema: {
        type: 'object',
        properties: {
          results: { type: 'array', description: '待排序结果' },
          criteria: { type: 'string', description: '排序标准: relevance, date, popularity' },
          userContext: { type: 'object', description: '用户上下文' }
        },
        required: ['results']
      },
      outputSchema: {
        type: 'object',
        properties: {
          ranked: { type: 'array' },
          explanation: { type: 'string' }
        }
      }
    }
  ],
  tools: [],
  enabled: true
}

const implementation: AgentImpl = {
  async execute(input: unknown, ctx: AgentExecutionContext): Promise<unknown> {
    const { capability, ...params } = input as { capability: string; [key: string]: unknown }

    switch (capability) {
      case 'search.query':
        return executeQuery(params, ctx)
      case 'search.semantic':
        return executeSemantic(params, ctx)
      case 'search.suggest':
        return executeSuggest(params, ctx)
      case 'search.rank':
        return executeRank(params, ctx)
      default:
        throw new Error(`Unknown capability: ${capability}`)
    }
  },

  async plan(input: unknown, _ctx: AgentExecutionContext): Promise<AgentPlanStep[]> {
    const { goal } = input as { goal: string }
    const steps: AgentPlanStep[] = []

    // Generate plan based on goal
    if (
      goal.includes('搜索') ||
      goal.includes('查找') ||
      goal.includes('search') ||
      goal.includes('find')
    ) {
      steps.push({
        id: 'query',
        toolId: 'search.query',
        input: { query: goal },
        description: '执行搜索查询'
      })
    }

    if (goal.includes('语义') || goal.includes('semantic') || goal.includes('理解')) {
      steps.push({
        id: 'semantic',
        toolId: 'search.semantic',
        input: { query: goal },
        description: '语义搜索'
      })
    }

    if (goal.includes('建议') || goal.includes('suggest') || goal.includes('推荐')) {
      steps.push({
        id: 'suggest',
        toolId: 'search.suggest',
        input: { partial: goal },
        description: '生成搜索建议'
      })
    }

    return steps
  }
}

// ============================================================================
// Capability Implementations
// ============================================================================

async function executeQuery(
  params: Record<string, unknown>,
  _ctx: AgentExecutionContext
): Promise<unknown> {
  const {
    query,
    scope = 'all',
    limit = 20,
    filters
  } = params as {
    query: string
    scope?: string
    limit?: number
    filters?: Record<string, unknown>
  }
  if (!query || !query.trim()) {
    throw new Error('search.query requires a non-empty query')
  }

  const normalizedScope = normalizeScope(scope)
  const scopedQuery = buildScopedQuery(query.trim(), normalizedScope)
  const result = await searchEngineCore.search({ text: scopedQuery } as TuffQuery)
  const mappedResults = normalizeSearchItems(result.items ?? [])
  const filteredResults = applyResultFilters(mappedResults, filters)
  const finalResults = filteredResults.slice(0, Math.max(1, limit))
  const suggestionSet = new Set<string>(generateSuggestions(query))
  for (const item of finalResults.slice(0, 5)) {
    if (typeof item.title === 'string' && item.title.length > 0) {
      suggestionSet.add(item.title)
    }
  }

  return {
    query: query.trim(),
    scope: normalizedScope,
    total: filteredResults.length,
    results: finalResults,
    suggestions: Array.from(suggestionSet).slice(0, 10),
    filters,
    limit: Math.max(1, limit),
    duration: result.duration,
    sessionId: result.sessionId
  }
}

async function executeSemantic(
  params: Record<string, unknown>,
  _ctx: AgentExecutionContext
): Promise<unknown> {
  const {
    query,
    context,
    threshold = 0.4,
    limit = 20
  } = params as {
    query: string
    context?: string
    threshold?: number
    limit?: number
  }
  if (!query || !query.trim()) {
    throw new Error('search.semantic requires a non-empty query')
  }

  const scopedQuery = query.trim()
  const result = await searchEngineCore.search({ text: scopedQuery } as TuffQuery)
  const mapped = normalizeSearchItems(result.items ?? [])
  const tokens = tokenize(`${scopedQuery} ${context ?? ''}`)
  const normalizedThreshold = Math.min(1, Math.max(0, threshold))
  const ranked = mapped
    .map((item) => {
      const semanticScore = computeSemanticScore(tokens, item)
      return {
        ...item,
        semanticScore
      }
    })
    .filter((item) => item.semanticScore >= normalizedThreshold)
    .sort((a, b) => b.semanticScore - a.semanticScore)
    .slice(0, Math.max(1, limit))

  return {
    query: scopedQuery,
    context,
    threshold: normalizedThreshold,
    results: ranked,
    interpretation: buildSemanticInterpretation(scopedQuery, context, ranked.length),
    duration: result.duration,
    sessionId: result.sessionId
  }
}

async function executeSuggest(
  params: Record<string, unknown>,
  _ctx: AgentExecutionContext
): Promise<unknown> {
  const {
    partial,
    context,
    limit = 5
  } = params as {
    partial: string
    context?: string
    limit?: number
  }

  const suggestions = generateSuggestions(partial).slice(0, limit)

  return {
    partial,
    context,
    suggestions,
    categories: ['files', 'apps', 'plugins']
  }
}

async function executeRank(
  params: Record<string, unknown>,
  _ctx: AgentExecutionContext
): Promise<unknown> {
  const {
    results,
    criteria = 'relevance',
    userContext
  } = params as {
    results: unknown[]
    criteria?: string
    userContext?: Record<string, unknown>
  }
  if (!Array.isArray(results)) {
    throw new Error('search.rank requires an array of results')
  }

  const normalizedCriteria = normalizeRankCriteria(criteria)
  const preferredSources = extractPreferredSources(userContext)
  const ranked = [...results].sort((left, right) => {
    const leftSourceBoost = preferredSources.has(getResultSource(left)) ? 0.15 : 0
    const rightSourceBoost = preferredSources.has(getResultSource(right)) ? 0.15 : 0

    if (normalizedCriteria === 'date') {
      return (
        getResultTimestamp(right) + rightSourceBoost - (getResultTimestamp(left) + leftSourceBoost)
      )
    }
    if (normalizedCriteria === 'popularity') {
      return (
        getResultPopularity(right) +
        rightSourceBoost -
        (getResultPopularity(left) + leftSourceBoost)
      )
    }
    return (
      getResultRelevance(right) + rightSourceBoost - (getResultRelevance(left) + leftSourceBoost)
    )
  })

  return {
    ranked,
    criteria: normalizedCriteria,
    userContext,
    explanation: `Results ranked by ${normalizedCriteria}`
  }
}

// ============================================================================
// Helpers
// ============================================================================

function generateSuggestions(query: string): string[] {
  const base = query.toLowerCase().trim()
  if (!base) return []

  return [`${base} 文件`, `${base} 应用`, `${base} 设置`, `打开 ${base}`, `搜索 ${base}`]
}

function normalizeScope(scope?: string): 'files' | 'apps' | 'plugins' | 'all' {
  if (!scope) return 'all'
  const normalized = scope.trim().toLowerCase()
  if (normalized === 'files' || normalized === 'file' || normalized === 'fs') return 'files'
  if (normalized === 'apps' || normalized === 'app' || normalized === 'application') return 'apps'
  if (normalized === 'plugins' || normalized === 'plugin' || normalized === 'extension')
    return 'plugins'
  return 'all'
}

function buildScopedQuery(query: string, scope: 'files' | 'apps' | 'plugins' | 'all'): string {
  if (scope === 'files') return `@file ${query}`
  if (scope === 'apps') return `@app ${query}`
  if (scope === 'plugins') return `@plugin ${query}`
  return query
}

function normalizeSearchItems(items: TuffItem[]): Array<Record<string, unknown>> {
  return items.map((item) => {
    const renderBasic = item.render?.mode === 'default' ? item.render.basic : undefined
    const title = renderBasic?.title || item.id
    const subtitle = renderBasic?.subtitle
    const description = renderBasic?.description

    return {
      id: item.id,
      title,
      subtitle,
      description,
      kind: item.kind,
      sourceId: item.source?.id,
      sourceType: item.source?.type,
      score: item.scoring?.final ?? item.scoring?.match ?? item.scoring?.base ?? 0,
      meta: item.meta
    }
  })
}

function applyResultFilters(
  results: Array<Record<string, unknown>>,
  filters?: Record<string, unknown>
): Array<Record<string, unknown>> {
  if (!filters) return results

  const typeFilter = typeof filters.type === 'string' ? filters.type.toLowerCase() : undefined
  if (!typeFilter) return results

  return results.filter((item) => {
    const kind = typeof item.kind === 'string' ? item.kind.toLowerCase() : ''
    const sourceType = typeof item.sourceType === 'string' ? item.sourceType.toLowerCase() : ''
    const sourceId = typeof item.sourceId === 'string' ? item.sourceId.toLowerCase() : ''
    return (
      kind.includes(typeFilter) || sourceType.includes(typeFilter) || sourceId.includes(typeFilter)
    )
  })
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.!?;:/\\()[\]{}"'`|+-]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
}

function computeSemanticScore(tokens: string[], item: Record<string, unknown>): number {
  if (tokens.length === 0) return 0
  const corpus = [
    typeof item.title === 'string' ? item.title : '',
    typeof item.subtitle === 'string' ? item.subtitle : '',
    typeof item.description === 'string' ? item.description : ''
  ]
    .join(' ')
    .toLowerCase()

  if (!corpus) return 0

  let score = 0
  for (const token of tokens) {
    if (corpus.includes(token)) {
      score += 1
    }
  }

  const lexicalScore = score / tokens.length
  const relevance = getResultRelevance(item)
  return Math.min(1, lexicalScore * 0.8 + relevance * 0.2)
}

function buildSemanticInterpretation(
  query: string,
  context: string | undefined,
  matched: number
): string {
  const contextHint = context ? `，结合上下文“${context}”` : ''
  return `已解析查询“${query}”${contextHint}，匹配到 ${matched} 条语义相关结果`
}

function normalizeRankCriteria(criteria?: string): 'relevance' | 'date' | 'popularity' {
  const normalized = criteria?.toLowerCase().trim()
  if (normalized === 'date' || normalized === 'popularity' || normalized === 'relevance') {
    return normalized
  }
  return 'relevance'
}

function extractPreferredSources(userContext?: Record<string, unknown>): Set<string> {
  const preferred =
    Array.isArray(userContext?.preferredSources) &&
    userContext?.preferredSources.every((item) => typeof item === 'string')
      ? (userContext.preferredSources as string[])
      : []
  return new Set(preferred)
}

function getResultSource(result: unknown): string {
  if (!result || typeof result !== 'object') return ''
  const sourceId = (result as Record<string, unknown>).sourceId
  if (typeof sourceId === 'string') return sourceId
  return ''
}

function getResultTimestamp(result: unknown): number {
  if (!result || typeof result !== 'object') return 0
  const record = result as Record<string, unknown>
  const candidates = [record.updatedAt, record.modifiedAt, record.timestamp]
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate
    }
    if (typeof candidate === 'string') {
      const parsed = Date.parse(candidate)
      if (!Number.isNaN(parsed)) return parsed
    }
  }
  return 0
}

function getResultPopularity(result: unknown): number {
  if (!result || typeof result !== 'object') return 0
  const record = result as Record<string, unknown>
  const candidates = [record.popularity, record.usageCount, record.launchCount]
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate
    }
  }
  const meta = record.meta
  if (meta && typeof meta === 'object') {
    const metaPopularity = (meta as Record<string, unknown>).popularity
    if (typeof metaPopularity === 'number' && Number.isFinite(metaPopularity)) {
      return metaPopularity
    }
  }
  return 0
}

function getResultRelevance(result: unknown): number {
  if (!result || typeof result !== 'object') return 0
  const record = result as Record<string, unknown>
  const candidates = [record.score, record.relevance]
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate
    }
  }
  return 0
}

// ============================================================================
// Registration
// ============================================================================

export function registerSearchAgent(): void {
  agentRegistry.registerAgent(descriptor, implementation)
}

export { SEARCH_AGENT_ID, descriptor as searchAgentDescriptor }
