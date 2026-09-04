/**
 * The update system classified connection failures by matching Node/undici error strings, but the
 * transport that actually runs OTA is Electron `session.fetch`, which emits Chromium `net::ERR_*`.
 * `net::ERR_CONNECTION_CLOSED` therefore read as a permanent failure and the GitHub fallback never
 * fired — reproduced against the official update host on 2026-09-04 while GitHub answered 200.
 *
 * These tests pin the property (is this a connection-level failure?) rather than any one spelling,
 * and the negative cases below are the load-bearing half: a marker list that matches everything
 * would pass every positive case here while quietly stealing errors from the timeout and
 * HTTP-status classifiers, which carry different retry semantics.
 */
import { describe, expect, it } from 'vitest'

import {
  isTimeoutLikeError,
  isTransportFailureError,
  NETWORK_ERROR_CODE,
  NetworkAbortError,
  NetworkHttpStatusError,
  NetworkTimeoutError,
  NetworkTransportError,
} from '../network/core/errors'

describe('isTransportFailureError recognises every transport dialect', () => {
  it.each([
    // Chromium net stack — the dialect the old regex missed entirely.
    'net::ERR_CONNECTION_CLOSED',
    'net::ERR_CONNECTION_RESET',
    'net::ERR_CONNECTION_REFUSED',
    'net::ERR_NAME_NOT_RESOLVED',
    'net::ERR_INTERNET_DISCONNECTED',
    'net::ERR_FAILED',
    // Not covered by /timeout|etimedout/: the code spells it TIMED_OUT.
    'net::ERR_CONNECTION_TIMED_OUT',
    // TLS/certificate failures fall back like any other connection failure (decision D1).
    'net::ERR_SSL_PROTOCOL_ERROR',
    'net::ERR_CERT_AUTHORITY_INVALID',
    // Chromium global fetch — word order is the reverse of undici's, so the old regex missed it.
    'Failed to fetch',
    // Node / undici
    'fetch failed',
    'read ECONNRESET',
    'connect ECONNREFUSED 127.0.0.1:443',
    'getaddrinfo ENOTFOUND tuff.tagzxia.com',
    'getaddrinfo EAI_AGAIN tuff.tagzxia.com',
    'socket hang up',
    'Client network socket disconnected before secure TLS connection was established',
  ])('treats %s as a transport failure', (message) => {
    expect(isTransportFailureError(new Error(message))).toBe(true)
  })

  it('matches an unenumerated Chromium code through the net:: prefix', () => {
    expect(isTransportFailureError(new Error('net::ERR_SOMETHING_NEW_IN_A_FUTURE_CHROMIUM'))).toBe(
      true,
    )
  })
})

describe('isTransportFailureError leaves other classifiers their errors', () => {
  it.each([
    ['an HTTP status error', new NetworkHttpStatusError(500, 'Server Error', 'https://x.test')],
    ['a rate-limit status error', new NetworkHttpStatusError(429, 'Too Many', 'https://x.test')],
    ['a timeout', new NetworkTimeoutError(8000)],
    ['an abort', new NetworkAbortError()],
    ['an unrelated failure', new Error('Update package signature verification failed')],
  ])('does not claim %s', (_label, error) => {
    expect(isTransportFailureError(error)).toBe(false)
  })

  it('does not steal ERR_CONNECTION_TIMED_OUT from... nothing: isTimeoutLikeError never had it', () => {
    // Documents why isRetryable must OR both classifiers rather than relying on either alone.
    const timedOut = new Error('net::ERR_CONNECTION_TIMED_OUT')
    expect(isTimeoutLikeError(timedOut)).toBe(false)
    expect(isTransportFailureError(timedOut)).toBe(true)

    const timeout = new NetworkTimeoutError(8000)
    expect(isTimeoutLikeError(timeout)).toBe(true)
    expect(isTransportFailureError(timeout)).toBe(false)
  })

  it('returns false for non-Error values', () => {
    expect(isTransportFailureError('net::ERR_CONNECTION_CLOSED')).toBe(false)
    expect(isTransportFailureError(null)).toBe(false)
    expect(isTransportFailureError(undefined)).toBe(false)
  })
})

describe('isTransportFailureError survives the loss of error identity', () => {
  it('classifies a NetworkTransportError by type', () => {
    expect(isTransportFailureError(new NetworkTransportError('net::ERR_CONNECTION_CLOSED'))).toBe(
      true,
    )
  })

  it('classifies by code when the prototype chain is gone but the code survives', () => {
    const overIpc = Object.assign(new Error('something the renderer cannot parse'), {
      code: NETWORK_ERROR_CODE.TRANSPORT_FAILED,
    })
    expect(isTransportFailureError(overIpc)).toBe(true)
  })

  it('classifies by message when only the string survives, as in the renderer', () => {
    // transport/prelude.ts projects errors across IPC as `error.message`; the renderer gets a
    // plain Error with no code and no prototype. This tier is the only one left there.
    expect(isTransportFailureError(new Error('net::ERR_CONNECTION_CLOSED'))).toBe(true)
  })
})

describe('NetworkTransportError stays compatible with message-matching callers', () => {
  it('preserves the original message verbatim', () => {
    // ~25 NetworkService callers still match on message text (network-log-noise.ts among them).
    // Rewriting the message to the code, as NetworkTimeoutError does, would change their behaviour.
    const original = 'net::ERR_CONNECTION_CLOSED'
    expect(new NetworkTransportError(original).message).toBe(original)
  })

  it('exposes the code additively', () => {
    expect(new NetworkTransportError('net::ERR_CONNECTION_CLOSED').code).toBe(
      NETWORK_ERROR_CODE.TRANSPORT_FAILED,
    )
  })

  it('extracts the Chromium code when present, and omits it otherwise', () => {
    expect(new NetworkTransportError('net::ERR_CONNECTION_CLOSED').netErrorCode).toBe(
      'ERR_CONNECTION_CLOSED',
    )
    expect(new NetworkTransportError('fetch failed').netErrorCode).toBeUndefined()
  })

  it('retains the originating error as cause', () => {
    const cause = new Error('net::ERR_CONNECTION_CLOSED')
    expect(new NetworkTransportError(cause.message, { cause }).cause).toBe(cause)
  })
})
