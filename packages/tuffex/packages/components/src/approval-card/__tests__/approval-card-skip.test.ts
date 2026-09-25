import type { ApprovalQuestion } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxApprovalCard from '../src/TxApprovalCard.vue'

const questions: ApprovalQuestion[] = [
  {
    id: 'count',
    question: 'How many flavors should we launch?',
    options: [
      { value: 'three', label: 'Three (core line)' },
      { value: 'five', label: 'Five (full case)' },
    ],
  },
  {
    id: 'timing',
    question: 'When?',
    options: [
      { value: 'q1', label: 'Q1' },
      { value: 'q2', label: 'Q2' },
    ],
  },
]

function mountCard(props: Record<string, unknown> = {}) {
  return mount(TxApprovalCard, { props: { questions, ...props } })
}

describe('txApprovalCard skip', () => {
  it('renders no skip control by default', () => {
    // On a form where every question is required, offering a way out is worse
    // than not having one.
    expect(mountCard().find('.tx-bui-approval-card__skip').exists()).toBe(false)
  })

  it('renders it when asked, with the host wording', () => {
    const wrapper = mountCard({ skippable: true, skipLabel: '跳过' })

    expect(wrapper.find('.tx-bui-approval-card__skip').text()).toBe('跳过')
  })

  it('advances to the next question without recording an answer', async () => {
    const wrapper = mountCard({ skippable: true })

    await wrapper.find('.tx-bui-approval-card__skip').trigger('click')

    expect(wrapper.emitted('update:index')!.at(-1)).toEqual([1])
    // The distinction that makes skip worth having: a host can tell "declined
    // to answer" from "answered and moved on".
    expect(wrapper.emitted('answer')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('reports which question was skipped', async () => {
    const wrapper = mountCard({ skippable: true })

    await wrapper.find('.tx-bui-approval-card__skip').trigger('click')

    expect(wrapper.emitted('skip')![0]).toEqual([{ questionId: 'count', index: 0 }])
  })

  it('ends the run when the last question is skipped', async () => {
    const wrapper = mountCard({ skippable: true, index: 1 })

    await wrapper.find('.tx-bui-approval-card__skip').trigger('click')

    // Nowhere further to go, so it finishes the same way submitting does.
    expect(wrapper.emitted('update:sent')!.at(-1)).toEqual([true])
  })

  it('disappears once the card is sent', () => {
    const wrapper = mountCard({ skippable: true, sent: true })

    expect(wrapper.find('.tx-bui-approval-card__skip').exists()).toBe(false)
  })

  it('does not require an answer, unlike send', () => {
    const wrapper = mountCard({ skippable: true })

    // Send is gated on `hasAnswer`; skip is the way past that gate.
    expect(wrapper.find('.tx-bui-approval-card__send').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.tx-bui-approval-card__skip').attributes('disabled')).toBeUndefined()
  })

  it('is a real button, so it is reachable and typed', () => {
    const skip = mountCard({ skippable: true }).find('.tx-bui-approval-card__skip')

    expect(skip.element.tagName).toBe('BUTTON')
    expect(skip.attributes('type')).toBe('button')
  })
})
