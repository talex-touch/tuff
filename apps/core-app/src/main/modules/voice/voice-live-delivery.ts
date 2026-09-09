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
 * So only the part two consecutive partials agree on is ever typed. A revision changes
 * the tail, and the tail is exactly what has not been committed yet, so the correction
 * lands before the characters do. The cost is one partial of latency — the text trails
 * the voice by roughly 200-300ms instead of appearing instantly, which is the trade the
 * feature is worth making and the one thing this file exists to enforce.
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

export interface LiveDeliverySink {
  /** Types one delta. Never pastes: a paste per partial would thrash the clipboard. */
  (delta: string): Promise<VoiceDeliveryResult>
}

export interface LiveDelivery {
  /** Offer the newest partial. Delivers whatever it and the previous one agree on. */
  offerPartial: (partial: string) => Promise<void>
  /** Deliver the remainder of a finished segment and report how the last write went. */
  finish: (finalText: string) => Promise<VoiceDeliveryResult>
  /** What has actually been typed so far — the tests assert against this. */
  delivered: () => string
}

export function createLiveDelivery(send: LiveDeliverySink): LiveDelivery {
  let delivered = ''
  let previousPartial = ''
  let lastResult: VoiceDeliveryResult = { method: 'none', reason: 'empty' }
  /** One failed write stops the session: past that point the target is not listening. */
  let broken = false

  async function advanceTo(target: string): Promise<void> {
    if (broken || !target.startsWith(delivered)) return
    const delta = target.slice(delivered.length)
    if (!delta) return

    lastResult = await send(delta)
    if (lastResult.method === 'none') {
      // Nothing landed. Leave `delivered` where it was so the same text is not counted
      // as typed, and stop — retrying every partial into a target that is not accepting
      // keystrokes just repeats the failure at 10Hz.
      broken = true
      return
    }
    delivered = target
  }

  return {
    async offerPartial(partial: string): Promise<void> {
      const agreed = commonPrefix(previousPartial, partial)
      previousPartial = partial
      await advanceTo(agreed)
    },

    async finish(finalText: string): Promise<VoiceDeliveryResult> {
      previousPartial = finalText
      if (finalText.startsWith(delivered)) {
        await advanceTo(finalText)
        return lastResult
      }

      /*
       * The recognizer changed its mind about something already typed.
       *
       * Rare, because only agreed-on text is ever sent, but not impossible: a provider
       * can revise across a segment boundary. Those characters are gone — they are in
       * another application's buffer. Rewinding the bookkeeping to the shared prefix at
       * least appends the rest, so the user loses the correction rather than the whole
       * tail of their sentence.
       */
      delivered = commonPrefix(delivered, finalText)
      await advanceTo(finalText)
      return lastResult
    },

    delivered: () => delivered
  }
}
