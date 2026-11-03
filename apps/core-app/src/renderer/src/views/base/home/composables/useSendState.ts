import { ref, shallowRef } from 'vue'
import type { SendChoreography } from '~/composables/useSendChoreography'
import { createLatestOnly } from '~/modules/conversation/latest-only'
import type { OpeningHold } from './useHomeOpening'

export interface SendStateOptions {
  /** Read only when a send is invalidated, never during setup: the motion score is set up later. */
  choreography: () => Pick<SendChoreography, 'invalidate'>
}

/**
 * What a send leaves on the page while it is in the air. The send path writes it, the thread
 * restore clears it when the thread underneath changes, and the append watcher and the greeting
 * read it — so it lives here, below all of them, rather than in any one.
 */
export function useSendState(options: SendStateOptions) {
  /** A send is in flight in this view. */
  const sending = ref(false)
  /**
   * The sent text is still on the composer (lifted, not yet clear of it): the empty field's
   * placeholder would read as a second text under it, so it waits.
   */
  const lifting = ref(false)
  /**
   * The opening as the greeting shows it. `submit` pins it for the one flush between taking the lead
   * and the greeting's leave: `takeLead` drops an opening still being written, and the greeting should
   * fade out with the words the reader saw rather than lose them a frame before it goes.
   */
  const openingHold = shallowRef<OpeningHold | null>(null)
  /** Which send may still move the page; a newer one, or leaving the page, takes that right away. */
  const submission = createLatestOnly()

  /**
   * Set by `submit` just before it sends: an explicit hand-off, not an inference. A user message can
   * also arrive programmatically — a form submission calls `conversation.send` directly — and
   * guessing "user message ⇒ the composer will choreograph it" left those permanently hidden.
   */
  let choreographed = false

  function claimChoreographedSend(claimed: boolean): void {
    choreographed = claimed
  }

  /** Reads and clears the claim: one batch consumes it, whatever it does next. */
  function consumeChoreographedSend(): boolean {
    const claimed = choreographed
    choreographed = false
    return claimed
  }

  /**
   * The id `submit` minted for a first send, until that send has settled. The conversation watcher
   * leaves the clip alone for it — minted, or taken back when the send failed — because the thread
   * on screen has not changed, and a failed voice send has just put its clip back.
   */
  let ownMintedId: string | null = null

  function setOwnMintedId(id: string | null): void {
    ownMintedId = id
  }

  /**
   * Whether a change of thread is only this send's own id coming or going. A change to `null`
   * ends the claim — the send failed and the id was released.
   */
  function isOwnMintedChange(next: string | null, previous: string | null | undefined): boolean {
    if (ownMintedId === null || (next !== ownMintedId && previous !== ownMintedId)) return false
    if (next === null) ownMintedId = null
    return true
  }

  function invalidatePageSubmission(): void {
    submission.claim()
    sending.value = false
    choreographed = false
    openingHold.value = null
    lifting.value = false
    options.choreography().invalidate()
  }

  return {
    sending,
    lifting,
    openingHold,
    submission,
    claimChoreographedSend,
    consumeChoreographedSend,
    setOwnMintedId,
    isOwnMintedChange,
    invalidatePageSubmission
  }
}

export type UseSendStateReturn = ReturnType<typeof useSendState>
