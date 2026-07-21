import type {
  OperationalErrorContextValue,
  OperationalErrorInput,
  OperationalErrorReport
} from '@talex-touch/utils'
import { createRendererLogger } from '~/utils/renderer-log'
import { captureOperationalException } from '../sentry/sentry-renderer'

const rendererOperationalLog = createRendererLogger('RendererOperationalError')
const SAFE_IDENTIFIER = /^[a-zA-Z0-9_.:-]{1,96}$/
const SENSITIVE_CONTEXT_KEY =
  /(query|text|keyword|path|file|folder|url|email|token|secret|password|credential|clipboard|content|prompt|response|html|image|screenshot|body|payload|stack|trace|request|headers|cookie|sql|params)/i
const UNSAFE_PUBLIC_MESSAGE =
  /(\bselect\b|\binsert\b|\bdelete\b|\bupdate\b|\bparams?:|\/Users\/|\/home\/|[a-zA-Z]:\\)/i
const DEFAULT_DEDUPE_WINDOW_MS = 60_000
const MAX_DEDUPE_ENTRIES = 128

interface RendererDedupeState {
  lastDetailAt: number
  lastSeenAt: number
  suppressed: number
}

const dedupe = new Map<string, RendererDedupeState>()

export function reportRendererOperationalError(
  input: OperationalErrorInput
): OperationalErrorReport {
  const occurredAt = Date.now()
  const domain = normalizeIdentifier(input.domain, 'renderer')
  const operation = normalizeIdentifier(input.operation, 'unknown')
  const code = normalizeCode(input.code)
  const severity = input.severity ?? 'error'
  const retryable = input.retryable ?? false
  const userImpact = input.userImpact ?? (severity === 'warning' ? 'none' : 'degraded')
  const context = sanitizeContext(input.context)
  const dedupeWindowMs = normalizeDedupeWindow(input.dedupeWindowMs)
  const key = `${domain}:${operation}:${code}`
  const state = dedupe.get(key) ?? { lastDetailAt: 0, lastSeenAt: occurredAt, suppressed: 0 }
  const shouldCaptureDetail = occurredAt - state.lastDetailAt >= dedupeWindowMs
  const occurrenceCount = shouldCaptureDetail ? state.suppressed + 1 : state.suppressed + 2

  if (shouldCaptureDetail) {
    state.lastDetailAt = occurredAt
    state.suppressed = 0
  } else {
    state.suppressed += 1
  }
  state.lastSeenAt = occurredAt
  dedupe.set(key, state)
  pruneDedupe()

  const report: OperationalErrorReport = {
    id: crypto.randomUUID(),
    domain,
    operation,
    code,
    severity,
    retryable,
    userImpact,
    publicMessage: resolvePublicMessage(input.publicMessage),
    occurredAt,
    occurrenceCount,
    context
  }
  const error = normalizeError(input.error)

  rendererOperationalLog[severity === 'warning' ? 'warn' : 'error'](
    `${domain}.${operation} failed [${report.id}]`,
    error
  )

  if (
    shouldCaptureDetail &&
    input.captureDetail !== false &&
    (severity === 'error' || severity === 'fatal')
  ) {
    captureOperationalException(error, report)
  }

  return report
}

function normalizeIdentifier(value: unknown, fallback: string): string {
  return typeof value === 'string' && SAFE_IDENTIFIER.test(value) ? value : fallback
}

function normalizeCode(value: unknown): string {
  if (typeof value !== 'string') return 'RENDERER_OPERATION_FAILED'
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_.:-]/g, '_')
    .slice(0, 96)
  return normalized || 'RENDERER_OPERATION_FAILED'
}

function sanitizeContext(
  context: Record<string, OperationalErrorContextValue> | undefined
): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = {}
  if (!context) return output
  for (const [key, value] of Object.entries(context).slice(0, 24)) {
    if (!SAFE_IDENTIFIER.test(key) || SENSITIVE_CONTEXT_KEY.test(key)) continue
    if (typeof value === 'boolean') output[key] = value
    if (typeof value === 'number' && Number.isFinite(value)) output[key] = value
    if (typeof value === 'string' && SAFE_IDENTIFIER.test(value)) output[key] = value
  }
  return output
}

function resolvePublicMessage(value: unknown): string {
  if (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 180 &&
    !UNSAFE_PUBLIC_MESSAGE.test(value)
  ) {
    return value.trim()
  }
  return 'The operation failed. Please retry.'
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error(typeof error === 'string' ? error : 'Renderer operational failure')
}

function normalizeDedupeWindow(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_DEDUPE_WINDOW_MS
  return Math.max(0, Math.min(Math.trunc(value), 60 * 60 * 1000))
}

function pruneDedupe(): void {
  if (dedupe.size <= MAX_DEDUPE_ENTRIES) return
  const entries = [...dedupe.entries()].sort(
    (left, right) => left[1].lastSeenAt - right[1].lastSeenAt
  )
  for (const [key] of entries.slice(0, dedupe.size - MAX_DEDUPE_ENTRIES)) dedupe.delete(key)
}
