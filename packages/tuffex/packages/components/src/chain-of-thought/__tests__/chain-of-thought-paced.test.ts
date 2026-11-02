import type { AiChainStep } from '../../ai-elements/src/types'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxChainOfThought from '../src/TxChainOfThought.vue'

enableAutoUnmount(afterEach)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
})

afterEach(() => {
  vi.useRealTimers()
})

const THOUGHT = 'The request is for a patternless number, so avoid anything an algorithm could predict. '

function step(body: string, status: AiChainStep['status'] = 'active'): AiChainStep {
  return { id: 't', kind: 'thinking', title: 'Thinking', body, status }
}

function mountChain(steps: AiChainStep[], streaming: boolean) {
  return mount(TxChainOfThought, { props: { steps, streaming, defaultOpen: true } })
}

const shown = (wrapper: ReturnType<typeof mountChain>) => wrapper.find('.tx-chain-of-thought__md').text()

describe('txChainOfThought thinking body pacing', () => {
  it('shows a thought that arrives whole a piece at a time while it is live', async () => {
    const wrapper = mountChain([step('')], true)
    await wrapper.setProps({ steps: [step(THOUGHT)] })
    vi.advanceTimersByTime(48)
    await nextTick()

    const early = shown(wrapper)
    expect(early.length).toBeGreaterThan(0)
    expect(early.length).toBeLessThan(THOUGHT.trim().length)

    vi.advanceTimersByTime(1000)
    await nextTick()
    expect(shown(wrapper)).toBe(THOUGHT.trim())
  })

  it('shows a settled thought in full at once, as a reload of an old turn does', () => {
    const wrapper = mountChain([step(THOUGHT, 'done')], false)

    expect(shown(wrapper)).toBe(THOUGHT.trim())
  })

  it('drains what is left when the step settles', async () => {
    const wrapper = mountChain([step('')], true)
    await wrapper.setProps({ steps: [step(THOUGHT.repeat(4))] })
    vi.advanceTimersByTime(32)
    await nextTick()
    expect(shown(wrapper).length).toBeLessThan(THOUGHT.repeat(4).trim().length)

    await wrapper.setProps({ steps: [step(THOUGHT.repeat(4), 'done')], streaming: false })
    vi.advanceTimersByTime(800)
    await nextTick()

    expect(shown(wrapper)).toBe(THOUGHT.repeat(4).trim())
  })
  it('instantly reveals all thinking text when step settles, preventing dual-typing with subsequent prose', async () => {
    const wrapper = mountChain([step('')], true)
    await wrapper.setProps({ steps: [step(THOUGHT.repeat(4))] })
    vi.advanceTimersByTime(32)
    await nextTick()
    expect(shown(wrapper).length).toBeLessThan(THOUGHT.repeat(4).trim().length)

    // Step settles (e.g. model moves to prose/tools)
    await wrapper.setProps({ steps: [step(THOUGHT.repeat(4), 'done')], streaming: false })
    await nextTick()

    // Must be flushed immediately (0ms delay) so it doesn't drain while prose is streaming
    expect(shown(wrapper)).toBe(THOUGHT.repeat(4).trim())
  })


  describe('following the tail', () => {
    /**
     * jsdom has no layout, so the scroller's height is derived from what has been rendered into it:
     * it grows when the new text is patched in - after the decision to follow has been made, the
     * order the real component runs in - not when the test says so.
     */
    function stubScroller(wrapper: ReturnType<typeof mountChain>, scrollTop: number) {
      const el = wrapper.find('.tx-chain-of-thought__body').element as HTMLElement
      const state = { scrollTop }
      Object.defineProperty(el, 'scrollHeight', {
        configurable: true,
        get: () => 400 + (el.textContent?.length ?? 0) * 4,
      })
      Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 140 })
      Object.defineProperty(el, 'scrollTop', {
        configurable: true,
        get: () => state.scrollTop,
        set: (value: number) => {
          state.scrollTop = value
        },
      })
      return { el, state }
    }

    it('follows the end while the reader is at the bottom', async () => {
      const wrapper = mountChain([step(THOUGHT)], true)
      // Nothing has been released yet: the content is 400 tall, so the bottom is at 260.
      const { el, state } = stubScroller(wrapper, 260)

      vi.advanceTimersByTime(48)
      await nextTick()

      expect(el.scrollHeight).toBeGreaterThan(400)
      expect(state.scrollTop).toBe(el.scrollHeight)
    })

    it('lets go once the reader has scrolled up to read, and does not yank them back', async () => {
      const wrapper = mountChain([step(THOUGHT)], true)
      const { el, state } = stubScroller(wrapper, 40)

      vi.advanceTimersByTime(48)
      await nextTick()

      expect(el.scrollHeight).toBeGreaterThan(400)
      expect(state.scrollTop).toBe(40)
    })
  })

  it('never shows the half-typed markup of a bold run that is still arriving', async () => {
    const wrapper = mountChain([step('')], true)
    await wrapper.setProps({ steps: [step('Plan: **choose the digits')] })
    vi.advanceTimersByTime(1000)
    await nextTick()

    expect(wrapper.find('.tx-chain-of-thought__md').text()).not.toContain('**')
    expect(wrapper.find('.tx-chain-of-thought__md strong').exists()).toBe(true)
  })

  it('keeps sanitizing what it shows while it is being released', async () => {
    const wrapper = mountChain([step('')], true)
    await wrapper.setProps({ steps: [step('ok <img src=x onerror=alert(1)>')] })
    vi.advanceTimersByTime(1000)
    await nextTick()

    expect(wrapper.find('.tx-chain-of-thought__md').html()).not.toContain('onerror')
  })

  it('leaves a tool step\'s output as it arrived, unpaced', async () => {
    const wrapper = mountChain([{ id: 'c', kind: 'tool', title: 'exec', body: 'line one\nline two', status: 'active' }], true)

    expect(wrapper.find('.tx-chain-of-thought__raw').text()).toBe('line one\nline two')
  })
})
