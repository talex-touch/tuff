import type { VoiceDeliveryResult } from '@talex-touch/utils/transport/sdk/domains/voice'
import { describe, expect, it, vi } from 'vitest'
import { commonPrefix, createLiveDelivery } from './voice-live-delivery'

function typist(): {
  send: (delta: string) => Promise<VoiceDeliveryResult>
  typed: () => string
  calls: string[]
} {
  const calls: string[] = []
  return {
    send: async (delta: string) => {
      calls.push(delta)
      return { method: 'native' as const }
    },
    typed: () => calls.join(''),
    calls
  }
}

describe('commonPrefix', () => {
  it('stops at the first disagreement', () => {
    expect(commonPrefix('hello world', 'hello there')).toBe('hello ')
    expect(commonPrefix('abc', 'abc')).toBe('abc')
    expect(commonPrefix('abc', 'xyz')).toBe('')
    expect(commonPrefix('', 'abc')).toBe('')
  })

  /**
   * Slicing by UTF-16 unit would cut an emoji in half and type a lone surrogate, which
   * renders as a replacement glyph in the target application and cannot be un-typed.
   */
  it('never splits a character', () => {
    expect(commonPrefix('👍👎', '👍🤝')).toBe('👍')
    expect(commonPrefix('你好世界', '你好朋友')).toBe('你好')
  })
})

describe('createLiveDelivery', () => {
  it('types only what two consecutive partials agree on', async () => {
    const sink = typist()
    const live = createLiveDelivery(sink.send)

    // Nothing to agree with yet: the first partial is a guess on its own.
    await live.offerPartial('我先')
    expect(sink.typed()).toBe('')

    // "我先" survived into the next partial, so it is safe to type. "去" is new.
    await live.offerPartial('我先去')
    expect(sink.typed()).toBe('我先')

    await live.offerPartial('我先去吃饭')
    expect(sink.typed()).toBe('我先去')
  })

  /**
   * The reason the whole file exists: a revision must land before the characters do.
   */
  it('never types a guess the recognizer goes on to change', async () => {
    const sink = typist()
    const live = createLiveDelivery(sink.send)

    await live.offerPartial('我先去')
    await live.offerPartial('我先去')
    expect(sink.typed()).toBe('我先去')

    // The recognizer revises the tail it had not committed. "我先去" stays, and the
    // wrong "现在" never reaches the target because it was never agreed on twice.
    await live.offerPartial('我先去北京')
    await live.offerPartial('我先去南京')
    expect(sink.typed()).toBe('我先去')

    await live.finish('我先去南京')
    expect(sink.typed()).toBe('我先去南京')
  })

  it('delivers each delta exactly once, in order', async () => {
    const sink = typist()
    const live = createLiveDelivery(sink.send)

    await live.offerPartial('one')
    await live.offerPartial('one two')
    await live.offerPartial('one two three')
    await live.finish('one two three four')

    expect(sink.calls).toEqual(['one', ' two', ' three four'])
    expect(live.delivered()).toBe('one two three four')
  })

  it('appends the tail when a final contradicts what was already typed', async () => {
    const sink = typist()
    const live = createLiveDelivery(sink.send)

    await live.offerPartial('hello wor')
    await live.offerPartial('hello wor')
    expect(sink.typed()).toBe('hello wor')

    // A segment boundary rewrote text that is already in somebody else's buffer. The
    // characters cannot be recalled, so the tail is appended rather than lost as well —
    // the user keeps their sentence and loses the correction.
    const result = await live.finish('hello world')
    expect(result.method).toBe('native')
    expect(sink.typed()).toBe('hello world')
  })

  /** A target that stops accepting keystrokes must not be hammered at the partial rate. */
  it('stops after a failed write instead of retrying every partial', async () => {
    const send = vi.fn(async () => ({ method: 'none' as const, reason: 'target-changed' }))
    const live = createLiveDelivery(send)

    await live.offerPartial('one')
    await live.offerPartial('one two')
    await live.offerPartial('one two three')
    await live.finish('one two three four')

    expect(send).toHaveBeenCalledTimes(1)
    expect(live.delivered()).toBe('')
  })

  it('reports nothing delivered when the speaker never repeated a word', async () => {
    const sink = typist()
    const live = createLiveDelivery(sink.send)

    await live.offerPartial('hi')
    expect(live.delivered()).toBe('')
    expect(sink.calls).toEqual([])
  })
})
