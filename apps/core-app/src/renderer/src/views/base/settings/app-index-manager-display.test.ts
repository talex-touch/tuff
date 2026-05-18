import type {
  AppIndexDiagnoseResult,
  AppIndexManagedEntry
} from '@talex-touch/utils/transport/events/types'
import type { ComposerTranslation } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import {
  filterAppIndexManagedEntries,
  resolveAppIndexManagerSummary,
  resolveAppIndexManagerEmptyState,
  resolveAppIndexEntryDiagnosticSummary,
  resolveAppIndexEntrySource
} from './app-index-manager-display'

const t = ((key: string, fallbackOrOptions?: string | Record<string, unknown>) => {
  if (typeof fallbackOrOptions === 'string') return fallbackOrOptions
  if (key.endsWith('appIndexManagerDiagnosticMatchedStages')) {
    return `Matched ${fallbackOrOptions?.stages}`
  }
  return key
}) as ComposerTranslation

function entry(overrides: Partial<AppIndexManagedEntry>): AppIndexManagedEntry {
  return {
    path: 'C:/Tools/App.exe',
    name: 'App',
    enabled: true,
    launchKind: 'path',
    launchTarget: 'C:/Tools/App.exe',
    ...overrides
  }
}

describe('app-index-manager-display', () => {
  it('groups managed app entries by launch source', () => {
    expect(resolveAppIndexEntrySource(entry({ launchKind: 'uwp' }), t)).toMatchObject({
      kind: 'uwp',
      label: 'UWP / Store',
      tone: 'system'
    })
    expect(
      resolveAppIndexEntrySource(
        entry({ launchTarget: 'steam://rungameid/123', displayPath: 'Steam Game' }),
        t
      )
    ).toMatchObject({ kind: 'steam', label: 'Steam', tone: 'managed' })
    expect(resolveAppIndexEntrySource(entry({ path: 'C:/App.lnk' }), t)).toMatchObject({
      kind: 'shortcut',
      label: 'Shortcut',
      tone: 'managed'
    })
  })

  it('summarizes diagnostic state for cards', () => {
    expect(resolveAppIndexEntryDiagnosticSummary(undefined, t)).toMatchObject({
      state: 'not-run',
      label: 'Not checked',
      tone: 'muted'
    })

    const diagnosis: AppIndexDiagnoseResult = {
      success: true,
      status: 'found',
      target: 'ChatApp',
      query: {
        raw: 'ChatApp',
        normalized: 'chatapp',
        terms: ['chatapp'],
        ftsQuery: 'chatapp',
        candidateItemIds: ['app-1'],
        stages: {
          precise: { ran: true, targetHit: true, matches: [] },
          phrase: { ran: false, targetHit: false, matches: [], reason: 'single-term-query' },
          prefix: { ran: true, targetHit: false, matches: [] },
          fts: { ran: true, targetHit: true, matches: [] },
          ngram: { ran: true, targetHit: false, matches: [] },
          subsequence: { ran: true, targetHit: false, matches: [] }
        }
      }
    }

    expect(resolveAppIndexEntryDiagnosticSummary(diagnosis, t)).toMatchObject({
      state: 'found',
      label: 'Found',
      tone: 'success',
      detail: 'Matched precise / fts'
    })

    expect(
      resolveAppIndexEntryDiagnosticSummary(
        { success: false, status: 'not-found', target: 'Missing', reason: 'target-not-found' },
        t
      )
    ).toMatchObject({
      state: 'needs-attention',
      label: 'Needs attention',
      tone: 'warning',
      detail: 'target-not-found'
    })
  })

  it('filters entries by source and diagnostic state', () => {
    const steam = entry({
      path: 'C:/Games/Steam/steamapps/common/Game/Game.exe',
      launchTarget: 'steam://rungameid/123'
    })
    const disabledShortcut = entry({
      path: 'C:/Users/Public/Desktop/Legacy.lnk',
      launchKind: 'shortcut',
      launchTarget: 'C:/Legacy/Legacy.exe',
      enabled: false
    })
    const uwp = entry({
      path: 'shell:AppsFolder\\Microsoft.Todos_8wekyb3d8bbwe!App',
      launchKind: 'uwp',
      launchTarget: 'shell:AppsFolder\\Microsoft.Todos_8wekyb3d8bbwe!App'
    })
    const diagnostics = {
      [steam.path]: { success: true, status: 'found', target: steam.path },
      [disabledShortcut.path]: {
        success: false,
        status: 'not-found',
        target: disabledShortcut.path,
        reason: 'target-not-found'
      }
    } satisfies Record<string, AppIndexDiagnoseResult>

    expect(
      filterAppIndexManagedEntries([steam, disabledShortcut, uwp], diagnostics, {
        source: 'steam',
        diagnostic: 'all'
      })
    ).toEqual([steam])

    expect(
      filterAppIndexManagedEntries([steam, disabledShortcut, uwp], diagnostics, {
        source: 'all',
        diagnostic: 'attention'
      })
    ).toEqual([disabledShortcut])

    expect(
      filterAppIndexManagedEntries([steam, disabledShortcut, uwp], diagnostics, {
        source: 'all',
        diagnostic: 'not-run'
      })
    ).toEqual([uwp])
  })

  it('summarizes attention, found, and unchecked managed entries', () => {
    const found = entry({ path: 'C:/Found.exe' })
    const notRun = entry({ path: 'C:/Unchecked.exe' })
    const disabled = entry({ path: 'C:/Disabled.exe', enabled: false })
    const missing = entry({ path: 'C:/Missing.exe' })
    const diagnostics = {
      [found.path]: { success: true, status: 'found', target: found.path },
      [missing.path]: {
        success: false,
        status: 'not-found',
        target: missing.path,
        reason: 'target-not-found'
      }
    } satisfies Record<string, AppIndexDiagnoseResult>

    expect(resolveAppIndexManagerSummary([found, notRun, disabled, missing], diagnostics)).toEqual({
      total: 4,
      enabled: 3,
      disabled: 1,
      found: 1,
      notRun: 2,
      attention: 2
    })
  })

  it('explains the initial empty state with an add action', () => {
    expect(
      resolveAppIndexManagerEmptyState([], {}, { source: 'all', diagnostic: 'all' }, t)
    ).toMatchObject({
      title: 'No manually managed app entries',
      detail: 'Add a Windows app file or paste a launch target to start managing search recall.',
      actionKind: 'add-entry',
      actionLabel: 'Select App File',
      tone: 'neutral'
    })
  })

  it('explains source-filtered empty results with a clear action', () => {
    const managedPath = entry({ path: 'C:/Tools/App.exe', launchKind: 'path' })

    expect(
      resolveAppIndexManagerEmptyState([managedPath], {}, { source: 'steam', diagnostic: 'all' }, t)
    ).toMatchObject({
      title: 'No entries from this source',
      detail: 'Switch the source filter or add a matching launch target.',
      actionKind: 'clear-filters',
      actionLabel: 'Clear filters',
      tone: 'filtered'
    })
  })

  it('explains diagnostic-filtered empty results from summary state', () => {
    const found = entry({ path: 'C:/Found.exe' })
    const diagnostics = {
      [found.path]: { success: true, status: 'found', target: found.path }
    } satisfies Record<string, AppIndexDiagnoseResult>

    expect(
      resolveAppIndexManagerEmptyState(
        [found],
        diagnostics,
        { source: 'all', diagnostic: 'attention' },
        t
      )
    ).toMatchObject({
      title: 'No entries need attention',
      detail: 'Enabled entries are clean or still waiting for a different diagnostic filter.',
      actionKind: 'clear-filters',
      actionLabel: 'Clear filters',
      tone: 'attention'
    })

    expect(
      resolveAppIndexManagerEmptyState(
        [found],
        diagnostics,
        { source: 'all', diagnostic: 'not-run' },
        t
      )
    ).toMatchObject({
      title: 'All entries have diagnostics',
      detail: 'Switch to found or attention filters to inspect current results.'
    })
  })

  it('returns no empty state when filters still have visible entries', () => {
    const steam = entry({
      path: 'C:/Games/Steam/steamapps/common/Game/Game.exe',
      launchTarget: 'steam://rungameid/123'
    })

    expect(
      resolveAppIndexManagerEmptyState([steam], {}, { source: 'steam', diagnostic: 'not-run' }, t)
    ).toBeNull()
  })
})
