import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import { describe, expect, it } from 'vitest'
import {
  deriveSendState,
  isAwaitingFirstToken,
  isCapsuleSendState,
  type SendState,
  type SendStateInput
} from './send-state'

const idle: SendStateInput = {
  hasText: false,
  streaming: false,
  awaitingFirstToken: false,
  blocked: false,
  dictating: false
}

describe('deriveSendState', () => {
  // Every combination of the five inputs, so a reordered branch cannot hide behind a sample.
  const table: Array<[Partial<SendStateInput>, SendState]> = [
    [{}, 'empty'],
    [{ hasText: true }, 'ready'],
    // D10-d: while dictating the key means 「结束并发送」, pressable before any text has landed.
    [{ dictating: true }, 'ready'],
    [{ hasText: true, dictating: true }, 'ready'],
    // Not streaming: the turn-only inputs are stale and must not leak into the circle.
    [{ blocked: true }, 'empty'],
    [{ awaitingFirstToken: true }, 'empty'],
    [{ hasText: true, blocked: true, awaitingFirstToken: true }, 'ready'],
    [{ streaming: true }, 'streaming'],
    [{ streaming: true, awaitingFirstToken: true }, 'waiting'],
    // A pending tool confirmation outranks the wait: the model is waiting on the user.
    [{ streaming: true, blocked: true }, 'blocked'],
    [{ streaming: true, blocked: true, awaitingFirstToken: true }, 'blocked'],
    // Streaming ignores the draft and the dictation: the key is a stop button.
    [{ streaming: true, hasText: true }, 'streaming'],
    [{ streaming: true, dictating: true }, 'streaming'],
    [{ streaming: true, hasText: true, awaitingFirstToken: true, dictating: true }, 'waiting']
  ]

  it.each(table)('%o → %s', (input, expected) => {
    expect(deriveSendState({ ...idle, ...input })).toBe(expected)
  })

  it('covers all 32 input combinations with one of the five states', () => {
    const keys = ['hasText', 'streaming', 'awaitingFirstToken', 'blocked', 'dictating'] as const
    for (let mask = 0; mask < 32; mask += 1) {
      const input = Object.fromEntries(
        keys.map((key, bit) => [key, Boolean(mask & (1 << bit))])
      ) as unknown as SendStateInput
      const state = deriveSendState(input)
      expect(isCapsuleSendState(state)).toBe(input.streaming)
      if (!input.streaming) expect(state).toBe(input.hasText || input.dictating ? 'ready' : 'empty')
    }
  })
})

describe('isAwaitingFirstToken', () => {
  function assistant(patch: Partial<ConversationMessage>): ConversationMessage {
    return { id: 'a', role: 'assistant', content: '', status: 'streaming', ...patch }
  }

  it('is true for a streaming assistant row with nothing in it yet', () => {
    expect(isAwaitingFirstToken(assistant({}))).toBe(true)
    // An emptied text part is the accumulator mid-rollback, not a paragraph.
    expect(isAwaitingFirstToken(assistant({ parts: [{ type: 'text', text: '' }] }))).toBe(true)
  })

  it('is false once anything the transcript would render has arrived', () => {
    expect(isAwaitingFirstToken(assistant({ content: 'Hi' }))).toBe(false)
    expect(isAwaitingFirstToken(assistant({ parts: [{ type: 'text', text: 'Hi' }] }))).toBe(false)
    expect(isAwaitingFirstToken(assistant({ parts: [{ type: 'reasoning', text: '' }] }))).toBe(
      false
    )
    expect(
      isAwaitingFirstToken(
        assistant({ parts: [{ type: 'tool-call', id: 't', name: 'search', status: 'running' }] })
      )
    ).toBe(false)
  })

  it('is false for anything but a streaming assistant row', () => {
    expect(isAwaitingFirstToken(undefined)).toBe(false)
    expect(isAwaitingFirstToken(assistant({ status: 'complete' }))).toBe(false)
    expect(isAwaitingFirstToken(assistant({ status: 'failed' }))).toBe(false)
    expect(isAwaitingFirstToken({ ...assistant({}), role: 'user' })).toBe(false)
  })
})
