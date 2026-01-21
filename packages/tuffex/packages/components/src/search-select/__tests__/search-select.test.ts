import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@floating-ui/vue', () => ({
  autoUpdate: () => () => {},
  flip: () => ({}),
  offset: () => ({}),
  shift: () => ({}),
  size: () => ({}),
  useFloating: () => ({ floatingStyles: {}, update: () => {} }),
}))

import TxSearchSelect from '../src/TxSearchSelect.vue'

describe('txSearchSelect', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ]

  it('filters and selects options', async () => {
    const wrapper = mount(TxSearchSelect, {
      props: { options },
      global: { stubs: { Teleport: true } },
    })

    const input = wrapper.find('input')
    await input.setValue('Alpha')

    const items = wrapper.findAll('.tx-search-select__item')
    const alpha = items.find(item => item.text().includes('Alpha'))
    await alpha?.trigger('click')

    const emitted = wrapper.emitted('select')
    expect(emitted?.[0][0].value).toBe('a')
  })

  it('renders empty state when no results match', async () => {
    const wrapper = mount(TxSearchSelect, {
      props: { options: [] },
      global: { stubs: { Teleport: true } },
    })

    const input = wrapper.find('input')
    await input.setValue('zzz')

    expect(wrapper.find('.tx-search-select__empty').exists()).toBe(true)
  })
})
