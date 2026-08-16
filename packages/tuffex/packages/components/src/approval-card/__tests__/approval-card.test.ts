import type { ApprovalAnswerMap, ApprovalQuestion } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TxApprovalCard from '../src/TxApprovalCard.vue'

function questions(): ApprovalQuestion[] {
  return [
    {
      id: 'count',
      question: 'How many flavors should we launch?',
      type: 'radio',
      options: [
        { value: 'three', label: 'Three (core line)' },
        { value: 'five', label: 'Five (full case)' },
      ],
    },
    {
      id: 'mixins',
      question: 'Which mix-ins should we stock?',
      type: 'check',
      options: [
        { value: 'chips', label: 'Chocolate chips' },
        { value: 'waffle', label: 'Waffle bits' },
      ],
    },
  ]
}

function mountCard(props: Record<string, unknown> = {}) {
  return mount(TxApprovalCard, { props: { questions: questions(), autoAdvance: false, ...props } })
}

describe('txApprovalCard', () => {
  it('renders the current question with its options and a free-text row', () => {
    const wrapper = mountCard()

    expect(wrapper.find('.tx-bui-approval-card__question').text()).toBe('How many flavors should we launch?')
    expect(wrapper.findAll('.tx-bui-approval-card__option')).toHaveLength(2)
    expect(wrapper.find('.tx-bui-approval-card__custom-input').attributes('aria-label')).toBe('Custom answer')
  })

  it('labels the option group by the question rather than a duplicated string', () => {
    const wrapper = mountCard()

    const promptId = wrapper.find('.tx-bui-approval-card__question').attributes('id')
    expect(promptId).toBeTruthy()
    expect(wrapper.find('.tx-bui-approval-card__options').attributes('aria-labelledby')).toBe(promptId)
  })

  it('replaces the selection on a radio question and emits by option value', async () => {
    const wrapper = mountCard()
    const options = wrapper.findAll('.tx-bui-approval-card__option')

    await options[0]!.trigger('click')
    expect(wrapper.emitted('answer')?.[0]).toEqual([{ questionId: 'count', values: ['three'], custom: '' }])

    await options[1]!.trigger('click')
    expect(wrapper.emitted('answer')?.[1]).toEqual([{ questionId: 'count', values: ['five'], custom: '' }])
    expect(options[0]!.attributes('aria-pressed')).toBe('false')
    expect(options[1]!.attributes('aria-pressed')).toBe('true')
  })

  it('accumulates and removes values on a multi-choice question', async () => {
    const wrapper = mountCard({ index: 1 })
    const options = wrapper.findAll('.tx-bui-approval-card__option')

    await options[0]!.trigger('click')
    await options[1]!.trigger('click')
    const latest = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as ApprovalAnswerMap
    expect(latest.mixins.values).toEqual(['chips', 'waffle'])

    await options[0]!.trigger('click')
    const after = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as ApprovalAnswerMap
    expect(after.mixins.values).toEqual(['waffle'])
  })

  it('treats the free-text answer as an alternative to a radio pick', async () => {
    const wrapper = mountCard()

    await wrapper.findAll('.tx-bui-approval-card__option')[0]!.trigger('click')
    const input = wrapper.find('.tx-bui-approval-card__custom-input')
    await input.setValue('Two, then reassess')

    const latest = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as ApprovalAnswerMap
    expect(latest.count).toEqual({ questionId: 'count', values: [], custom: 'Two, then reassess' })
  })

  it('gates the send control on having an answer', async () => {
    const wrapper = mountCard()
    const send = wrapper.find('.tx-bui-approval-card__send')

    expect(send.attributes('disabled')).toBeDefined()
    expect(send.attributes('aria-label')).toBe('Next question')

    await wrapper.findAll('.tx-bui-approval-card__option')[0]!.trigger('click')
    expect(wrapper.find('.tx-bui-approval-card__send').attributes('disabled')).toBeUndefined()
  })

  it('advances through the pager and submits on the last question', async () => {
    const wrapper = mountCard()

    await wrapper.findAll('.tx-bui-approval-card__option')[0]!.trigger('click')
    await wrapper.find('.tx-bui-approval-card__send').trigger('click')
    expect(wrapper.emitted('update:index')?.at(-1)).toEqual([1])
    expect(wrapper.find('.tx-bui-approval-card__send').attributes('aria-label')).toBe('Send answers')

    await wrapper.findAll('.tx-bui-approval-card__option')[0]!.trigger('click')
    await wrapper.find('.tx-bui-approval-card__send').trigger('click')

    expect(wrapper.emitted('update:sent')?.at(-1)).toEqual([true])
    expect(wrapper.emitted('submit')?.[0]?.[0]).toHaveLength(2)
    expect(wrapper.find('.tx-bui-approval-card__sent-text').text()).toBe('Answers sent')
  })

  it('marks the pager dot for the current step and for answered questions', async () => {
    const wrapper = mountCard()
    const dots = () => wrapper.findAll('.tx-bui-approval-card__dot-button')

    expect(dots()[0]!.attributes('aria-current')).toBe('step')
    expect(dots()[0]!.classes()).toContain('is-current')
    expect(dots()[1]!.classes()).not.toContain('is-answered')

    await wrapper.findAll('.tx-bui-approval-card__option')[0]!.trigger('click')
    expect(dots()[0]!.classes()).toContain('is-answered')
  })

  it('disables the pager ends instead of wrapping', async () => {
    const wrapper = mountCard()
    const navs = () => wrapper.findAll('.tx-bui-approval-card__nav')

    expect(navs()[0]!.attributes('disabled')).toBeDefined()
    expect(navs()[1]!.attributes('disabled')).toBeUndefined()

    await navs()[1]!.trigger('click')
    expect(navs()[0]!.attributes('disabled')).toBeUndefined()
    expect(navs()[1]!.attributes('disabled')).toBeDefined()
  })

  it('honours controlled index and answers over its own state', async () => {
    const wrapper = mountCard({
      index: 1,
      modelValue: { mixins: { questionId: 'mixins', values: ['waffle'] } } satisfies ApprovalAnswerMap,
    })

    expect(wrapper.find('.tx-bui-approval-card__question').text()).toBe('Which mix-ins should we stock?')
    expect(wrapper.findAll('.tx-bui-approval-card__option')[1]!.attributes('aria-pressed')).toBe('true')

    // Clicking emits, but the pinned prop keeps the rendered page put.
    await wrapper.findAll('.tx-bui-approval-card__nav')[0]!.trigger('click')
    expect(wrapper.emitted('update:index')?.at(-1)).toEqual([0])
    expect(wrapper.find('.tx-bui-approval-card__question').text()).toBe('Which mix-ins should we stock?')
  })

  it('collapses to a reopen button and back', async () => {
    const wrapper = mountCard()

    await wrapper.find('.tx-bui-approval-card__dismiss').trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
    expect(wrapper.find('.tx-bui-approval-card').exists()).toBe(false)

    const reopen = wrapper.find('.tx-bui-approval-card__reopen')
    expect(reopen.text()).toBe('Open approval')
    await reopen.trigger('click')
    expect(wrapper.emitted('reopen')).toHaveLength(1)
    expect(wrapper.find('.tx-bui-approval-card').exists()).toBe(true)
  })

  it('auto-advances after a single choice when enabled', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mountCard({ autoAdvance: true, autoAdvanceDelay: 480 })

      await wrapper.findAll('.tx-bui-approval-card__option')[0]!.trigger('click')
      expect(wrapper.emitted('update:index')).toBeUndefined()

      vi.advanceTimersByTime(480)
      await wrapper.vm.$nextTick()
      expect(wrapper.emitted('update:index')?.at(-1)).toEqual([1])
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('does not auto-advance on a multi-choice question', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mountCard({ autoAdvance: true, index: 1 })

      await wrapper.findAll('.tx-bui-approval-card__option')[0]!.trigger('click')
      vi.advanceTimersByTime(2000)
      await wrapper.vm.$nextTick()

      expect(wrapper.emitted('update:index')).toBeUndefined()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('suppresses the auto-advance under reduced motion', async () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    vi.useFakeTimers()

    try {
      const wrapper = mountCard({ autoAdvance: true })

      await wrapper.findAll('.tx-bui-approval-card__option')[0]!.trigger('click')
      vi.advanceTimersByTime(2000)
      await wrapper.vm.$nextTick()

      // The answer still lands; only the unrequested page change is dropped.
      expect(wrapper.emitted('answer')).toHaveLength(1)
      expect(wrapper.emitted('update:index')).toBeUndefined()
    }
    finally {
      vi.useRealTimers()
      window.matchMedia = original
    }
  })

  it('resets every piece of state from the submitted panel', async () => {
    const wrapper = mountCard()

    await wrapper.findAll('.tx-bui-approval-card__option')[0]!.trigger('click')
    await wrapper.find('.tx-bui-approval-card__send').trigger('click')
    await wrapper.findAll('.tx-bui-approval-card__option')[0]!.trigger('click')
    await wrapper.find('.tx-bui-approval-card__send').trigger('click')

    await wrapper.find('.tx-bui-approval-card__restart').trigger('click')

    expect(wrapper.emitted('update:sent')?.at(-1)).toEqual([false])
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{}])
    expect(wrapper.find('.tx-bui-approval-card__question').text()).toBe('How many flavors should we launch?')
  })
})
