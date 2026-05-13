import type { IProviderActivate, TuffQuery } from '@talex-touch/utils'
import crypto from 'node:crypto'

const PROVIDER_ALIASES: Record<string, string[]> = {
  file: [
    'file-provider',
    'file-index',
    'macos-spotlight-provider',
    'linux-native-file-provider',
    'files',
    'fs',
    'document',
    'everything-provider',
    'everything'
  ],
  app: ['app-provider', 'applications', 'apps'],
  plugin: ['plugin-features', 'plugins', 'extension', 'extensions'],
  preview: ['preview-provider']
}

const PROVIDER_CATEGORY_MAP: Record<string, string> = {
  'app-provider': 'app',
  'file-provider': 'file',
  'everything-provider': 'file',
  'macos-spotlight-provider': 'file',
  'linux-native-file-provider': 'file',
  'plugin-features': 'plugin',
  'preview-provider': 'preview'
}

const EVERYTHING_PROVIDER_FILTERS = new Set(['everything', 'everything-provider'])
const FILE_PROVIDER_FILTERS = new Set([
  'file-provider',
  'file-index',
  'macos-spotlight-provider',
  'linux-native-file-provider'
])
const FILE_CATEGORY_FILTERS = new Set(['file', 'files', 'fs', 'document'])

export interface ParsedSearchQuery {
  raw: string
  text: string
  providerFilter?: string
}

export type ExtendedProviderStatus = 'success' | 'timeout' | 'error' | 'aborted'

export type SearchTraceSourceStat = {
  providerId?: string
  provider?: string
  status?: ExtendedProviderStatus
  duration?: number
  resultCount?: number
}

export interface SearchTraceProviderSummary {
  total: number
  byStatus: Partial<Record<ExtendedProviderStatus, number>>
  topSlow: Array<{ providerId: string; durationMs: number; status: string; resultCount: number }>
}

export function resolveProviderCategory(providerId: string): string {
  if (PROVIDER_CATEGORY_MAP[providerId]) return PROVIDER_CATEGORY_MAP[providerId]
  if (providerId.includes('file')) return 'file'
  if (providerId.includes('app')) return 'app'
  if (providerId.includes('plugin')) return 'plugin'
  return 'other'
}

export function parseProviderFilter(input: string): ParsedSearchQuery {
  if (!input) return { raw: input, text: input }

  const filterMatch = input.match(/^@([\w-]+)\s*(.*)$/)
  if (filterMatch) {
    return {
      raw: input,
      providerFilter: filterMatch[1].toLowerCase(),
      text: filterMatch[2].trim()
    }
  }

  return { raw: input, text: input }
}

export function matchesProviderFilter(providerId: string, filter: string): boolean {
  const normalizedId = providerId.toLowerCase()
  const normalizedFilter = filter.toLowerCase()

  if (normalizedId === normalizedFilter) return true
  if (normalizedId.includes(normalizedFilter)) return true

  const aliases = PROVIDER_ALIASES[normalizedFilter]
  return aliases?.some((alias) => normalizedId.includes(alias)) ?? false
}

export function isExplicitEverythingProviderFilter(filter?: string): boolean {
  return typeof filter === 'string' && EVERYTHING_PROVIDER_FILTERS.has(filter.toLowerCase())
}

export function isExplicitFileProviderFilter(filter?: string): boolean {
  return typeof filter === 'string' && FILE_PROVIDER_FILTERS.has(filter.toLowerCase())
}

export function isExplicitFileCategoryFilter(filter?: string): boolean {
  return typeof filter === 'string' && FILE_CATEGORY_FILTERS.has(filter.toLowerCase())
}

export function getActivationKey(activation: IProviderActivate): string {
  if (activation.id === 'plugin-features' && activation.meta?.pluginName) {
    return `${activation.id}:${activation.meta.pluginName}`
  }
  return activation.id
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

function hashCachePart(value: unknown): string {
  return crypto.createHash('sha1').update(stableStringify(value)).digest('hex').slice(0, 16)
}

export function buildSearchCacheKey(
  query: TuffQuery,
  providerFilter: string | undefined,
  activatedProviders: Map<string, IProviderActivate> | null
): string {
  const rawQuery = query as unknown as Record<string, unknown>
  const queryExtras: Record<string, unknown> = {}
  for (const key of Object.keys(rawQuery).sort()) {
    if (key === 'text' || key === 'inputs') continue
    queryExtras[key] = rawQuery[key]
  }

  const inputs = (query.inputs ?? []).map((input) => {
    const rawInput = input as unknown as Record<string, unknown>
    return {
      type: input.type,
      contentHash: hashCachePart(rawInput.content ?? ''),
      metaHash: hashCachePart(
        Object.fromEntries(Object.entries(rawInput).filter(([key]) => key !== 'content'))
      )
    }
  })

  return hashCachePart({
    text: query.text || '',
    providerFilter: providerFilter || '',
    activatedProviders: activatedProviders ? Array.from(activatedProviders.keys()).sort() : [],
    inputs,
    extras: queryExtras
  })
}

export function roundDuration(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }
  return Math.max(0, Math.round(value))
}

export function toQueryHash(text: string): string {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 12)
}

export function buildProviderSummary(
  sourceStats: SearchTraceSourceStat[]
): SearchTraceProviderSummary {
  const byStatus: Partial<Record<ExtendedProviderStatus, number>> = {}
  for (const stat of sourceStats) {
    const status = stat.status ?? 'success'
    byStatus[status] = (byStatus[status] ?? 0) + 1
  }

  const topSlow = sourceStats
    .map((stat) => ({
      providerId: stat.providerId || stat.provider || 'unknown',
      durationMs: roundDuration(stat.duration) ?? 0,
      status: stat.status ?? 'success',
      resultCount: typeof stat.resultCount === 'number' ? stat.resultCount : 0
    }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 3)

  return {
    total: sourceStats.length,
    byStatus,
    topSlow
  }
}

export function resolveSearchScene(query: TuffQuery, inputTypes: string[]): string {
  return inputTypes.includes('files')
    ? 'clipboard-files'
    : inputTypes.includes('image')
      ? 'clipboard-image'
      : inputTypes.includes('html')
        ? 'clipboard-html'
        : query.type === 'voice'
          ? 'voice'
          : 'text'
}

export function buildProviderTelemetry(sourceStats: SearchTraceSourceStat[]): {
  providerTimings: Record<string, number>
  providerResults: Record<string, number>
  providerStatus: Record<string, ExtendedProviderStatus>
  providerErrorCount: number
  providerTimeoutCount: number
} {
  const providerTimings: Record<string, number> = {}
  const providerResults: Record<string, number> = {}
  const providerStatus: Record<string, ExtendedProviderStatus> = {}
  let providerErrorCount = 0
  let providerTimeoutCount = 0

  for (const stat of sourceStats) {
    const providerId = stat.providerId || stat.provider || 'unknown'
    const status = stat.status ?? 'success'
    providerResults[providerId] = stat.resultCount || 0
    providerTimings[providerId] = stat.duration || 0
    providerStatus[providerId] = status
    if (status === 'error') providerErrorCount += 1
    if (status === 'timeout') providerTimeoutCount += 1
  }

  return {
    providerTimings,
    providerResults,
    providerStatus,
    providerErrorCount,
    providerTimeoutCount
  }
}
