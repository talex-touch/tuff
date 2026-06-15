import { describe, expect, it } from 'vitest'
import { BoxMode } from '../../modules/box/adapter'
import { resolveCoreBoxSearchState } from './search-state'

describe('CoreBox search state', () => {
  it('does not show a state when results exist', () => {
    expect(
      resolveCoreBoxSearchState({
        query: 'calendar',
        resultCount: 1,
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
        recommendationPending: true,
        mode: BoxMode.INPUT
      })?.kind
    ).toBe('recommendation-loading')
  })

  it('does not show a state when a query is still loading', () => {
    expect(
      resolveCoreBoxSearchState({
        query: 'notes',
        resultCount: 0,
        recommendationPending: false,
        mode: BoxMode.INPUT
      })
    ).toBeNull()
  })

  it('does not show a state when a query finishes without results', () => {
    expect(
      resolveCoreBoxSearchState({
        query: 'definitely-missing',
        resultCount: 0,
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
        recommendationPending: false,
        mode: BoxMode.INPUT
      })
    ).toBeNull()
  })
})
