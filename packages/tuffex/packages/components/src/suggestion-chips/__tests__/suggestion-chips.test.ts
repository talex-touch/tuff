import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxSuggestionChips from '../src/TxSuggestionChips.vue'

const suggestions = [
  { id: 'a', text: '再给一个例子' },
  { id: 'b', text: 'Explain in English' },
]

describe('txSuggestionChips', () => {
  it('renders one button per suggestion', () => {
    const wrapper = mount(TxSuggestionChips, { props: { suggestions } })
    const chips = wrapper.findAll('.tx-suggestion-chips__chip')
    expect(chips).toHaveLength(2)
    expect(chips[0]!.text()).toBe('再给一个例子')
  })

  it('emits the full suggestion on select', async () => {
    const wrapper = mount(TxSuggestionChips, { props: { suggestions } })
    await wrapper.findAll('.tx-suggestion-chips__chip')[1]!.trigger('click')

    expect(wrapper.emitted('select')).toEqual([[suggestions[1]]])
  })

  it('renders nothing at all for an empty list', () => {
    const wrapper = mount(TxSuggestionChips, { props: { suggestions: [] } })
    expect(wrapper.find('.tx-suggestion-chips').exists()).toBe(false)
  })
})
