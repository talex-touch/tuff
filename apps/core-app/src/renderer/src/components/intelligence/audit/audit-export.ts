/**
 * Exporting call records: every row matching the current filters, not the page on screen.
 *
 * The list is fetched 200 rows at a time (the read API's cap) until the total the first page
 * reported, then written out as CSV or JSON and handed to the browser as a download.
 */
import type {
  AuditLogPage,
  AuditLogQuery,
  IntelligenceAuditLogEntry,
  UsageRange
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { localDateStamp, toLocalIsoString } from './audit-format'

export const AUDIT_EXPORT_PAGE_SIZE = 200

/** Written first in a CSV: without it, Excel reads the Chinese labels as mojibake. */
const UTF8_BOM = String.fromCharCode(0xfeff)

export type AuditExportFormat = 'csv' | 'json'

export interface AuditExportProgress {
  fetched: number
  total: number
}

/** A cancellation flag the caller flips; checked between pages. */
export interface AuditExportSignal {
  cancelled: boolean
}

export class AuditExportCancelledError extends Error {
  constructor() {
    super('AUDIT_EXPORT_CANCELLED')
    this.name = 'AuditExportCancelledError'
  }
}

/**
 * The fields that tell two rows apart. A row has no id of its own in the read API, and paging is
 * by offset: a call flushed into the window while the export runs pushes every later row down by
 * one, so the next page would start with the row the last page ended on. Rows equal on all of
 * these are that repeat, not two calls.
 */
function rowIdentity(row: IntelligenceAuditLogEntry): string {
  return JSON.stringify([
    row.traceId,
    row.timestamp,
    row.capabilityId,
    row.provider,
    row.model,
    row.caller ?? null,
    row.success,
    row.latency,
    row.usage.totalTokens
  ])
}

/**
 * Every row matching `query`, newest first.
 *
 * Stops at the first page's total, or at a short page (rows deleted meanwhile: retention, a
 * privacy deletion). Throws `AuditExportCancelledError` once `signal.cancelled` is set.
 */
export async function fetchAllAuditRows(
  query: Omit<AuditLogQuery, 'offset' | 'limit'>,
  fetchPage: (query: AuditLogQuery) => Promise<AuditLogPage>,
  options: {
    signal?: AuditExportSignal
    onProgress?: (progress: AuditExportProgress) => void
  } = {}
): Promise<{ rows: IntelligenceAuditLogEntry[]; total: number }> {
  const rows: IntelligenceAuditLogEntry[] = []
  const seen = new Set<string>()
  let offset = 0
  let total: number | null = null

  for (;;) {
    if (options.signal?.cancelled) throw new AuditExportCancelledError()
    const page = await fetchPage({ ...query, offset, limit: AUDIT_EXPORT_PAGE_SIZE })
    if (options.signal?.cancelled) throw new AuditExportCancelledError()

    total ??= page.total
    for (const row of page.rows) {
      const identity = rowIdentity(row)
      if (seen.has(identity)) continue
      seen.add(identity)
      rows.push(row)
    }
    offset += page.rows.length
    options.onProgress?.({ fetched: Math.min(rows.length, total), total })

    if (page.rows.length < AUDIT_EXPORT_PAGE_SIZE || rows.length >= total) break
  }

  return { rows: rows.slice(0, total ?? rows.length), total: total ?? rows.length }
}

/** Names the export writes next to the raw ids, so a reader of the file needs no lookup. */
export interface AuditExportLabels {
  channel: (id: string) => string
  capability: (id: string) => string
  caller: (caller: string, operation?: string | null) => string
}

const CSV_COLUMNS = [
  'time',
  'timestamp_ms',
  'trace_id',
  'status',
  'error_code',
  'capability_id',
  'capability',
  'channel_id',
  'channel',
  'model',
  'caller_id',
  'caller',
  'prompt_tokens',
  'completion_tokens',
  'total_tokens',
  'estimated_cost_usd',
  'latency_ms',
  'metadata'
] as const

/**
 * One CSV cell. Text is always quoted; text that a spreadsheet would run as a formula
 * (`=`, `+`, `-`, `@`, tab, CR) is prefixed with `'` so opening the file executes nothing.
 */
function csvCell(value: string | number | null | undefined): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (value === null || value === undefined) return ''
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${text.replace(/"/g, '""')}"`
}

function operationOf(row: IntelligenceAuditLogEntry): string | null {
  const operation = row.metadata?.operation
  return typeof operation === 'string' && operation ? operation : null
}

/**
 * RFC 4180 CSV with CRLF line ends and a UTF-8 BOM — without the BOM, Excel reads the Chinese
 * labels as mojibake.
 */
export function buildAuditCsv(
  rows: readonly IntelligenceAuditLogEntry[],
  labels: AuditExportLabels
): string {
  const lines = [CSV_COLUMNS.join(',')]
  for (const row of rows) {
    const caller = row.caller ?? ''
    lines.push(
      [
        csvCell(toLocalIsoString(row.timestamp)),
        csvCell(row.timestamp),
        csvCell(row.traceId),
        csvCell(row.success ? 'success' : 'failure'),
        csvCell(row.success ? '' : (row.error ?? '')),
        csvCell(row.capabilityId),
        csvCell(labels.capability(row.capabilityId)),
        csvCell(row.provider),
        csvCell(labels.channel(row.provider)),
        csvCell(row.model),
        csvCell(caller),
        csvCell(labels.caller(caller, operationOf(row))),
        csvCell(row.usage.promptTokens),
        csvCell(row.usage.completionTokens),
        csvCell(row.usage.totalTokens),
        csvCell(row.estimatedCost ?? 0),
        csvCell(row.latency),
        csvCell(row.metadata ? JSON.stringify(row.metadata) : '')
      ].join(',')
    )
  }
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`
}

export interface AuditExportContext {
  range: UsageRange
  startMs: number
  endMs: number
  timezone: string
  filters: Record<string, string | boolean | null>
}

export function buildAuditJson(
  rows: readonly IntelligenceAuditLogEntry[],
  labels: AuditExportLabels,
  context: AuditExportContext,
  exportedAt: number = Date.now()
): string {
  return JSON.stringify(
    {
      exportedAt: toLocalIsoString(exportedAt),
      range: context.range,
      window: {
        start: toLocalIsoString(context.startMs),
        end: toLocalIsoString(context.endMs),
        timezone: context.timezone
      },
      filters: context.filters,
      total: rows.length,
      rows: rows.map((row) => ({
        ...row,
        time: toLocalIsoString(row.timestamp),
        channel: labels.channel(row.provider),
        capability: labels.capability(row.capabilityId),
        callerLabel: labels.caller(row.caller ?? '', operationOf(row))
      }))
    },
    null,
    2
  )
}

/** `tuff-ai-audit-2026-10-03-30d.csv`: the local date it was exported on, and the range. */
export function auditExportFilename(
  format: AuditExportFormat,
  range: UsageRange,
  exportedAt: number = Date.now()
): string {
  return `tuff-ai-audit-${localDateStamp(exportedAt)}-${range}.${format}`
}

/** Hands text to the browser as a file download (`Blob` + `<a download>`). */
export function downloadTextFile(content: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Not revoked on the spot: the download reads the blob after this returns, and in Electron
  // only once the save dialog is answered.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
