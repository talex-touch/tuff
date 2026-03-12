export const NETWORK_ERROR_CODE = {
  TIMEOUT: 'NETWORK_TIMEOUT',
  COOLDOWN_ACTIVE: 'NETWORK_COOLDOWN_ACTIVE',
  FILE_FORBIDDEN: 'NETWORK_FILE_FORBIDDEN',
  FILE_UNSUPPORTED_SOURCE: 'NETWORK_UNSUPPORTED_FILE_SOURCE',
} as const

export class NetworkTimeoutError extends Error {
  readonly code = NETWORK_ERROR_CODE.TIMEOUT

  constructor(public readonly timeoutMs?: number) {
    const detail = typeof timeoutMs === 'number' ? ` after ${timeoutMs}ms` : ''
    super(`${NETWORK_ERROR_CODE.TIMEOUT}${detail}`)
    this.name = 'NetworkTimeoutError'
  }
}

export class NetworkHttpStatusError extends Error {
  readonly code: string

  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly url: string
  ) {
    const normalized = Number.isInteger(status) ? status : 0
    super(`NETWORK_HTTP_STATUS_${normalized}`)
    this.name = 'NetworkHttpStatusError'
    this.code = this.message
  }
}

export function isTimeoutLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  if (error instanceof NetworkTimeoutError) {
    return true
  }

  if (error.name === 'TimeoutError') {
    return true
  }

  return /timeout|aborted|etimedout/i.test(error.message)
}

export function parseHttpStatusCode(error: unknown): number | null {
  if (error instanceof NetworkHttpStatusError) {
    return Number.isInteger(error.status) ? error.status : null
  }

  if (!(error instanceof Error)) {
    return null
  }

  const matched = error.message.match(/NETWORK_HTTP_STATUS_(\d{3})/)
  if (!matched) {
    return null
  }
  const status = Number.parseInt(matched[1] ?? '', 10)
  return Number.isInteger(status) ? status : null
}
