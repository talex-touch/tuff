import { describe, expect, it } from 'vitest'
import type {
  IndexedSourceDiagnostics,
  IndexedSourceDiagnosticsSnapshot
} from '@talex-touch/utils/search'
import { BoxMode } from '../../modules/box/adapter'
import { resolveCoreBoxSearchState } from './search-state'

function buildSource(
  id: string,
  status: IndexedSourceDiagnostics['health']['status'],
  overrides: Partial<IndexedSourceDiagnostics> = {}
): IndexedSourceDiagnostics {
  return {
    descriptor: {
      id,
      kind: 'file',
      displayName: id,
      platforms: ['darwin', 'win32', 'linux'],
      priority: 'deferred',
      storage: 'sqlite-index',
      privacy: 'medium',
      capabilities: {
        scan: true,
        watch: true,
        reconcile: true,
        clear: true,
        open: true
      }
    },
    health: {
      status,
      permissionState: 'granted',
      itemCount: 10,
      watchState: 'active',
      reconcileState: 'idle'
    },
    roots: [],
    ...overrides
  }
}

function buildDiagnostics(sources: IndexedSourceDiagnostics[]): IndexedSourceDiagnosticsSnapshot {
  return {
    generatedAt: 1700000000000,
    summary: {
      total: sources.length,
      byStatus: {},
      ready: sources.filter((source) => source.health.status === 'ready').length,
      degraded: sources.filter((source) => source.health.status === 'degraded').length,
      unavailable: sources.filter((source) =>
        ['disabled', 'unsupported', 'permission-required', 'error'].includes(source.health.status)
      ).length
    },
    sources
  }
}

describe('CoreBox search state', () => {
  it('does not show a state when results exist', () => {
    expect(
      resolveCoreBoxSearchState({
        query: 'calendar',
        resultCount: 1,
        loading: true,
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

  it('shows active search state when a query is still loading', () => {
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

  it('shows no-results state when a query finishes without results', () => {
    const state = resolveCoreBoxSearchState({
      query: 'definitely-missing',
      resultCount: 0,
      loading: false,
      recommendationPending: false,
      mode: BoxMode.INPUT
    })

    expect(state?.kind).toBe('no-results')
    expect(state?.actions).toEqual([
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
    ])
  })

  it('adds degraded indexed source diagnostics to no-results state', () => {
    const state = resolveCoreBoxSearchState({
      query: 'bookmark',
      resultCount: 0,
      loading: false,
      recommendationPending: false,
      mode: BoxMode.INPUT,
      sourceDiagnostics: buildDiagnostics([
        buildSource('File Index', 'ready'),
        buildSource('Bookmarks', 'permission-required', {
          health: {
            ...buildSource('Bookmarks', 'permission-required').health,
            reason: 'Browser profile is locked'
          }
        })
      ])
    })

    expect(state?.sourceSummary?.tone).toBe('warning')
    expect(state?.sourceSummary?.sources[0]).toMatchObject({
      id: 'Bookmarks',
      status: 'permission-required',
      reason: 'Browser profile is locked'
    })
  })

  it('omits source diagnostics when all indexed sources are ready', () => {
    const state = resolveCoreBoxSearchState({
      query: 'calendar',
      resultCount: 0,
      loading: false,
      recommendationPending: false,
      mode: BoxMode.INPUT,
      sourceDiagnostics: buildDiagnostics([
        buildSource('Apps', 'ready'),
        buildSource('Files', 'ready')
      ])
    })

    expect(state?.sourceSummary).toBeUndefined()
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
