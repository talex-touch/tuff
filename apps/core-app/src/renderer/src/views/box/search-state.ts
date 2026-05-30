import type {
  IndexedSourceDiagnostics,
  IndexedSourceDiagnosticsSnapshot,
  IndexedSourceHealthStatus
} from '@talex-touch/utils/search'
import { BoxMode } from '../../modules/box/adapter'
import { countIndexingSourcesNeedingAttention } from '../../modules/search/indexing-source-diagnostics-display'

export type CoreBoxSearchStateKind = 'recommendation-loading' | 'searching' | 'no-results'

export type CoreBoxSearchStateTone = 'neutral' | 'progress' | 'warning'

export interface CoreBoxSearchState {
  kind: CoreBoxSearchStateKind
  tone: CoreBoxSearchStateTone
  icon: string
  titleKey: string
  titleFallback: string
  detailKey: string
  detailFallback: string
  actions: CoreBoxSearchStateAction[]
  sourceSummary?: CoreBoxSourceHealthSummary
}

export interface CoreBoxSearchStateAction {
  id: 'retry-search' | 'open-file-index-settings'
  icon: string
  labelKey: string
  labelFallback: string
  primary?: boolean
}

export interface CoreBoxSearchStateInput {
  query: string
  resultCount: number
  loading: boolean
  recommendationPending: boolean
  mode: BoxMode
  sourceDiagnostics?: IndexedSourceDiagnosticsSnapshot | null
}

export interface CoreBoxSourceHealthSummary {
  tone: CoreBoxSearchStateTone
  titleKey: string
  titleFallback: string
  detailKey: string
  detailFallback: string
  sources: CoreBoxSourceHealthItem[]
}

export interface CoreBoxSourceHealthItem {
  id: string
  name: string
  status: IndexedSourceHealthStatus
  statusKey: string
  statusFallback: string
  itemCount: number
  reason?: string
}

const STATUS_FALLBACK: Record<IndexedSourceHealthStatus, string> = {
  ready: 'Ready',
  warming: 'Warming',
  degraded: 'Degraded',
  disabled: 'Disabled',
  unsupported: 'Unsupported',
  'permission-required': 'Needs Permission',
  error: 'Error'
}

const ATTENTION_STATUS = new Set<IndexedSourceHealthStatus>([
  'degraded',
  'permission-required',
  'error'
])

const UNAVAILABLE_STATUS = new Set<IndexedSourceHealthStatus>([
  'disabled',
  'unsupported',
  'permission-required',
  'error'
])

function sortSourceByHealth(a: IndexedSourceDiagnostics, b: IndexedSourceDiagnostics): number {
  const aAttention = ATTENTION_STATUS.has(a.health.status) ? 0 : 1
  const bAttention = ATTENTION_STATUS.has(b.health.status) ? 0 : 1
  if (aAttention !== bAttention) return aAttention - bAttention

  const aUnavailable = UNAVAILABLE_STATUS.has(a.health.status) ? 0 : 1
  const bUnavailable = UNAVAILABLE_STATUS.has(b.health.status) ? 0 : 1
  if (aUnavailable !== bUnavailable) return aUnavailable - bUnavailable

  return a.descriptor.displayName.localeCompare(b.descriptor.displayName)
}

function buildSourceHealthSummary(
  diagnostics?: IndexedSourceDiagnosticsSnapshot | null
): CoreBoxSourceHealthSummary | undefined {
  if (!diagnostics?.sources?.length) return undefined

  const attention = countIndexingSourcesNeedingAttention(diagnostics.sources)
  const unavailable = diagnostics.sources.filter((source) =>
    UNAVAILABLE_STATUS.has(source.health.status)
  ).length
  const warming = diagnostics.sources.filter((source) => source.health.status === 'warming').length

  if (attention === 0 && unavailable === 0 && warming === 0) return undefined

  const sources = [...diagnostics.sources]
    .sort(sortSourceByHealth)
    .slice(0, 4)
    .map((source) => ({
      id: source.descriptor.id,
      name: source.descriptor.displayName,
      status: source.health.status,
      statusKey: `settings.settingFileIndex.sourceStatus.${source.health.status}`,
      statusFallback: STATUS_FALLBACK[source.health.status],
      itemCount: source.health.itemCount,
      reason: source.health.lastError || source.health.reason
    }))

  const tone: CoreBoxSearchStateTone = attention > 0 || unavailable > 0 ? 'warning' : 'neutral'

  return {
    tone,
    titleKey: 'coreBox.searchState.sourceSummaryTitle',
    titleFallback: 'Search source status',
    detailKey:
      attention > 0 || unavailable > 0
        ? 'coreBox.searchState.sourceSummaryAttentionDetail'
        : 'coreBox.searchState.sourceSummaryWarmingDetail',
    detailFallback:
      attention > 0 || unavailable > 0
        ? 'Some search sources are degraded or unavailable.'
        : 'Some search sources are still warming up.',
    sources
  }
}

export function resolveCoreBoxSearchState(
  input: CoreBoxSearchStateInput
): CoreBoxSearchState | null {
  if (input.resultCount > 0 || input.mode === BoxMode.FEATURE) {
    return null
  }

  const hasQuery = input.query.trim().length > 0

  if (!hasQuery && input.recommendationPending) {
    return {
      kind: 'recommendation-loading',
      tone: 'progress',
      icon: 'i-ri-loader-4-line',
      titleKey: 'coreBox.searchState.recommendationLoadingTitle',
      titleFallback: 'Preparing recommendations',
      detailKey: 'coreBox.searchState.recommendationLoadingDetail',
      detailFallback: 'Recent and frequent actions are warming up.',
      actions: []
    }
  }

  if (hasQuery && input.loading) {
    return {
      kind: 'searching',
      tone: 'progress',
      icon: 'i-ri-search-line',
      titleKey: 'coreBox.searchState.searchingTitle',
      titleFallback: 'Searching',
      detailKey: 'coreBox.searchState.searchingDetail',
      detailFallback: 'Checking apps, files, commands, and providers.',
      actions: []
    }
  }

  if (hasQuery) {
    return {
      kind: 'no-results',
      tone: 'warning',
      icon: 'i-ri-search-eye-line',
      titleKey: 'coreBox.searchState.noResultsTitle',
      titleFallback: 'No results',
      detailKey: 'coreBox.searchState.noResultsDetail',
      detailFallback: 'Try a broader query, or check whether indexing and providers are available.',
      actions: [
        {
          id: 'retry-search',
          icon: 'i-ri-refresh-line',
          labelKey: 'coreBox.searchState.retrySearch',
          labelFallback: 'Retry search',
          primary: true
        },
        {
          id: 'open-file-index-settings',
          icon: 'i-ri-database-2-line',
          labelKey: 'coreBox.searchState.openIndexSettings',
          labelFallback: 'Open index settings'
        }
      ],
      sourceSummary: buildSourceHealthSummary(input.sourceDiagnostics)
    }
  }

  return null
}
