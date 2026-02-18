import type { TxSearchSelectOption } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
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

  it('renders empty state when no results match', async () => {
    const wrapper = mount(TxSearchSelect, {
      props: { options: [] },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    const input = wrapper.find('input')
    await input.setValue('zzz')

    expect(wrapper.find('.tx-search-select__empty').exists()).toBe(true)
  })
})
