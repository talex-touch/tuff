import { BoxMode } from '../../modules/box/adapter'

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
      ]
    }
  }

  return null
}
