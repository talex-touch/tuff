import { BoxMode } from '../../modules/box/adapter'

export type CoreBoxSearchStateKind = 'searching' | 'recommendation-loading'

export type CoreBoxSearchStateTone = 'progress'

export interface CoreBoxSearchState {
  kind: CoreBoxSearchStateKind
  tone: CoreBoxSearchStateTone
  icon: string
  titleKey: string
  titleFallback: string
  detailKey: string
  detailFallback: string
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
  const query = input.query.trim()

  if (input.resultCount > 0 || input.mode === BoxMode.FEATURE) {
    return null
  }

  if (input.recommendationPending) {
    return {
      kind: 'recommendation-loading',
      tone: 'progress',
      icon: 'i-ri-loader-4-line',
      titleKey: 'coreBox.searchState.recommendationLoadingTitle',
      titleFallback: 'Preparing recommendations',
      detailKey: 'coreBox.searchState.recommendationLoadingDetail',
      detailFallback: 'Recent and frequent actions are warming up.'
    }
  }

  if (query && input.loading) {
    return {
      kind: 'searching',
      tone: 'progress',
      icon: 'i-ri-loader-4-line',
      titleKey: 'coreBox.searchState.searchingTitle',
      titleFallback: 'Searching',
      detailKey: 'coreBox.searchState.searchingDetail',
      detailFallback: 'Checking local providers and indexed content.'
    }
  }

  return null
}
