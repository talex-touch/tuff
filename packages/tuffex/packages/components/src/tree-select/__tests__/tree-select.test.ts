import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import TuffInput from '../../input/src/TxInput.vue'
import TxTree from '../../tree/src/TxTree.vue'
import TxTreeSelect from '../src/TxTreeSelect.vue'

const PopoverStub = defineComponent({
  name: 'TxPopover',
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'open', 'close'],
  template: '<div><slot name="reference" /><div><slot /></div></div>',
})

describe('txTreeSelect', () => {
  const nodes = [
    { key: 'a', label: 'Alpha', children: [{ key: 'a-1', label: 'Alpha-1' }] },
    { key: 'b', label: 'Beta' },
  ]

  it('emits selection on tree click', async () => {
    const wrapper = mount(TxTreeSelect, {
      props: { nodes, searchable: false },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    const labels = wrapper.findAll('.tx-tree-select__label')
    const beta = labels.find(label => label.text() === 'Beta')
    await beta?.trigger('click')

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted?.[0][0]).toBe('b')
    expect(emitted).toHaveLength(1)
  })

  it('keeps the treeitem as the single keyboard entry for each custom row', () => {
    const wrapper = mount(TxTreeSelect, {
      props: { nodes, searchable: false },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    expect(wrapper.find('[role="treeitem"]').attributes('tabindex')).toBe('0')
    expect(wrapper.find('.tx-card-item').attributes('tabindex')).toBe('-1')
    expect(wrapper.find('.tx-tree-select__caret').attributes('tabindex')).toBe('-1')
  })

  it('renders empty state when nodes are missing', () => {
    const wrapper = mount(TxTreeSelect, {
      props: { nodes: [], searchable: false },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    expect(wrapper.find('.tx-tree-select__empty').exists()).toBe(true)
  })

  it('clears selection from the clear button', async () => {
    const wrapper = mount(TxTreeSelect, {
      props: { nodes, modelValue: 'a', clearable: true, searchable: false },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    await wrapper.find('.tx-tree-select__clear').trigger('click')

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted?.[0][0]).toBeUndefined()
  })

  it('resets the search query when the dropdown closes', async () => {
    const wrapper = mount(TxTreeSelect, {
      props: { nodes, searchable: true },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    // Open and type a filter.
    ;(wrapper.vm as any).open()
    await nextTick()
    wrapper.findComponent(TuffInput).vm.$emit('update:modelValue', 'alph')
    await nextTick()
    expect(wrapper.findComponent(TxTree).props('filterText')).toBe('alph')

    // Closing must clear the filter so reopening starts clean rather than showing
    // the previous query.
    ;(wrapper.vm as any).close()
    await nextTick()

    expect(wrapper.findComponent(TxTree).props('filterText')).toBe('')
  })

  it('toggles subtree expansion smoothly via caret without double-indenting custom rows', async () => {
    const wrapper = mount(TxTreeSelect, {
      props: { nodes, searchable: false },
      global: { stubs: { TxPopover: PopoverStub, transition: false } },
    })

    const caret = wrapper.find('.tx-tree-select__caret')
    expect(caret.classes()).not.toContain('is-expanded')
    expect(wrapper.find('.tx-tree__children').exists()).toBe(false)

    await caret.trigger('click')

    expect(caret.classes()).toContain('is-expanded')
    expect(wrapper.find('.tx-tree__children').exists()).toBe(true)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    const items = wrapper.findAll('[role="treeitem"]')
    expect((items[1]?.element as HTMLElement).style.paddingLeft).toBe('')
    expect((wrapper.findAll('.tx-tree-select__item')[1]?.element as HTMLElement).style.paddingLeft).toBe('26px')
  })
})
