import type { ToolChipDiff, ToolChipRow } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxDiffChips from '../src/TxDiffChips.vue'
import TxToolChips from '../src/TxToolChips.vue'

function rows(): ToolChipRow[] {
  return [
    {
      id: 'think',
      label: 'Thinking',
      chip: 'Planning the churn schedule…',
      icon: 'think',
      detail: [{ text: 'Weekend demand carries pistachio.' }],
    },
    {
      id: 'write',
      label: 'Write 204 lines',
      chip: 'ChurnSchedule.tsx',
      icon: 'write',
      mono: true,
      detailMono: true,
      detail: [{ text: '+ const windows = slots.filter(Boolean)', tone: 'add' }],
    },
  ]
}

const diffs: ToolChipDiff[] = [
  { file: 'flavors.css', add: 13, del: 0 },
  { file: 'ChurnSchedule.tsx', add: 74, del: 41 },
]

describe('txToolChips', () => {
  it('derives the header count and wires the disclosure to the body', () => {
    const wrapper = mount(TxToolChips, { props: { rows: rows() } })

    const summary = wrapper.find('.tx-bui-tool-chips__summary')
    expect(summary.text()).toBe('2 tool calls')
    expect(summary.attributes('aria-expanded')).toBe('true')
    expect(summary.attributes('aria-controls')).toBe(wrapper.find('.tx-bui-tool-chips__collapse').attributes('id'))
  })

  it('prefers an explicit summary over the derived one', () => {
    const wrapper = mount(TxToolChips, {
      props: { rows: rows(), summary: '4 tool calls, 2 messages' },
    })

    expect(wrapper.find('.tx-bui-tool-chips__summary-text').text()).toBe('4 tool calls, 2 messages')
  })

  it('singularises the derived count', () => {
    const wrapper = mount(TxToolChips, { props: { rows: [rows()[0]!] } })
    expect(wrapper.find('.tx-bui-tool-chips__summary-text').text()).toBe('1 tool call')
  })

  it('toggles the whole run', async () => {
    const wrapper = mount(TxToolChips, { props: { rows: rows() } })

    expect(wrapper.find('.tx-bui-tool-chips__collapse').classes()).toContain('is-open')

    await wrapper.find('.tx-bui-tool-chips__summary').trigger('click')
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    expect(wrapper.find('.tx-bui-tool-chips__collapse').classes()).not.toContain('is-open')
  })

  it('expands rows independently and keys them by id', async () => {
    const wrapper = mount(TxToolChips, { props: { rows: rows() } })
    const buttons = wrapper.findAll('.tx-bui-tool-chips__row-button')

    await buttons[0]!.trigger('click')
    expect(wrapper.emitted('update:expandedRows')?.at(-1)).toEqual([['think']])
    expect(wrapper.emitted('toggle')?.at(-1)).toEqual(['think', true])

    await buttons[1]!.trigger('click')
    expect(wrapper.emitted('update:expandedRows')?.at(-1)).toEqual([['think', 'write']])

    await buttons[0]!.trigger('click')
    expect(wrapper.emitted('update:expandedRows')?.at(-1)).toEqual([['write']])
    expect(wrapper.emitted('toggle')?.at(-1)).toEqual(['think', false])
  })

  it('wires each row button to its own detail region', () => {
    const wrapper = mount(TxToolChips, { props: { rows: rows() } })
    const buttons = wrapper.findAll('.tx-bui-tool-chips__row-button')
    const bodies = wrapper.findAll('.tx-bui-tool-chips__detail-collapse')

    expect(buttons[0]!.attributes('aria-controls')).toBe(bodies[0]!.attributes('id'))
    expect(buttons[1]!.attributes('aria-controls')).toBe(bodies[1]!.attributes('id'))
    expect(bodies[0]!.attributes('id')).not.toBe(bodies[1]!.attributes('id'))
  })

  it('honours a controlled expansion set', async () => {
    const wrapper = mount(TxToolChips, { props: { rows: rows(), expandedRows: ['write'] } })

    const buttons = wrapper.findAll('.tx-bui-tool-chips__row-button')
    expect(buttons[1]!.attributes('aria-expanded')).toBe('true')
    expect(buttons[0]!.attributes('aria-expanded')).toBe('false')

    await buttons[0]!.trigger('click')
    expect(wrapper.emitted('update:expandedRows')?.at(-1)).toEqual([['write', 'think']])
    // The pinned prop still decides what renders.
    expect(wrapper.findAll('.tx-bui-tool-chips__row-button')[0]!.attributes('aria-expanded')).toBe('false')
  })

  it('marks mono chips and mono detail bodies', () => {
    const wrapper = mount(TxToolChips, { props: { rows: rows() } })

    const chips = wrapper.findAll('.tx-bui-tool-chips__chip')
    expect(chips[0]!.classes()).not.toContain('is-mono')
    expect(chips[1]!.classes()).toContain('is-mono')
    expect(wrapper.findAll('.tx-bui-tool-chips__detail')[1]!.classes()).toContain('is-mono')
  })

  it('tones detail lines that report additions', () => {
    const wrapper = mount(TxToolChips, { props: { rows: rows() } })
    const lines = wrapper.findAll('.tx-bui-tool-chips__detail-line')

    expect(lines[0]!.classes()).not.toContain('is-add')
    expect(lines[1]!.classes()).toContain('is-add')
  })

  it('renders the diff section only when there are diffs', async () => {
    const wrapper = mount(TxToolChips, { props: { rows: rows() } })
    expect(wrapper.find('.tx-bui-tool-chips__diffs').exists()).toBe(false)

    await wrapper.setProps({ diffs })
    expect(wrapper.find('.tx-bui-diff-chips').exists()).toBe(true)
  })

  it('forwards diff interactions from the nested chips', async () => {
    const wrapper = mount(TxToolChips, { props: { rows: rows(), diffs, moreCount: 2 } })

    await wrapper.findAll('.tx-bui-diff-chips__chip')[1]!.trigger('click')
    expect(wrapper.emitted('diffClick')?.[0]).toEqual([diffs[1]])

    await wrapper.find('.tx-bui-diff-chips__more').trigger('click')
    expect(wrapper.emitted('more')).toHaveLength(1)
  })

  it('expands and collapses everything through the exposed handles', async () => {
    const wrapper = mount(TxToolChips, { props: { rows: rows() } })
    const vm = wrapper.vm as unknown as { expandAll: () => void, collapseAll: () => void }

    vm.expandAll()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.tx-bui-tool-chips__row-button[aria-expanded="true"]')).toHaveLength(2)

    vm.collapseAll()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.tx-bui-tool-chips__row-button[aria-expanded="true"]')).toHaveLength(0)
  })
})

describe('txDiffChips', () => {
  it('renders added counts always and removed counts only when non-zero', () => {
    const wrapper = mount(TxDiffChips, { props: { diffs } })
    const chips = wrapper.findAll('.tx-bui-diff-chips__chip')

    expect(chips[0]!.find('.tx-bui-diff-chips__add').text()).toBe('+13')
    expect(chips[0]!.find('.tx-bui-diff-chips__del').exists()).toBe(false)
    expect(chips[1]!.find('.tx-bui-diff-chips__del').exists()).toBe(true)
  })

  it('writes the removed count with a minus sign, not a hyphen', () => {
    const wrapper = mount(TxDiffChips, { props: { diffs } })

    const text = wrapper.findAll('.tx-bui-diff-chips__del')[0]!.text()
    expect(text).toBe('−41')
    expect(text.startsWith('-')).toBe(false)
  })

  it('hides the overflow control until there is overflow', async () => {
    const wrapper = mount(TxDiffChips, { props: { diffs } })
    expect(wrapper.find('.tx-bui-diff-chips__more').exists()).toBe(false)

    await wrapper.setProps({ moreCount: 2 })
    expect(wrapper.find('.tx-bui-diff-chips__more').text()).toBe('+2 more')
  })

  it('emits the diff it was given', async () => {
    const wrapper = mount(TxDiffChips, { props: { diffs } })

    await wrapper.findAll('.tx-bui-diff-chips__chip')[0]!.trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([diffs[0]])
  })

  it('staggers the entrance by index', () => {
    const wrapper = mount(TxDiffChips, { props: { diffs, staggerStep: 120 } })

    expect(wrapper.attributes('style')).toContain('--tx-bui-diff-chips-step: 120ms')
    expect(wrapper.findAll('.tx-bui-diff-chips__chip')[1]!.attributes('style')).toContain('--tx-bui-diff-chips-index: 1')
  })
})
