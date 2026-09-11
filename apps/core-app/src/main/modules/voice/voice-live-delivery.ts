import type { VoiceDeliveryResult } from '@talex-touch/utils/transport/sdk/domains/voice'

/**
 * Incremental delivery for push-to-talk dictation.
 *
 * The hard part is not speed, it is that recognition revises itself. A partial is a
 * guess: "我先去" can become "我现在去" one frame later. Typing every partial straight
 * into somebody else's text field would put those wrong guesses somewhere they cannot be
 * taken back from — backspacing is not an option, because nothing here knows whether the
 * user moved the caret in between, and a stray backspace deletes their work.
 *
 * Only the part two consecutive partials agree on is typed. This reduces unstable
 * guesses, but even that prefix can later change. Reconcile punctuation without
 * rewinding the acknowledged text; a lexical conflict must not replay an already
 * typed suffix or guess how to edit the user's buffer.
 */

/** Code points, not UTF-16 units: slicing mid-surrogate would emit half a character. */
function codePoints(value: string): string[] {
  return Array.from(value)
}

/** How much of the front two strings share, as a string. */
export function commonPrefix(a: string, b: string): string {
  const left = codePoints(a)
  const right = codePoints(b)
  const limit = Math.min(left.length, right.length)
  let shared = 0
  while (shared < limit && left[shared] === right[shared]) shared += 1
  return left.slice(0, shared).join('')
}

/** Locate the committed prefix in a revised hypothesis without changing typed text. */
function committedPrefixEnd(committed: string, target: string): number {
  if (target.startsWith(committed)) return committed.length

  let typedOffset = 0
  let targetOffset = 0
  while (typedOffset < committed.length) {
    const typedPoint = committed.codePointAt(typedOffset)!
    const targetPoint = target.codePointAt(targetOffset)
    const typedWidth = typedPoint > 0xffff ? 2 : 1
    const targetWidth = targetPoint !== undefined && targetPoint > 0xffff ? 2 : 1
    if (typedPoint === targetPoint) {
      typedOffset += typedWidth
      targetOffset += targetWidth
      continue
    }

    // Match punctuation revisions in order, never by a repeated suffix elsewhere
    // in the sentence. Letters, numbers, symbols and whitespace must still match.
    const typedPunctuation = /\p{P}/u.test(String.fromCodePoint(typedPoint))
    const targetPunctuation =
      targetPoint !== undefined && /\p{P}/u.test(String.fromCodePoint(targetPoint))
    if (!typedPunctuation && !targetPunctuation) return -1
    if (typedPunctuation) typedOffset += typedWidth
    if (targetPunctuation) targetOffset += targetWidth
  }
  return targetOffset
}

export interface LiveDeliverySink {
  /** Types one delta. Never pastes: a paste per partial would thrash the clipboard. */
  (delta: string): Promise<VoiceDeliveryResult>
}

export interface LiveDelivery {
  /** Offer the newest partial. Delivers whatever it and the previous one agree on. */
  offerPartial: (partial: string) => Promise<void>
  /** Deliver the remainder of a finished segment and report how the last write went. */
  finish: (finalText: string) => Promise<VoiceDeliveryResult>
  /** The exact concatenation of successfully typed deltas. Never rewinds. */
  delivered: () => string
}

export function createLiveDelivery(send: LiveDeliverySink): LiveDelivery {
  let delivered = ''
  let previousPartial = ''
  let lastResult: VoiceDeliveryResult = { method: 'none', reason: 'empty' }
  /** One failed write stops the session: past that point the target is not listening. */
  let broken = false

  async function advanceTo(target: string): Promise<VoiceDeliveryResult> {
    if (broken) return lastResult
    const offset = committedPrefixEnd(delivered, target)
    if (offset < 0) return { method: 'none', reason: 'transcript-revised' }
    const delta = target.slice(offset)
    if (!delta) return lastResult

    lastResult = await send(delta)
    if (lastResult.method === 'none') {
      // Nothing landed. Leave `delivered` where it was so the same text is not counted
      // as typed, and stop — retrying every partial into a target that is not accepting
      // keystrokes just repeats the failure at 10Hz.
      broken = true
      return lastResult
    }
    delivered += delta
    return lastResult
  }

  return {
    async offerPartial(partial: string): Promise<void> {
      const agreed = commonPrefix(previousPartial, partial)
      previousPartial = partial
      await advanceTo(agreed)
    },

    async finish(finalText: string): Promise<VoiceDeliveryResult> {
      previousPartial = finalText
      return advanceTo(finalText)
    },

    delivered: () => delivered
  }
}
