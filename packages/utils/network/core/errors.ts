export const NETWORK_ERROR_CODE = {
  TIMEOUT: 'NETWORK_TIMEOUT',
  ABORTED: 'NETWORK_ABORTED',
  COOLDOWN_ACTIVE: 'NETWORK_COOLDOWN_ACTIVE',
  FILE_FORBIDDEN: 'NETWORK_FILE_FORBIDDEN',
  FILE_UNSUPPORTED_SOURCE: 'NETWORK_UNSUPPORTED_FILE_SOURCE',
  TRANSPORT_FAILED: 'NETWORK_TRANSPORT_FAILED',
} as const

/**
 * Substrings identifying a connection-level failure, across every transport this repo ships.
 *
 * Three dialects coexist and callers cannot tell which one produced an error: `session.fetch`
 * (main process) emits Chromium `net::ERR_*`, the global `fetch()` in `../request.ts` emits
 * `Failed to fetch` under Chromium and `fetch failed` under Node/undici. The update system used to
 * match the Node dialect alone, so `net::ERR_CONNECTION_CLOSED` was classified as permanent and the
 * GitHub fallback never fired while GitHub was reachable the whole time.
 *
 * Timeout and HTTP-status markers are deliberately absent — `isTimeoutLikeError` and
 * `parseHttpStatusCode` own those, and duplicating them here would make a single error match two
 * classifiers with different retry semantics. `etimedout` is the one that has to be named to be
 * kept out: `isTimeoutLikeError` matches `/timeout|etimedout/i`, so listing it here too would put
 * one error in both. Both update call sites already OR the two classifiers, so leaving it out
 * changes nothing there. Chromium's `ERR_CONNECTION_TIMED_OUT` is not the same case — that spelling
 * matches neither half of the timeout regex, which is precisely the gap this fix closes.
 *
 * There is deliberately no blanket `net::err_` entry. Chromium files user cancellation
 * (`ERR_ABORTED`), permission and policy refusals (`ERR_ACCESS_DENIED`, `ERR_BLOCKED_BY_CLIENT`)
 * and caller bugs (`ERR_INVALID_URL`, `ERR_UNSAFE_PORT`) under the same prefix, none of which get
 * better by retrying or by asking a different host. Missing a novel transport code degrades to the
 * behaviour this fix replaced, for that one code; matching a cancellation would retry work the user
 * just cancelled. `err_connection_` and `err_cert_` stay prefixes because every member of those two
 * families qualifies.
 */
export const TRANSPORT_FAILURE_MARKERS = [
  // Chromium net stack (session.fetch).
  'err_connection_',
  'err_name_not_resolved',
  'err_internet_disconnected',
  'err_network_changed',
  'err_address_unreachable',
  'err_empty_response',
  'err_failed',
  // TLS/certificate failures are treated as transport failures: artifacts from either source are
  // sha256- and signature-verified downstream, so switching source cannot lower the integrity bar,
  // while failing closed would strand every user behind a TLS-intercepting proxy on a stale build.
  'err_ssl_protocol_error',
  'err_cert_',
  // Chromium global fetch (renderer). Note the word order differs from undici's.
  'failed to fetch',
  // Node / undici
  'fetch failed',
  'econnreset',
  'econnrefused',
  'econnaborted',
  'enotfound',
  'eai_again',
  'epipe',
  'socket hang up',
  'network socket disconnected',
] as const

export class NetworkAbortError extends Error {
  readonly code = NETWORK_ERROR_CODE.ABORTED

  constructor() {
    super(NETWORK_ERROR_CODE.ABORTED)
    this.name = 'NetworkAbortError'
  }
}

export class NetworkTimeoutError extends Error {
  readonly code = NETWORK_ERROR_CODE.TIMEOUT

  constructor(public readonly timeoutMs?: number) {
    const detail = typeof timeoutMs === 'number' ? ` after ${timeoutMs}ms` : ''
    super(`${NETWORK_ERROR_CODE.TIMEOUT}${detail}`)
    this.name = 'NetworkTimeoutError'
  }
}

/**
 * A connection-level failure, normalized at the NetworkService boundary.
 *
 * Unlike {@link NetworkTimeoutError}, this preserves the original message verbatim rather than
 * replacing it with its own code. Roughly two dozen NetworkService callers still match on message
 * text, so rewriting it here would silently change their behaviour; `code` is the additive part
 * that lets new callers classify by type instead.
 */
export class NetworkTransportError extends Error {
  readonly code = NETWORK_ERROR_CODE.TRANSPORT_FAILED

  /** The Chromium error code (`ERR_CONNECTION_CLOSED`), when the message carried one. */
  readonly netErrorCode?: string

  constructor(originalMessage: string, options?: { cause?: unknown }) {
    super(originalMessage, options)
    this.name = 'NetworkTransportError'
    this.netErrorCode = originalMessage.match(/net::(ERR_[A-Z0-9_]+)/)?.[1]
  }
}

export class NetworkHttpStatusError extends Error {
  readonly code: string

  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly url: string,
    public readonly responseData?: unknown,
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

  return /timeout|etimedout/i.test(error.message)
}

/**
 * Whether an error is a connection-level failure, and so worth retrying or falling back from.
 *
 * Three tiers, because error identity degrades as the error travels. In-process the class survives;
 * across the transport SDK only `code` survives; across a raw IPC hop that projects errors to
 * `error.message` (`transport/prelude.ts`) the renderer receives a plain `Error` and the string is
 * all that is left. Dropping the string tier would make this classifier silently useless in the
 * renderer, which is one of the three call sites it exists for.
 */
export function isTransportFailureError(error: unknown): boolean {
  if (error instanceof NetworkTransportError) {
    return true
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === NETWORK_ERROR_CODE.TRANSPORT_FAILED
  ) {
    return true
  }

  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return TRANSPORT_FAILURE_MARKERS.some(marker => message.includes(marker))
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
