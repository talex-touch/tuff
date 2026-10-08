/**
 * The call records drawer's state: filters, the page on screen, the row opened below the table,
 * and exporting every matching row.
 *
 * Owned by the page rather than the drawer, because the page's ⋯ menu exports too — with the
 * filters the drawer last had, over the range the page shows.
 */
import type {
  AuditLogQuery,
  IntelligenceAuditLogEntry,
  UsageRange
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import type {
  AuditExportFormat,
  AuditExportLabels,
  AuditExportProgress,
  AuditExportSignal
} from './audit-export'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import type { InjectionKey } from 'vue'
import { computed, onBeforeUnmount, reactive, ref, shallowRef } from 'vue'
import {
  AuditExportCancelledError,
  auditExportFilename,
  buildAuditCsv,
  buildAuditJson,
  downloadTextFile,
  fetchAllAuditRows
} from './audit-export'

export const AUDIT_RECORDS_PAGE_SIZE = 20

/** A filter's "any" value: what `TxSelect` holds when nothing is picked. */
export const AUDIT_FILTER_ANY = ''

/**
 * The caller filter's value for rows without a caller. `''` is already "any"; this is a value no
 * real caller can take (callers match `^[\w.:/-]+$`).
 */
export const AUDIT_FILTER_NO_CALLER = '(none)'

export type AuditStatusFilter = 'all' | 'success' | 'failure'

export interface AuditRecordFilters {
  status: AuditStatusFilter
  providerId: string
  caller: string
  capabilityId: string
}

/** The slice of the page's window the records read. */
export interface AuditRecordWindow {
  range: UsageRange
  startMs: number
  endMs: number
  timezone: string
}

/**
 * The read API's query for a window and the drawer's filters.
 *
 * `endMs` is held at the moment the list was opened (or the export started): offsets are only
 * stable over a list that does not grow at the top while it is being paged.
 */
export function buildAuditLogQuery(
  span: Pick<AuditRecordWindow, 'startMs' | 'endMs'>,
  filters: AuditRecordFilters
): Omit<AuditLogQuery, 'offset' | 'limit'> {
  const query: Omit<AuditLogQuery, 'offset' | 'limit'> = {
    startMs: span.startMs,
    endMs: span.endMs
  }
  if (filters.status !== 'all') query.success = filters.status === 'success'
  if (filters.providerId) query.providerId = filters.providerId
  if (filters.caller === AUDIT_FILTER_NO_CALLER) query.caller = null
  else if (filters.caller) query.caller = filters.caller
  if (filters.capabilityId) query.capabilityId = filters.capabilityId
  return query
}

/** The window as of now: never past this moment, so the list cannot grow while it is read. */
function pinWindow(span: AuditRecordWindow, now = Date.now()): AuditRecordWindow {
  return { ...span, endMs: Math.min(span.endMs, now + 1) }
}

export interface AuditExportState extends AuditExportProgress {
  format: AuditExportFormat
}

export type AuditExportOutcome =
  | { status: 'done'; count: number; filename: string }
  | { status: 'cancelled' }
  | { status: 'failed' }
  | { status: 'busy' }

export function useAuditRecords() {
  const sdk = useIntelligenceSdk()

  /** The window the list was last opened on, held at that moment (see `pinWindow`). */
  const listWindow = shallowRef<AuditRecordWindow | null>(null)
  const filters = reactive<AuditRecordFilters>({
    status: 'all',
    providerId: AUDIT_FILTER_ANY,
    caller: AUDIT_FILTER_ANY,
    capabilityId: AUDIT_FILTER_ANY
  })
  const page = ref(1)
  const rows = shallowRef<IntelligenceAuditLogEntry[]>([])
  const total = ref(0)
  const loading = ref(false)
  const loadFailed = ref(false)
  /** Which row is opened below the table, by its key (see `recordKey`). */
  const selectedKey = ref<string | null>(null)

  const exporting = shallowRef<AuditExportState | null>(null)
  let exportSignal: AuditExportSignal | null = null

  let revision = 0
  let disposed = false

  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / AUDIT_RECORDS_PAGE_SIZE)))

  /**
   * A row's key: its position in the whole filtered list plus its trace. Rows carry no id, a trace
   * may in principle repeat, and a key by index alone would keep a panel open on whatever row
   * paging moved into that slot.
   */
  function recordKey(row: IntelligenceAuditLogEntry, index: number): string {
    return `${(page.value - 1) * AUDIT_RECORDS_PAGE_SIZE + index}:${row.traceId}`
  }

  const selected = computed<IntelligenceAuditLogEntry | null>(() => {
    if (!selectedKey.value) return null
    const index = rows.value.findIndex((row, at) => recordKey(row, at) === selectedKey.value)
    return index >= 0 ? (rows.value[index] ?? null) : null
  })

  async function loadPage(): Promise<void> {
    const current = listWindow.value
    if (!current || disposed) return
    const ticket = ++revision
    loading.value = true
    try {
      const result = await sdk.queryAuditLogs({
        ...buildAuditLogQuery(current, filters),
        offset: (page.value - 1) * AUDIT_RECORDS_PAGE_SIZE,
        limit: AUDIT_RECORDS_PAGE_SIZE
      })
      if (ticket !== revision || disposed) return
      rows.value = result.rows
      total.value = result.total
      loadFailed.value = false
    } catch {
      if (ticket !== revision || disposed) return
      loadFailed.value = true
    } finally {
      if (ticket === revision && !disposed) loading.value = false
    }
  }

  /**
   * Opens the list over `next`, from the first page. Filters are kept: they are what the reader
   * chose, and the export reads them too.
   */
  function open(next: AuditRecordWindow): void {
    listWindow.value = pinWindow(next)
    page.value = 1
    selectedKey.value = null
    void loadPage()
  }

  function setFilter<K extends keyof AuditRecordFilters>(
    key: K,
    value: AuditRecordFilters[K]
  ): void {
    if (filters[key] === value) return
    filters[key] = value
    // A different list: its first page, with nothing opened from the old one.
    page.value = 1
    selectedKey.value = null
    void loadPage()
  }

  function setPage(next: number): void {
    const clamped = Math.min(Math.max(1, Math.floor(next)), pageCount.value)
    if (clamped === page.value) return
    page.value = clamped
    selectedKey.value = null
    void loadPage()
  }

  /** First click opens the row, a second click on it closes it. */
  function toggleRow(key: string): void {
    selectedKey.value = selectedKey.value === key ? null : key
  }

  /**
   * Fetches every row matching the filters over `pageWindow` and saves it as a file.
   *
   * The page's current range, not the one the drawer was last opened on: the menu exports what
   * the page shows.
   */
  async function exportRecords(
    format: AuditExportFormat,
    pageWindow: AuditRecordWindow,
    labels: AuditExportLabels
  ): Promise<AuditExportOutcome> {
    if (exporting.value) return { status: 'busy' }
    const signal: AuditExportSignal = { cancelled: false }
    exportSignal = signal
    const startedAt = Date.now()
    const pinned = pinWindow(pageWindow, startedAt)
    const snapshot = { ...filters }
    exporting.value = { format, fetched: 0, total: 0 }

    try {
      const { rows: all } = await fetchAllAuditRows(
        buildAuditLogQuery(pinned, snapshot),
        (query) => sdk.queryAuditLogs(query),
        {
          signal,
          onProgress: (progress) => {
            if (exportSignal === signal) exporting.value = { format, ...progress }
          }
        }
      )
      const filename = auditExportFilename(format, pinned.range, startedAt)
      if (format === 'csv') {
        downloadTextFile(buildAuditCsv(all, labels), filename, 'text/csv;charset=utf-8')
      } else {
        downloadTextFile(
          buildAuditJson(
            all,
            labels,
            {
              range: pinned.range,
              startMs: pinned.startMs,
              endMs: pinned.endMs,
              timezone: pinned.timezone,
              filters: {
                status: snapshot.status,
                providerId: snapshot.providerId || null,
                caller: snapshot.caller === AUDIT_FILTER_NO_CALLER ? '' : snapshot.caller || null,
                capabilityId: snapshot.capabilityId || null
              }
            },
            startedAt
          ),
          filename,
          'application/json;charset=utf-8'
        )
      }
      return { status: 'done', count: all.length, filename }
    } catch (error) {
      return error instanceof AuditExportCancelledError
        ? { status: 'cancelled' }
        : { status: 'failed' }
    } finally {
      if (exportSignal === signal) {
        exportSignal = null
        if (!disposed) exporting.value = null
      }
    }
  }

  function cancelExport(): void {
    if (exportSignal) exportSignal.cancelled = true
  }

  onBeforeUnmount(() => {
    disposed = true
    revision += 1
    cancelExport()
  })

  return {
    listWindow,
    filters,
    page,
    pageCount,
    rows,
    total,
    loading,
    loadFailed,
    selectedKey,
    selected,
    exporting,
    recordKey,
    open,
    loadPage,
    setFilter,
    setPage,
    toggleRow,
    exportRecords,
    cancelExport
  }
}

export type AuditRecordsController = ReturnType<typeof useAuditRecords>

/** The page's records state, handed to the drawer that shows it. */
export const AUDIT_RECORDS_KEY: InjectionKey<AuditRecordsController> = Symbol('audit-records')
