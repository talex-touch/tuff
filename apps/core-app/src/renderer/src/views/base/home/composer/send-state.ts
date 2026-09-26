import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'

/**
 * What the composer's send key is showing. Derived, never stored: every input is state the page
 * already owns (the draft, the running turn, the pending tool confirmation, the dictation session).
 *
 * Two shapes: `empty` / `ready` are the 32px circle, `waiting` / `streaming` / `blocked` the 72px
 * 「■ 停止」 capsule. The launch — `ready → waiting` at the press — is not a state but a transition the
 * page triggers explicitly (`ComposerToolbar.launch()`), because the send itself clears the draft a
 * flush before the turn starts.
 */
export type SendState = 'empty' | 'ready' | 'waiting' | 'streaming' | 'blocked'

export interface SendStateInput {
  /** The draft has non-whitespace text. */
  hasText: boolean
  /** A reply is running (`isStreaming`). */
  streaming: boolean
  /** The running reply has produced nothing yet — the thinking orb's condition. */
  awaitingFirstToken: boolean
  /** The model is waiting on a tool confirmation the user has to answer. */
  blocked: boolean
  /**
   * A dictation session is starting, listening or finishing. Pressing send then means 「结束并发送」
   * (D10-d): the session stops and whatever it inserted goes out once it lands — so the key is
   * pressable even before the first word is in the draft.
   */
  dictating: boolean
}

export function deriveSendState(input: SendStateInput): SendState {
  if (!input.streaming) return input.hasText || input.dictating ? 'ready' : 'empty'
  if (input.blocked) return 'blocked'
  if (input.awaitingFirstToken) return 'waiting'
  return 'streaming'
}

/** The capsule states: the key is a stop button and the microphone has yielded its slot to it. */
export function isCapsuleSendState(state: SendState): boolean {
  return state === 'waiting' || state === 'streaming' || state === 'blocked'
}

/**
 * The assistant row is still waiting for its first token: the exact condition the transcript uses
 * for its thinking orb (`status === 'streaming' && !content && no segments`), so the send key's
 * `waiting` and the orb can never disagree. `toMessageSegments` turns a reasoning span, a tool call
 * or a non-empty text part into a segment and skips everything else — mirrored part for part here.
 */
export function isAwaitingFirstToken(
  message: Pick<ConversationMessage, 'role' | 'status' | 'content' | 'parts'> | undefined
): boolean {
  if (!message || message.role !== 'assistant' || message.status !== 'streaming') return false
  if (message.content) return false
  return !(message.parts ?? []).some(
    (part) =>
      part.type === 'reasoning' ||
      part.type === 'tool-call' ||
      (part.type === 'text' && !!part.text)
  )
}
