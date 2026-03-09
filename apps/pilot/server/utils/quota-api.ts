export interface QuotaApiResponse<T> {
  code: number
  message: string
  data: T
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

export function quotaNotImplemented(message = 'M0 endpoint is not implemented yet.'): QuotaApiResponse<null> {
  return quotaError(501, message, null)
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
