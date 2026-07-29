import type { TxSearchSelectOption } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import TxSearchSelect from '../src/TxSearchSelect.vue'

const PopoverStub = defineComponent({
  name: 'TxPopover',
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'open', 'close'],
  template: '<div><slot name="reference" /><div><slot /></div></div>',
})

describe('txSearchSelect', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ]

  it('filters and selects options', async () => {
    const wrapper = mount(TxSearchSelect, {
      props: { options },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    const input = wrapper.find('input')
    await input.setValue('Alpha')

    const items = wrapper.findAll('.tx-search-select__item')
    const alpha = items.find(item => item.text().includes('Alpha'))
    await alpha?.trigger('click')

    const emitted = wrapper.emitted('select') as Array<[TxSearchSelectOption]> | undefined
    expect(emitted?.[0][0].value).toBe('a')
  })

  it('emits remote search after debounce', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(TxSearchSelect, {
        props: {
          options: [],
          remote: true,
          searchDebounce: 120,
        },
        global: { stubs: { TxPopover: PopoverStub } },
      })

      const input = wrapper.find('input')
      await input.setValue('remote-keyword')

      vi.advanceTimersByTime(119)
      expect(wrapper.emitted('search')).toBeFalsy()

      vi.advanceTimersByTime(1)
      const emitted = wrapper.emitted('search') as Array<[string]> | undefined
      expect(emitted?.[0][0]).toBe('remote-keyword')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('clears the input when the value is reset externally', async () => {
    // Regression: the selectedOption watcher early-returned when no option
    // matched, so resetting modelValue left the previous label in the input.
    const wrapper = mount(TxSearchSelect, {
      props: { options, modelValue: 'a' },
      global: { stubs: { TxPopover: PopoverStub } },
    })
    await nextTick()

    expect(wrapper.find('input').element.value).toBe('Alpha')

    await wrapper.setProps({ modelValue: '' })
    await nextTick()

    expect(wrapper.find('input').element.value).toBe('')
  })

  it('renders empty state when no results match', async () => {
    const wrapper = mount(TxSearchSelect, {
      props: { options: [] },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    const input = wrapper.find('input')
    await input.setValue('zzz')

    expect(wrapper.find('.tx-search-select__empty').exists()).toBe(true)
  })

  it('exposes combobox semantics on the input and a listbox with option roles (#8)', () => {
    const wrapper = mount(TxSearchSelect, {
      props: { options },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    const input = wrapper.find('input')
    const listbox = wrapper.find('.tx-search-select__list')

    expect(input.attributes('role')).toBe('combobox')
    expect(input.attributes('aria-expanded')).toBe('false')
    expect(listbox.attributes('role')).toBe('listbox')
    expect(input.attributes('aria-controls')).toBe(listbox.attributes('id'))

    const items = wrapper.findAll('.tx-search-select__item')
    expect(items[0].attributes('role')).toBe('option')
    expect(items[0].attributes('aria-selected')).toBe('false')
  })

  it('navigates options with arrow keys and picks with Enter (#8)', async () => {
    const wrapper = mount(TxSearchSelect, {
      props: { options },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    const input = wrapper.find('input')

    // First ArrowDown opens the panel and highlights the first option.
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(input.attributes('aria-expanded')).toBe('true')
    let items = wrapper.findAll('.tx-search-select__item')
    expect(items[0].classes()).toContain('is-active')
    expect(input.attributes('aria-activedescendant')).toBe(items[0].attributes('id'))

    // A second ArrowDown moves the virtual-focus cursor to the second option.
    await input.trigger('keydown', { key: 'ArrowDown' })
    items = wrapper.findAll('.tx-search-select__item')
    expect(items[1].classes()).toContain('is-active')
    expect(input.attributes('aria-activedescendant')).toBe(items[1].attributes('id'))

    // Enter picks the highlighted option instead of merely emitting a search.
    await input.trigger('keydown', { key: 'Enter' })
    const emitted = wrapper.emitted('select') as Array<[TxSearchSelectOption]> | undefined
    expect(emitted?.[0][0].value).toBe('b')
  })

  it('closes the panel on Escape (#8)', async () => {
    const wrapper = mount(TxSearchSelect, {
      props: { options },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    const input = wrapper.find('input')
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(input.attributes('aria-expanded')).toBe('true')

    await input.trigger('keydown', { key: 'Escape' })
    expect(input.attributes('aria-expanded')).toBe('false')
  })
})
