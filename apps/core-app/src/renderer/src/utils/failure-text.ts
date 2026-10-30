import { describePublicFailure } from '../../../shared/public-failure'

/**
 * A failure as a page shows it, once it has crossed the renderer transport.
 *
 * The transport rethrows a failed call as `[TuffTransport] Failed to send "<event>": <failure>` and
 * drops whatever code the failure carried. The preface names the channel for the log; a page that
 * knows a failure by its code has to look past it, and a page that shows the failure must not show
 * it at all.
 */

type FailureTranslate = (key: string, params?: Record<string, unknown>) => string

// What the renderer transport puts in front of a failure it relays; the failure itself follows.
const TRANSPORT_PREFACE = /^\[TuffTransport\] Failed to send "[^"]*": /
// The channel's own failures (`modules/channel/channel-core.ts`). Their codes do not survive the
// transport, so they are known by their text: no answer in time, a request that could not be sent,
// and an error reply that came without a message.
const CHANNEL_TIMEOUT = /^Channel request "[^"]*" timed out after \d+ms$/
const CHANNEL_SEND_FAILED = /^Failed to send channel message "[^"]*": /
const CHANNEL_BARE_REPLY = /^Channel request "[^"]*" replied with code -?\d+: /
// Main's network layer (`@talex-touch/utils/network`) fails the same way for every request, and its
// failures cross as text as well: no answer in time, a target held back for a few seconds after it
// failed, and a status the request did not accept.
const NETWORK_TIMEOUT = /^NETWORK_TIMEOUT(?: after \d+ms)?$/
const NETWORK_COOLDOWN = /^Network guard cooldown active for key "/
const NETWORK_HTTP_STATUS = /^NETWORK_HTTP_STATUS_(\d{3})$/

/** The failure a transport call relayed, without the transport's preface. */
export function unwrapTransportFailure(message: string | null | undefined): string {
  return (message?.trim() ?? '').replace(TRANSPORT_PREFACE, '').trim()
}

/** A caught failure's own message, without the transport's preface; empty when it has none. */
export function failureMessage(error: unknown): string {
  return unwrapTransportFailure(
    error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  )
}

/**
 * A failure a page has no words of its own for. The channel's and the network layer's failures and
 * main's public sentences read in the interface language; text from the system or a library is the
 * only diagnosis there is, so it is shown as it came. `fallback` stands in for a failure with no
 * message.
 */
export function describeFailure(error: unknown, t: FailureTranslate, fallback: string): string {
  const message = failureMessage(error)
  if (!message) return fallback
  if (CHANNEL_TIMEOUT.test(message) || NETWORK_TIMEOUT.test(message))
    return t('common.failures.timedOut')
  if (CHANNEL_SEND_FAILED.test(message) || CHANNEL_BARE_REPLY.test(message))
    return t('common.failures.operationFailed')
  if (NETWORK_COOLDOWN.test(message)) return t('common.failures.coolingDown')
  const status = NETWORK_HTTP_STATUS.exec(message)?.[1]
  if (status) return t('common.failures.httpStatus', { status })
  return describePublicFailure(message, t)
}
