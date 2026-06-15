import { BoxMode } from '../../modules/box/adapter'

export type CoreBoxSearchStateKind = 'recommendation-loading'

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
  recommendationPending: boolean
  mode: BoxMode
}

export function resolveCoreBoxSearchState(
  input: CoreBoxSearchStateInput
): CoreBoxSearchState | null {
  if (input.resultCount > 0 || input.mode === BoxMode.FEATURE || input.query.trim()) {
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

  return null
}
