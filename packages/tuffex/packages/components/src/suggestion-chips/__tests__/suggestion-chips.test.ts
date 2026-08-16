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

  describe('list layout', () => {
    it('stays a plain chip row by default', () => {
      const wrapper = mount(TxSuggestionChips, { props: { suggestions } })
      expect(wrapper.find('.tx-suggestion-chips').classes()).not.toContain('is-list')
      expect(wrapper.find('.tx-suggestion-chips__glyph').exists()).toBe(false)
      expect(wrapper.find('.tx-suggestion-chips__chip').attributes('style')).toBeUndefined()
    })

    it('stacks the rows and leads each with the return glyph', () => {
      const wrapper = mount(TxSuggestionChips, { props: { suggestions, layout: 'list' } })
      expect(wrapper.find('.tx-suggestion-chips').classes()).toContain('is-list')
      expect(wrapper.findAll('.tx-suggestion-chips__glyph')).toHaveLength(2)
    })

    it('staggers each row by its position', () => {
      const wrapper = mount(TxSuggestionChips, { props: { suggestions, layout: 'list' } })
      const chips = wrapper.findAll('.tx-suggestion-chips__chip')
      expect(chips[0]!.attributes('style')).toContain('--tx-suggestion-chips-index: 0')
      expect(chips[1]!.attributes('style')).toContain('--tx-suggestion-chips-index: 1')
    })

    it('still emits the full suggestion on select', async () => {
      const wrapper = mount(TxSuggestionChips, { props: { suggestions, layout: 'list' } })
      await wrapper.findAll('.tx-suggestion-chips__chip')[1]!.trigger('click')
      expect(wrapper.emitted('select')).toEqual([[suggestions[1]]])
    })
  })
})
