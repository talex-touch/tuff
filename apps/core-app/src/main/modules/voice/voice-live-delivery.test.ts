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

  it('appends only the new Chinese suffix when a final adds punctuation inside typed text', async () => {
    const sink = typist()
    const live = createLiveDelivery(sink.send)
    const partial = '明天去超市带上苹果、香蕉和菠萝'
    const finalText = '明天去超市，带上苹果、香蕉和菠萝，这三样都要'

    await live.offerPartial(partial)
    await live.offerPartial(partial)
    await live.finish(finalText)

    // The first comma is inside text already delivered to another app and cannot be inserted.
    // The suffix must nevertheless be based on the reconciled transcript, not on a rewound
    // bookkeeping prefix that would type the fruit list twice.
    expect(sink.calls).toEqual([partial, '，这三样都要'])
    expect(sink.typed()).toBe('明天去超市带上苹果、香蕉和菠萝，这三样都要')
    expect(live.delivered()).toBe(sink.typed())

    await live.finish(finalText)
    expect(sink.calls).toEqual([partial, '，这三样都要'])
  })

  it('continues after a punctuation-revised partial without replaying its committed prefix', async () => {
    const sink = typist()
    const live = createLiveDelivery(sink.send)
    const committed = '请带上苹果、香蕉和菠萝'
    const revised = '请带上苹果，香蕉和菠萝这三样都要'
    const continued = `${revised}还有牛奶`

    await live.offerPartial(committed)
    await live.offerPartial(committed)
    await live.offerPartial(revised)
    await live.offerPartial(continued)
    await live.finish(continued)

    expect(sink.calls).toEqual([committed, '这三样都要', '还有牛奶'])
    expect(sink.typed()).toBe('请带上苹果、香蕉和菠萝这三样都要还有牛奶')
    expect(live.delivered()).toBe(sink.typed())
  })

  it('does not append after a final lexically revises committed text', async () => {
    const sink = typist()
    const live = createLiveDelivery(sink.send)

    await live.offerPartial('请带上苹果、香蕉和菠萝')
    await live.offerPartial('请带上苹果、香蕉和菠萝')

    await expect(live.finish('请带上苹果、梨和菠萝')).resolves.toEqual({
      method: 'none',
      reason: 'transcript-revised'
    })
    expect(sink.calls).toEqual(['请带上苹果、香蕉和菠萝'])
    expect(live.delivered()).toBe('请带上苹果、香蕉和菠萝')
  })

  /** A target that stops accepting keystrokes must not be hammered at the partial rate. */
  it('keeps a failed sink terminal and preserves its original delivery failure', async () => {
    const failure = { method: 'none' as const, reason: 'target-changed' }
    const send = vi.fn(async () => failure)
    const live = createLiveDelivery(send)

    await live.offerPartial('one')
    await live.offerPartial('one two')
    await live.offerPartial('one two three')

    await expect(live.finish('one two three four')).resolves.toEqual(failure)
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
