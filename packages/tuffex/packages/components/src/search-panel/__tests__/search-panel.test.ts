import type { SearchPanelItem } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxSearchPanel from '../src/TxSearchPanel.vue'

const items: SearchPanelItem[] = [
  { id: 'a', label: 'Forecast summer demand' },
  { id: 'b', label: 'Find waffle cone suppliers', keywords: ['vendor'] },
  { id: 'c', label: 'Compare seasonal flavors' },
  { id: 'd', label: 'Draft flavor launch plan' },
  { id: 'e', label: 'Check cold-chain status' },
  { id: 'f', label: 'Audit sugar costs' },
  { id: 'g', label: 'Retire low sellers' },
]

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(TxSearchPanel, { props: { items, ...props }, attachTo: document.body })
}

describe('txSearchPanel', () => {
  it('shows a shortlist with an empty query and filters as the query grows', async () => {
    const wrapper = mountPanel()
    expect(wrapper.findAll('.tx-bui-search-panel__option')).toHaveLength(5)

    await wrapper.setProps({ modelValue: 'flavor' })
    const labels = wrapper.findAll('.tx-bui-search-panel__option').map(el => el.text())
    expect(labels).toEqual(['Compare seasonal flavors', 'Draft flavor launch plan'])
  })

  it('matches keywords as well as the label, and honours a custom filter', async () => {
    const wrapper = mountPanel({ modelValue: 'vendor' })
    expect(wrapper.findAll('.tx-bui-search-panel__option').map(el => el.text()))
      .toEqual(['Find waffle cone suppliers'])

    await wrapper.setProps({ filter: (list: SearchPanelItem[]) => list.slice(0, 2) })
    expect(wrapper.findAll('.tx-bui-search-panel__option')).toHaveLength(2)
  })

  it('emits the query on both channels and clears on demand', async () => {
    const wrapper = mountPanel({ modelValue: 'audit' })

    await wrapper.find('.tx-bui-search-panel__input').setValue('sugar')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['sugar'])
    expect(wrapper.emitted('queryChange')![0]).toEqual(['sugar'])

    await wrapper.find('.tx-bui-search-panel__clear').trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([''])
  })

  it('renders the empty state only past the threshold', async () => {
    const wrapper = mountPanel({ modelValue: 'zz' })
    // Two characters: blank list, no "no results" flash mid-word.
    expect(wrapper.find('.tx-bui-search-panel__empty').exists()).toBe(false)
    expect(wrapper.findAll('.tx-bui-search-panel__option')).toHaveLength(0)

    await wrapper.setProps({ modelValue: 'zzz' })
    expect(wrapper.find('.tx-bui-search-panel__empty').exists()).toBe(true)
    expect(wrapper.find('.tx-bui-search-panel__empty').text()).toContain('No results found')
    expect(wrapper.find('.tx-bui-search-panel__empty').text()).toContain('Adjust your search to try again')
  })

  it('exposes the combobox/listbox contract', async () => {
    const wrapper = mountPanel({ placeholder: 'Search flavors…' })
    const input = wrapper.find('.tx-bui-search-panel__input')

    expect(input.attributes('role')).toBe('combobox')
    expect(input.attributes('aria-autocomplete')).toBe('list')
    expect(input.attributes('aria-expanded')).toBe('true')
    expect(input.attributes('aria-label')).toBe('Search flavors…')

    const listId = wrapper.find('.tx-bui-search-panel__list').attributes('id')
    expect(input.attributes('aria-controls')).toBe(listId)
    expect(wrapper.find('.tx-bui-search-panel__list').attributes('role')).toBe('listbox')

    const options = wrapper.findAll('.tx-bui-search-panel__option')
    expect(options[0]!.attributes('role')).toBe('option')
    expect(options[0]!.attributes('aria-selected')).toBe('true')
    // Options stay out of the tab order — focus lives in the combobox.
    expect(options[0]!.attributes('tabindex')).toBe('-1')
    expect(input.attributes('aria-activedescendant')).toBe(options[0]!.attributes('id'))
  })

  it('moves the active option with the arrow keys and wraps at both ends', async () => {
    const wrapper = mountPanel()
    const input = wrapper.find('.tx-bui-search-panel__input')
    const activeLabel = () => wrapper.find('.tx-bui-search-panel__option.is-active').text()

    expect(activeLabel()).toBe('Forecast summer demand')

    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(activeLabel()).toBe('Find waffle cone suppliers')

    await input.trigger('keydown', { key: 'ArrowUp' })
    await input.trigger('keydown', { key: 'ArrowUp' })
    // Wraps backwards to the last of the five shown.
    expect(activeLabel()).toBe('Check cold-chain status')

    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(activeLabel()).toBe('Forecast summer demand')

    await input.trigger('keydown', { key: 'End' })
    expect(activeLabel()).toBe('Check cold-chain status')

    await input.trigger('keydown', { key: 'Home' })
    expect(activeLabel()).toBe('Forecast summer demand')
  })

  it('skips disabled rows while navigating and refuses to select them', async () => {
    const wrapper = mountPanel({
      items: [
        { id: 'a', label: 'First' },
        { id: 'b', label: 'Blocked', disabled: true },
        { id: 'c', label: 'Third' },
      ],
    })
    const input = wrapper.find('.tx-bui-search-panel__input')

    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.find('.tx-bui-search-panel__option.is-active').text()).toBe('Third')

    await wrapper.findAll('.tx-bui-search-panel__option')[1]!.trigger('click')
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('selects the active option on Enter and reports clicks, without rewriting the query', async () => {
    const wrapper = mountPanel()
    const input = wrapper.find('.tx-bui-search-panel__input')

    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('select')![0]![0]).toMatchObject({ id: 'b' })

    await wrapper.findAll('.tx-bui-search-panel__option')[2]!.trigger('click')
    expect(wrapper.emitted('select')![1]![0]).toMatchObject({ id: 'c' })
    // Upstream writes the label back into the field; selecting must not.
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('ignores Enter while an IME is composing', async () => {
    const wrapper = mountPanel()
    const input = wrapper.find('.tx-bui-search-panel__input')

    await input.trigger('keydown', { key: 'Enter', isComposing: true })
    expect(wrapper.emitted('select')).toBeUndefined()

    await input.trigger('compositionstart')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('select')).toBeUndefined()

    await input.trigger('compositionend')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('select')).toHaveLength(1)
  })

  it('clears on Escape only when there is something to clear', async () => {
    const empty = mountPanel()
    await empty.find('.tx-bui-search-panel__input').trigger('keydown', { key: 'Escape' })
    expect(empty.emitted('clear')).toBeUndefined()

    const filled = mountPanel({ modelValue: 'audit' })
    await filled.find('.tx-bui-search-panel__input').trigger('keydown', { key: 'Escape' })
    expect(filled.emitted('clear')).toHaveLength(1)
    expect(filled.emitted('update:modelValue')!.at(-1)).toEqual([''])
  })

  it('reserves its height and exposes focus/clear', () => {
    const wrapper = mountPanel({ minHeight: 300 })
    expect(wrapper.find('.tx-bui-search-panel').attributes('style'))
      .toContain('--tx-bui-search-panel-min-height: 300px')

    wrapper.vm.focus()
    expect(document.activeElement).toBe(wrapper.find('.tx-bui-search-panel__input').element)
  })
})
