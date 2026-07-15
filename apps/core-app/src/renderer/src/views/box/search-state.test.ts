import { describe, expect, it } from 'vitest'
import { BoxMode } from '../../modules/box/adapter'
import { resolveCoreBoxSearchState } from './search-state'

describe('CoreBox search state', () => {
  it('does not show a state when results exist', () => {
    expect(
      resolveCoreBoxSearchState({
        query: 'calendar',
        resultCount: 1,
        loading: false,
        recommendationPending: false,
        mode: BoxMode.INPUT
      })
    ).toBeNull()
  })

  it('does not show a state while a plugin feature owns the input', () => {
    expect(
      resolveCoreBoxSearchState({
        query: '',
        resultCount: 0,
        loading: false,
        recommendationPending: false,
        mode: BoxMode.FEATURE
      })
    ).toBeNull()
  })

  it('shows recommendation warm-up when an empty query is loading recommendations', () => {
    expect(
      resolveCoreBoxSearchState({
        query: '',
        resultCount: 0,
        loading: true,
        recommendationPending: true,
        mode: BoxMode.INPUT
      })?.kind
    ).toBe('recommendation-loading')
  })

  it('shows searching while a query is still loading', () => {
    expect(
      resolveCoreBoxSearchState({
        query: 'notes',
        resultCount: 0,
        loading: true,
        recommendationPending: false,
        mode: BoxMode.INPUT
      })?.kind
    ).toBe('searching')
  })

  it('stays visually quiet when a query finishes without results', () => {
    expect(
      resolveCoreBoxSearchState({
        query: 'definitely-missing',
        resultCount: 0,
        loading: false,
        recommendationPending: false,
        mode: BoxMode.INPUT
      })
    ).toBeNull()
  })

  it('does not show a state when nothing is loading and no query exists', () => {
    expect(
      resolveCoreBoxSearchState({
        query: '   ',
        resultCount: 0,
        loading: false,
        recommendationPending: false,
        mode: BoxMode.INPUT
      })
    ).toBeNull()
  })
})
