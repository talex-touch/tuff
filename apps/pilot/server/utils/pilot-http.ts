import type { H3Event } from 'h3'
import { createError } from 'h3'

const SENSITIVE_ENDPOINT_RE = /\b(?:(?:\d{1,3}\.){3}\d{1,3}|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}|localhost):\d{2,5}\b/g
const ABSOLUTE_PATH_RE = /\/(?:Users|home|var|opt|private)\/[^\s)\],]+/g
const CONNECTION_ERROR_CODE_RE = /\b(?:ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ECONNRESET)\b/i

export function requireSessionId(event: H3Event): string {
  const sessionId = String(event.context.params?.sessionId || '').trim()
  if (!sessionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'sessionId is required',
    })
  }
  return sessionId
}

export function sanitizeErrorText(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw) {
    return ''
  }
  return raw
    .replace(/connect\s+ETIMEDOUT\s+[^\s)]+/gi, 'connect ETIMEDOUT [REDACTED_ENDPOINT]')
    .replace(/connect\s+ECONNREFUSED\s+[^\s)]+/gi, 'connect ECONNREFUSED [REDACTED_ENDPOINT]')
    .replace(/connect\s+EHOSTUNREACH\s+[^\s)]+/gi, 'connect EHOSTUNREACH [REDACTED_ENDPOINT]')
    .replace(/connect\s+ENETUNREACH\s+[^\s)]+/gi, 'connect ENETUNREACH [REDACTED_ENDPOINT]')
    .replace(SENSITIVE_ENDPOINT_RE, '[REDACTED_ENDPOINT]')
    .replace(ABSOLUTE_PATH_RE, '[REDACTED_PATH]')
    .trim()
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (error && typeof error === 'object') {
    const row = error as Record<string, unknown>
    if (typeof row.statusMessage === 'string' && row.statusMessage.trim()) {
      return row.statusMessage
    }
    if (typeof row.message === 'string' && row.message.trim()) {
      return row.message
    }
  }
  return 'Unknown error'
}

export function getErrorStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }
  const row = error as Record<string, unknown>
  const rawCode = row.statusCode ?? row.status
  const parsed = Number(rawCode)
  if (!Number.isFinite(parsed)) {
    return undefined
  }
  return Math.max(100, Math.floor(parsed))
}

export function isTransientConnectionError(error: unknown): boolean {
  const raw = `${toErrorMessage(error)} ${(error as Record<string, unknown> | null)?.code || ''}`
  return CONNECTION_ERROR_CODE_RE.test(String(raw))
}

export function toPublicServerErrorMessage(error: unknown): string {
  const statusCode = getErrorStatusCode(error)
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return sanitizeErrorText(toErrorMessage(error)) || '请求参数错误，请检查后重试。'
  }
  if (isTransientConnectionError(error)) {
    return '服务连接超时，请稍后重试。'
  }
  return '服务暂时不可用，请稍后重试。'
}
