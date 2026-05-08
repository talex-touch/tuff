import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxFlatSelect from '../src/TxFlatSelect.vue'
import TxFlatSelectItem from '../src/TxFlatSelectItem.vue'

function mountSelect(props: Record<string, unknown> = {}) {
  return mount(TxFlatSelect, {
    props: {
      modelValue: '',
      placeholder: 'Select format',
      ...props,
    },
    slots: {
      default: [
        '<TxFlatSelectItem value="json" label="JSON" />',
        '<TxFlatSelectItem value="csv" label="CSV" disabled />',
        '<TxFlatSelectItem value="xml" label="XML" />',
      ].join(''),
    },
    global: {
      components: {
        TxFlatSelectItem,
      },
    },
  })
}

describe('txFlatSelect', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders placeholder and selection labels', async () => {
    const wrapper = mountSelect()

    expect(wrapper.find('.tx-flat-select__text').text()).toBe('Select format')
    expect(wrapper.find('.tx-flat-select__text').classes()).toContain('is-placeholder')

    await wrapper.setProps({ modelValue: 'json' })
    expect(wrapper.find('.tx-flat-select__text').text()).toBe('JSON')
    expect(wrapper.find('.tx-flat-select__text').classes()).not.toContain('is-placeholder')
  })

  it('emits updates when an enabled item is selected', async () => {
    const wrapper = mountSelect()

    await wrapper.find('.tx-flat-select__trigger').trigger('click')
    await wrapper.findAll('.tx-flat-select-item')[2].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['xml'])
    expect(wrapper.emitted('change')?.[0]).toEqual(['xml'])
    expect(wrapper.find('.tx-flat-select__text').text()).toBe('XML')
  })

  it('blocks disabled group and item selection', async () => {
    const disabledWrapper = mountSelect({ disabled: true })
    await disabledWrapper.find('.tx-flat-select__trigger').trigger('click')
    expect(disabledWrapper.find('.tx-flat-select__dropdown').classes()).not.toContain('is-visible')

    const wrapper = mountSelect()
    await wrapper.find('.tx-flat-select__trigger').trigger('click')
    await wrapper.findAll('.tx-flat-select-item')[1].trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.find('.tx-flat-select__text').text()).toBe('Select format')
  })

  it('skips disabled items during keyboard navigation', async () => {
    const wrapper = mountSelect({ modelValue: 'json' })

    await wrapper.find('.tx-flat-select__trigger').trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['xml'])
    expect(wrapper.find('.tx-flat-select__text').text()).toBe('XML')
  })

  it('exposes combobox and option state', async () => {
    const wrapper = mountSelect({ modelValue: 'json' })
    const trigger = wrapper.find('.tx-flat-select__trigger')
    const dropdown = wrapper.find('.tx-flat-select__dropdown')
    const items = wrapper.findAll('.tx-flat-select-item')

    expect(trigger.attributes('role')).toBe('combobox')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(trigger.attributes('aria-controls')).toBe(dropdown.attributes('id'))
    expect(dropdown.attributes('role')).toBe('listbox')
    expect(dropdown.attributes('aria-hidden')).toBe('true')
    expect(items[0].attributes('role')).toBe('option')
    expect(items[0].attributes('aria-selected')).toBe('true')
    expect(items[1].attributes('aria-selected')).toBe('false')

    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(dropdown.attributes('aria-hidden')).toBe('false')
  })
})
