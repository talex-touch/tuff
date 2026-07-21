import { randomUUID } from 'node:crypto'
import type {
  OperationalErrorContextValue,
  OperationalErrorInput,
  OperationalErrorReport
} from '@talex-touch/utils'
import { createLogger } from '../../utils/logger'

const operationalErrorLog = createLogger('OperationalError')

const DEFAULT_DEDUPE_WINDOW_MS = 60_000
const MAX_PENDING_DETAIL_REPORTS = 64
const MAX_DEDUPE_ENTRIES = 256
const MAX_CAUSE_DEPTH = 6
const SAFE_IDENTIFIER_PATTERN = /^[a-zA-Z0-9_.:-]{1,96}$/
const SENSITIVE_CONTEXT_KEY_PATTERN =
  /(query|text|keyword|path|file|folder|url|email|token|secret|password|credential|clipboard|content|prompt|response|html|image|screenshot|body|payload|stack|trace|request|headers|cookie|sql|params)/i
const UNSAFE_PUBLIC_MESSAGE_PATTERN =
  /(\bselect\b|\binsert\b|\bdelete\b|\bupdate\b|\bparams?:|\/Users\/|\/home\/|[a-zA-Z]:\\)/i

interface ErrorDetails {
  error: Error
  code?: string
  rawCode?: number
  sqliteBusy: boolean
}

interface DedupeState {
  lastRemoteAt: number
  lastSeenAt: number
  suppressed: number
}

export interface OperationalErrorSinkEvent {
  report: OperationalErrorReport
  error: Error
}

export type OperationalErrorSink = (event: OperationalErrorSinkEvent) => void | Promise<void>

export class OperationalErrorService {
  private detailSink: OperationalErrorSink | null = null
  private aggregateSink: OperationalErrorSink | null = null
  private readonly pendingDetailReports: OperationalErrorSinkEvent[] = []
  private readonly dedupe = new Map<string, DedupeState>()
  private detailDeliveryEnabled = true

  report(input: OperationalErrorInput): OperationalErrorReport {
    const occurredAt = Date.now()
    const details = extractErrorDetails(input.error)
    const domain = normalizeIdentifier(input.domain, 'runtime')
    const operation = normalizeIdentifier(input.operation, 'unknown')
    const code = normalizeCode(input.code ?? (details.sqliteBusy ? 'DATABASE_BUSY' : details.code))
    const severity = input.severity ?? 'error'
    const retryable = input.retryable ?? details.sqliteBusy
    const userImpact = input.userImpact ?? (severity === 'warning' ? 'none' : 'degraded')
    const context = sanitizeContext(input.context)
    if (details.rawCode !== undefined) context.rawCode = details.rawCode
    const key = `${domain}:${operation}:${code}`
    const dedupeWindowMs = normalizeDedupeWindow(input.dedupeWindowMs)
    const dedupeState = this.resolveDedupeState(key, occurredAt)
    const shouldDeliverRemote = occurredAt - dedupeState.lastRemoteAt >= dedupeWindowMs
    const occurrenceCount = shouldDeliverRemote
      ? dedupeState.suppressed + 1
      : dedupeState.suppressed + 2

    if (shouldDeliverRemote) {
      dedupeState.lastRemoteAt = occurredAt
      dedupeState.suppressed = 0
    } else {
      dedupeState.suppressed += 1
    }
    dedupeState.lastSeenAt = occurredAt

    const report: OperationalErrorReport = {
      id: randomUUID(),
      domain,
      operation,
      code,
      severity,
      retryable,
      userImpact,
      publicMessage: resolvePublicMessage(input.publicMessage, details.sqliteBusy),
      occurredAt,
      occurrenceCount,
      context
    }
    const event = { report, error: details.error }

    if (shouldDeliverRemote) {
      operationalErrorLog[severity === 'warning' ? 'warn' : 'error'](
        `${domain}.${operation} failed`,
        {
          meta: {
            reportId: report.id,
            code,
            retryable,
            userImpact,
            occurrenceCount
          },
          error: details.error
        }
      )
    } else {
      operationalErrorLog.warn(`${domain}.${operation} failure suppressed`, {
        meta: {
          reportId: report.id,
          code,
          retryable,
          userImpact,
          occurrenceCount: dedupeState.suppressed + 1
        }
      })
    }

    if (shouldDeliverRemote) {
      if ((severity === 'error' || severity === 'fatal') && input.captureDetail !== false) {
        this.deliverDetail(event)
      }
      this.deliverAggregate(event)
    }

    this.pruneDedupe()
    return report
  }

  hasDetailSink(): boolean {
    return this.detailDeliveryEnabled && this.detailSink !== null
  }

  enableDetailDelivery(): void {
    this.detailDeliveryEnabled = true
  }

  disableDetailDelivery(): void {
    this.detailDeliveryEnabled = false
    this.pendingDetailReports.length = 0
  }

  clearPendingDetails(): void {
    this.pendingDetailReports.length = 0
  }

  dispose(): void {
    this.detailSink = null
    this.aggregateSink = null
    this.pendingDetailReports.length = 0
    this.dedupe.clear()
    this.detailDeliveryEnabled = true
  }

  attachDetailSink(sink: OperationalErrorSink): () => void {
    this.detailDeliveryEnabled = true
    this.detailSink = sink
    this.flushPendingDetailReports()
    return () => {
      if (this.detailSink === sink) this.detailSink = null
    }
  }

  attachAggregateSink(sink: OperationalErrorSink): () => void {
    this.aggregateSink = sink
    return () => {
      if (this.aggregateSink === sink) this.aggregateSink = null
    }
  }

  private resolveDedupeState(key: string, now: number): DedupeState {
    const existing = this.dedupe.get(key)
    if (existing) return existing
    const created = { lastRemoteAt: 0, lastSeenAt: now, suppressed: 0 }
    this.dedupe.set(key, created)
    return created
  }

  private pruneDedupe(): void {
    if (this.dedupe.size <= MAX_DEDUPE_ENTRIES) return
    const entries = [...this.dedupe.entries()].sort(
      (left, right) => left[1].lastSeenAt - right[1].lastSeenAt
    )
    for (const [key] of entries.slice(0, this.dedupe.size - MAX_DEDUPE_ENTRIES)) {
      this.dedupe.delete(key)
    }
  }

  private deliverDetail(event: OperationalErrorSinkEvent): void {
    if (!this.detailDeliveryEnabled) return
    if (!this.detailSink) {
      if (this.pendingDetailReports.length >= MAX_PENDING_DETAIL_REPORTS) {
        this.pendingDetailReports.shift()
      }
      this.pendingDetailReports.push(event)
      return
    }
    this.invokeSink(this.detailSink, event, 'detail')
  }

  private deliverAggregate(event: OperationalErrorSinkEvent): void {
    if (!this.aggregateSink) return
    this.invokeSink(this.aggregateSink, event, 'aggregate')
  }

  private flushPendingDetailReports(): void {
    const sink = this.detailSink
    if (!sink || this.pendingDetailReports.length === 0) return
    const pending = this.pendingDetailReports.splice(0)
    for (const event of pending) this.invokeSink(sink, event, 'detail')
  }

  private invokeSink(
    sink: OperationalErrorSink,
    event: OperationalErrorSinkEvent,
    kind: 'detail' | 'aggregate'
  ): void {
    try {
      const result = sink(event)
      if (result && typeof result.then === 'function') {
        void result.catch((error) => {
          operationalErrorLog.warn(`Operational ${kind} sink rejected`, { error })
        })
      }
    } catch (error) {
      operationalErrorLog.warn(`Operational ${kind} sink failed`, { error })
    }
  }
}

function extractErrorDetails(value: unknown): ErrorDetails {
  const visited = new Set<unknown>()
  let rootError: Error | null = value instanceof Error ? value : null
  let code: string | undefined
  let rawCode: number | undefined
  let sqliteBusy = false

  const visit = (node: unknown, depth: number): void => {
    if (depth > MAX_CAUSE_DEPTH || !node || typeof node !== 'object' || visited.has(node)) return
    visited.add(node)
    if (!rootError && node instanceof Error) rootError = node

    const record = node as {
      code?: unknown
      rawCode?: unknown
      message?: unknown
      cause?: unknown
      original?: unknown
      error?: unknown
      errors?: unknown
    }
    if (!code && typeof record.code === 'string' && record.code.trim()) code = record.code
    if (rawCode === undefined && typeof record.rawCode === 'number') rawCode = record.rawCode
    if (isSqliteBusyNode(record)) sqliteBusy = true

    visit(record.cause, depth + 1)
    visit(record.original, depth + 1)
    visit(record.error, depth + 1)
    if (Array.isArray(record.errors)) {
      for (const item of record.errors.slice(0, 8)) visit(item, depth + 1)
    }
  }

  visit(value, 0)
  const error =
    rootError ?? new Error(typeof value === 'string' ? value : 'Unknown operational error')
  return { error, code, rawCode, sqliteBusy }
}

function isSqliteBusyNode(record: {
  code?: unknown
  rawCode?: unknown
  message?: unknown
}): boolean {
  if (record.code === 'SQLITE_BUSY') return true
  if (typeof record.code === 'string' && record.code.startsWith('SQLITE_BUSY')) return true
  if (record.rawCode === 5) return true
  if (typeof record.rawCode === 'number' && record.rawCode > 5 && record.rawCode % 256 === 5)
    return true
  return typeof record.message === 'string' && record.message.includes('SQLITE_BUSY')
}

function normalizeIdentifier(value: unknown, fallback: string): string {
  return typeof value === 'string' && SAFE_IDENTIFIER_PATTERN.test(value) ? value : fallback
}

function normalizeCode(value: unknown): string {
  if (typeof value !== 'string') return 'OPERATION_FAILED'
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_.:-]/g, '_')
    .slice(0, 96)
  return normalized || 'OPERATION_FAILED'
}

function normalizeDedupeWindow(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_DEDUPE_WINDOW_MS
  return Math.max(0, Math.min(Math.trunc(value), 60 * 60 * 1000))
}

function sanitizeContext(
  context: Record<string, OperationalErrorContextValue> | undefined
): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = {}
  if (!context) return output
  for (const [key, value] of Object.entries(context).slice(0, 24)) {
    if (!SAFE_IDENTIFIER_PATTERN.test(key) || SENSITIVE_CONTEXT_KEY_PATTERN.test(key)) continue
    if (typeof value === 'boolean') output[key] = value
    if (typeof value === 'number' && Number.isFinite(value)) output[key] = value
    if (typeof value === 'string' && SAFE_IDENTIFIER_PATTERN.test(value)) output[key] = value
  }
  return output
}

function resolvePublicMessage(input: string | undefined, sqliteBusy: boolean): string {
  if (
    typeof input === 'string' &&
    input.trim().length > 0 &&
    input.length <= 180 &&
    !UNSAFE_PUBLIC_MESSAGE_PATTERN.test(input)
  ) {
    return input.trim()
  }
  if (sqliteBusy) return 'Database is busy. Please retry.'
  return 'The operation failed. Please retry.'
}

export const operationalErrorService = new OperationalErrorService()
