import type { H3Event } from 'h3'
import { setResponseStatus } from 'h3'

export interface QuotaApiResponse<T> {
  code: number
  message: string
  data: T
}

export interface QuotaUnavailablePayload {
  status: 'unavailable'
  reason: string
  migrationTarget?: string
}

export function quotaOk<T>(data: T, message = 'success'): QuotaApiResponse<T> {
  return {
    code: 200,
    message,
    data,
  }
}

export function quotaError<T>(
  code: number,
  message: string,
  data: T,
): QuotaApiResponse<T> {
  return {
    code,
    message,
    data,
  }
}

export function quotaUnavailable(
  event: H3Event,
  statusCode: number,
  reason: string,
  options: {
    message?: string
    migrationTarget?: string
  } = {},
): QuotaApiResponse<QuotaUnavailablePayload> {
  const message = options.message || reason
  setResponseStatus(event, statusCode)

  return quotaError(statusCode, message, {
    status: 'unavailable',
    reason,
    ...(options.migrationTarget ? { migrationTarget: options.migrationTarget } : {}),
  })
}

export function quotaNotImplemented(
  event?: H3Event,
  message = 'M0 endpoint is not implemented yet.',
): QuotaApiResponse<QuotaUnavailablePayload> {
  if (event) {
    return quotaUnavailable(event, 501, 'endpoint_not_implemented', { message })
  }

  return quotaError(501, message, {
    status: 'unavailable',
    reason: 'endpoint_not_implemented',
  })
}

export function toBoundedPositiveInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(Math.max(parsed, min), max)
}
