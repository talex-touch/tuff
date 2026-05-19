import type {
  AppIndexDiagnoseResult,
  AppIndexManagedEntry
} from '@talex-touch/utils/transport/events/types'
import type { ComposerTranslation } from 'vue-i18n'

export interface AppIndexEntrySourceSummary {
  kind: AppIndexEntrySourceKind
  label: string
  tone: 'system' | 'managed' | 'warning'
}

export type AppIndexEntrySourceKind = 'steam' | 'uwp' | 'shortcut' | 'protocol' | 'appref' | 'path'

export type AppIndexEntrySourceFilter = 'all' | AppIndexEntrySourceKind
export type AppIndexEntryDiagnosticState = 'found' | 'needs-attention' | 'not-run'
export type AppIndexEntryDiagnosticFilter = 'all' | 'attention' | 'found' | 'not-run' | 'disabled'

export interface AppIndexEntryDiagnosticSummary {
  state: AppIndexEntryDiagnosticState
  label: string
  tone: 'success' | 'warning' | 'muted'
  detail: string
}

export interface AppIndexEntryFilters {
  source: AppIndexEntrySourceFilter
  diagnostic: AppIndexEntryDiagnosticFilter
}

export interface AppIndexManagerSummary {
  total: number
  enabled: number
  disabled: number
  found: number
  notRun: number
  attention: number
}

export interface AppIndexManagerEmptyState {
  title: string
  detail: string
  actionKind: 'add-entry' | 'clear-filters'
  actionLabel: string
  tone: 'neutral' | 'filtered' | 'attention'
}

function includesSteam(value: string | undefined): boolean {
  return Boolean(value?.toLowerCase().includes('steam'))
}

function isAppRef(entry: AppIndexManagedEntry): boolean {
  const values = [entry.path, entry.launchTarget, entry.displayPath]
  return values.some((value) => value?.toLowerCase().endsWith('.appref-ms'))
}

function isShortcut(entry: AppIndexManagedEntry): boolean {
  const values = [entry.path, entry.launchTarget, entry.displayPath]
  return (
    entry.launchKind === 'shortcut' || values.some((value) => value?.toLowerCase().endsWith('.lnk'))
  )
}

function isUwp(entry: AppIndexManagedEntry): boolean {
  const values = [entry.path, entry.launchTarget, entry.displayPath]
  return (
    entry.launchKind === 'uwp' || values.some((value) => value?.startsWith('shell:AppsFolder\\'))
  )
}

export function classifyAppIndexEntrySource(entry: AppIndexManagedEntry): AppIndexEntrySourceKind {
  if (
    includesSteam(entry.path) ||
    includesSteam(entry.launchTarget) ||
    includesSteam(entry.displayPath)
  ) {
    return 'steam'
  }

  if (isUwp(entry)) return 'uwp'
  if (isShortcut(entry)) return 'shortcut'
  if (entry.launchKind === 'protocol') return 'protocol'
  if (isAppRef(entry)) return 'appref'
  return 'path'
}

export function classifyAppIndexEntryDiagnostic(
  diagnostic: AppIndexDiagnoseResult | undefined
): AppIndexEntryDiagnosticState {
  if (!diagnostic) return 'not-run'
  return diagnostic.success ? 'found' : 'needs-attention'
}

export function appIndexEntryNeedsAttention(
  entry: AppIndexManagedEntry,
  diagnostic: AppIndexDiagnoseResult | undefined
): boolean {
  return !entry.enabled || classifyAppIndexEntryDiagnostic(diagnostic) === 'needs-attention'
}

export function resolveAppIndexEntrySource(
  entry: AppIndexManagedEntry,
  t: ComposerTranslation
): AppIndexEntrySourceSummary {
  const kind = classifyAppIndexEntrySource(entry)

  if (kind === 'steam') {
    return {
      kind,
      label: t('settings.settingFileIndex.appIndexManagerSourceSteam', 'Steam'),
      tone: 'managed'
    }
  }

  if (kind === 'uwp') {
    return {
      kind,
      label: t('settings.settingFileIndex.appIndexManagerSourceUwp', 'UWP / Store'),
      tone: 'system'
    }
  }

  if (kind === 'shortcut') {
    return {
      kind,
      label: t('settings.settingFileIndex.appIndexManagerSourceShortcut', 'Shortcut'),
      tone: 'managed'
    }
  }

  if (kind === 'protocol') {
    return {
      kind,
      label: t('settings.settingFileIndex.appIndexManagerSourceProtocol', 'Protocol'),
      tone: 'system'
    }
  }

  if (kind === 'appref') {
    return {
      kind,
      label: t('settings.settingFileIndex.appIndexManagerSourceAppRef', 'AppRef'),
      tone: 'managed'
    }
  }

  return {
    kind,
    label: t('settings.settingFileIndex.appIndexManagerSourcePath', 'Path'),
    tone: 'managed'
  }
}

export function resolveAppIndexEntryDiagnosticSummary(
  diagnostic: AppIndexDiagnoseResult | undefined,
  t: ComposerTranslation
): AppIndexEntryDiagnosticSummary {
  const state = classifyAppIndexEntryDiagnostic(diagnostic)

  if (!diagnostic) {
    return {
      state,
      label: t('settings.settingFileIndex.appIndexManagerDiagnosticNotRun', 'Not checked'),
      tone: 'muted',
      detail: t(
        'settings.settingFileIndex.appIndexManagerDiagnosticNotRunDesc',
        'Run diagnostics to confirm recall stages.'
      )
    }
  }

  const matchedStages = diagnostic.query
    ? Object.entries(diagnostic.query.stages)
        .filter(([, stage]) => stage.targetHit)
        .map(([key]) => key)
    : []

  if (diagnostic.success) {
    return {
      state,
      label: t('settings.settingFileIndex.appIndexManagerDiagnosticFound', 'Found'),
      tone: 'success',
      detail:
        matchedStages.length > 0
          ? t('settings.settingFileIndex.appIndexManagerDiagnosticMatchedStages', {
              stages: matchedStages.join(' / ')
            })
          : t(
              'settings.settingFileIndex.appIndexManagerDiagnosticFoundDesc',
              'Entry is present in the app index.'
            )
    }
  }

  return {
    state,
    label: t(
      'settings.settingFileIndex.appIndexManagerDiagnosticNeedsAttention',
      'Needs attention'
    ),
    tone: 'warning',
    detail: diagnostic.reason || diagnostic.status
  }
}

export function filterAppIndexManagedEntries(
  entries: AppIndexManagedEntry[],
  diagnostics: Record<string, AppIndexDiagnoseResult>,
  filters: AppIndexEntryFilters
): AppIndexManagedEntry[] {
  return entries.filter((entry) => {
    if (filters.source !== 'all' && classifyAppIndexEntrySource(entry) !== filters.source) {
      return false
    }

    const diagnostic = diagnostics[entry.path]
    const diagnosticState = classifyAppIndexEntryDiagnostic(diagnostic)

    if (filters.diagnostic === 'attention') {
      return appIndexEntryNeedsAttention(entry, diagnostic)
    }

    if (filters.diagnostic === 'disabled') {
      return !entry.enabled
    }

    if (filters.diagnostic !== 'all' && diagnosticState !== filters.diagnostic) {
      return false
    }

    return true
  })
}

export function resolveAppIndexManagerSummary(
  entries: AppIndexManagedEntry[],
  diagnostics: Record<string, AppIndexDiagnoseResult>
): AppIndexManagerSummary {
  return entries.reduce<AppIndexManagerSummary>(
    (summary, entry) => {
      const diagnostic = diagnostics[entry.path]
      const diagnosticState = classifyAppIndexEntryDiagnostic(diagnostic)

      summary.total += 1

      if (entry.enabled) {
        summary.enabled += 1
      } else {
        summary.disabled += 1
      }

      if (diagnosticState === 'found') {
        summary.found += 1
      } else if (diagnosticState === 'not-run') {
        summary.notRun += 1
      }

      if (appIndexEntryNeedsAttention(entry, diagnostic)) {
        summary.attention += 1
      }

      return summary
    },
    {
      total: 0,
      enabled: 0,
      disabled: 0,
      found: 0,
      notRun: 0,
      attention: 0
    }
  )
}

function hasActiveAppIndexFilters(filters: AppIndexEntryFilters): boolean {
  return filters.source !== 'all' || filters.diagnostic !== 'all'
}

export function resolveAppIndexManagerEmptyState(
  entries: AppIndexManagedEntry[],
  diagnostics: Record<string, AppIndexDiagnoseResult>,
  filters: AppIndexEntryFilters,
  t: ComposerTranslation
): AppIndexManagerEmptyState | null {
  if (entries.length === 0) {
    return {
      title: t('settings.settingFileIndex.appIndexManagerEmpty', 'No app index entries'),
      detail: t(
        'settings.settingFileIndex.appIndexManagerEmptyDesc',
        'Add an app file or run app scanning to start managing search recall.'
      ),
      actionKind: 'add-entry',
      actionLabel: t('settings.settingFileIndex.appIndexManagerSelectFile', 'Select App File'),
      tone: 'neutral'
    }
  }

  const visibleEntries = filterAppIndexManagedEntries(entries, diagnostics, filters)
  if (visibleEntries.length > 0) return null

  const summary = resolveAppIndexManagerSummary(entries, diagnostics)
  const clearLabel = t('settings.settingFileIndex.appIndexManagerClearFilters', 'Clear filters')

  if (!hasActiveAppIndexFilters(filters)) {
    return {
      title: t(
        'settings.settingFileIndex.appIndexManagerFilteredEmpty',
        'No entries match the current filters'
      ),
      detail: t(
        'settings.settingFileIndex.appIndexManagerFilteredEmptyDesc',
        'Refresh entries or add a launch target if the list should not be empty.'
      ),
      actionKind: 'clear-filters',
      actionLabel: clearLabel,
      tone: 'filtered'
    }
  }

  if (filters.source !== 'all') {
    const hasSourceEntry = entries.some(
      (entry) => classifyAppIndexEntrySource(entry) === filters.source
    )
    if (!hasSourceEntry) {
      return {
        title: t(
          'settings.settingFileIndex.appIndexManagerFilteredEmptySourceTitle',
          'No entries from this source'
        ),
        detail: t(
          'settings.settingFileIndex.appIndexManagerFilteredEmptySourceDesc',
          'Switch the source filter or add a matching launch target.'
        ),
        actionKind: 'clear-filters',
        actionLabel: clearLabel,
        tone: 'filtered'
      }
    }
  }

  if (filters.diagnostic === 'attention' && summary.attention === 0) {
    return {
      title: t(
        'settings.settingFileIndex.appIndexManagerFilteredEmptyAttentionTitle',
        'No entries need attention'
      ),
      detail: t(
        'settings.settingFileIndex.appIndexManagerFilteredEmptyAttentionDesc',
        'Enabled entries are clean or still waiting for a different diagnostic filter.'
      ),
      actionKind: 'clear-filters',
      actionLabel: clearLabel,
      tone: 'attention'
    }
  }

  if (filters.diagnostic === 'found' && summary.found === 0) {
    return {
      title: t(
        'settings.settingFileIndex.appIndexManagerFilteredEmptyFoundTitle',
        'No diagnosed hits yet'
      ),
      detail: t(
        'settings.settingFileIndex.appIndexManagerFilteredEmptyFoundDesc',
        'Run diagnostics on entries or switch to unchecked items.'
      ),
      actionKind: 'clear-filters',
      actionLabel: clearLabel,
      tone: 'filtered'
    }
  }

  if (filters.diagnostic === 'not-run' && summary.notRun === 0) {
    return {
      title: t(
        'settings.settingFileIndex.appIndexManagerFilteredEmptyNotRunTitle',
        'All entries have diagnostics'
      ),
      detail: t(
        'settings.settingFileIndex.appIndexManagerFilteredEmptyNotRunDesc',
        'Switch to found or attention filters to inspect current results.'
      ),
      actionKind: 'clear-filters',
      actionLabel: clearLabel,
      tone: 'filtered'
    }
  }

  if (filters.diagnostic === 'disabled' && summary.disabled === 0) {
    return {
      title: t(
        'settings.settingFileIndex.appIndexManagerFilteredEmptyDisabledTitle',
        'No disabled entries'
      ),
      detail: t(
        'settings.settingFileIndex.appIndexManagerFilteredEmptyDisabledDesc',
        'All managed entries are currently enabled.'
      ),
      actionKind: 'clear-filters',
      actionLabel: clearLabel,
      tone: 'filtered'
    }
  }

  return {
    title: t(
      'settings.settingFileIndex.appIndexManagerFilteredEmpty',
      'No entries match the current filters'
    ),
    detail: t(
      'settings.settingFileIndex.appIndexManagerFilteredEmptyDesc',
      'Clear filters or run diagnostics on the underlying entries.'
    ),
    actionKind: 'clear-filters',
    actionLabel: clearLabel,
    tone: 'filtered'
  }
}
