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

  it('references the active option via aria-activedescendant and names the listbox', async () => {
    const wrapper = mountSelect({ modelValue: 'json' })
    const trigger = wrapper.find('.tx-flat-select__trigger')
    const dropdown = wrapper.find('.tx-flat-select__dropdown')
    const items = wrapper.findAll('.tx-flat-select-item')

    // Every option now carries a stable id (pre-fix they had none, so the trigger
    // could not reference the highlighted option at all).
    expect(items[0].attributes('id')).toBeTruthy()
    // The listbox takes its accessible name from the placeholder.
    expect(dropdown.attributes('aria-label')).toBe('Select format')
    // Closed: nothing is active.
    expect(trigger.attributes('aria-activedescendant')).toBeUndefined()

    await trigger.trigger('click')
    // Open: the combobox points at the selected option's id while focus stays on it.
    expect(trigger.attributes('aria-activedescendant')).toBe(items[0].attributes('id'))
  })

  it('resets to the placeholder when the value is cleared externally', async () => {
    // Regression: selectedLabel was only overwritten on a matching value, so
    // clearing v-model back to '' left the previous label stranded.
    const wrapper = mountSelect({ modelValue: 'json' })
    await nextTick()

    expect(wrapper.find('.tx-flat-select__text').text()).toBe('JSON')
    expect(wrapper.find('.tx-flat-select__text').classes()).not.toContain('is-placeholder')

    await wrapper.setProps({ modelValue: '' })

    expect(wrapper.find('.tx-flat-select__text').text()).toBe('Select format')
    expect(wrapper.find('.tx-flat-select__text').classes()).toContain('is-placeholder')
  })

  it('uses default slot text as the trigger label when no label prop is given', async () => {
    // Regression: handleClick/registerItem built the label from
    // `label || value`, ignoring the default slot the docs say overrides it.
    const wrapper = mount(TxFlatSelect, {
      props: {
        modelValue: '',
        placeholder: 'Select format',
      },
      slots: {
        default: '<TxFlatSelectItem value="signed"><span>Digitally Signed</span></TxFlatSelectItem>',
      },
      global: {
        components: {
          TxFlatSelectItem,
        },
      },
    })
    await nextTick()

    await wrapper.find('.tx-flat-select__trigger').trigger('click')
    await wrapper.find('.tx-flat-select-item').trigger('click')

    expect(wrapper.find('.tx-flat-select__text').text()).toBe('Digitally Signed')
  })

  it('reopens on a trigger click during the closing animation instead of dropping it', async () => {
    // Fake only the settle timer so the synchronous rAF stub from beforeEach stays intact.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const wrapper = mountSelect()
      const trigger = wrapper.find('.tx-flat-select__trigger')

      await trigger.trigger('click') // open
      expect(wrapper.classes()).toContain('is-open')

      await trigger.trigger('click') // begin close (200ms settle)
      await trigger.trigger('click') // click mid-close should re-open, not re-close

      vi.advanceTimersByTime(250)
      await nextTick()

      expect(wrapper.classes()).toContain('is-open')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('clears the pending close timer on unmount so it cannot fire on a dead component', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const wrapper = mountSelect()
      const trigger = wrapper.find('.tx-flat-select__trigger')

      await trigger.trigger('click') // open
      await trigger.trigger('click') // begin close → schedules the settle timer

      const before = vi.getTimerCount()
      expect(before).toBeGreaterThanOrEqual(1)

      wrapper.unmount()
      expect(vi.getTimerCount()).toBe(before - 1)
    }
    finally {
      vi.useRealTimers()
    }
  })
})
